import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MessageView } from '@lib/socket';

type Handler = (payload: unknown) => void;

const fakeSocket = vi.hoisted(() => {
  const handlers = new Map<string, Set<(payload: unknown) => void>>();
  return {
    handlers,
    emit: vi.fn(),
    on(event: string, handler: (payload: unknown) => void) {
      const bucket = handlers.get(event) ?? new Set();
      bucket.add(handler);
      handlers.set(event, bucket);
    },
    off(event: string, handler: (payload: unknown) => void) {
      handlers.get(event)?.delete(handler);
    },
  };
});

vi.mock('@lib/socket', () => ({
  useSocket: () => ({ socket: fakeSocket, connected: true }),
  markPreviewOnlyHandler: <T,>(handler: T) => handler,
}));

vi.mock('@lib/e2ee', () => ({
  isEncryptedMediaUrl: () => false,
  subscribeRoomKeyAvailable: () => () => undefined,
}));

import { useRoomMessages } from './useRoomMessages';

const ROOM_ID = 'room-1';
const ME = { id: 'me', nickname: 'Eu', avatar: 1 };

function trigger(event: string, payload: unknown): void {
  for (const handler of [...(fakeSocket.handlers.get(event) ?? [])] as Handler[]) {
    handler(payload);
  }
}

function message(id: string, overrides: Partial<MessageView> = {}): MessageView {
  return {
    id,
    roomId: ROOM_ID,
    sender: { id: 'friend', nickname: 'Amiga', avatar: 2 },
    content: 'oi',
    type: 'text',
    duration: null,
    timestamp: '2026-11-20T10:00:00.000Z',
    deletedForEveryone: false,
    status: 'read',
    deliveredTo: [],
    readBy: [],
    playedBy: [],
    replyTo: null,
    mentionedUserIds: [],
    fileMeta: null,
    caption: null,
    linkPreview: null,
    reactions: [],
    ...overrides,
  };
}

function renderRoom(messages: MessageView[]) {
  const hook = renderHook(() => useRoomMessages(ROOM_ID, ME));
  act(() => {
    trigger('messages:list', { roomId: ROOM_ID, messages, hasMore: false });
  });
  return hook;
}

function reactionsOf(result: { current: ReturnType<typeof useRoomMessages> }, id: string) {
  return result.current.messages.find((entry) => entry.id === id)?.reactions?.map((reaction) => [reaction.userId, reaction.emoji]);
}

beforeEach(() => {
  vi.useFakeTimers();
  fakeSocket.emit.mockClear();
  fakeSocket.handlers.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useRoomMessages reactions', () => {
  it('applies a reaction optimistically and keeps it when the server confirms', () => {
    const { result } = renderRoom([message('m1', { reactions: [{ userId: 'friend', emoji: '😂', updatedAt: 't0' }] })]);

    act(() => result.current.reactToMessage('m1', '❤️'));

    expect(fakeSocket.emit).toHaveBeenCalledWith('message:react', { roomId: ROOM_ID, messageId: 'm1', emoji: '❤️' });
    expect(reactionsOf(result, 'm1')).toEqual([
      ['friend', '😂'],
      ['me', '❤️'],
    ]);

    act(() =>
      trigger('message:reactions-updated', {
        roomId: ROOM_ID,
        messageId: 'm1',
        reactions: [
          { userId: 'friend', emoji: '😂', updatedAt: 't0' },
          { userId: 'me', emoji: '❤️', updatedAt: 't1' },
        ],
      }),
    );
    act(() => {
      vi.advanceTimersByTime(20000);
    });

    expect(reactionsOf(result, 'm1')).toEqual([
      ['friend', '😂'],
      ['me', '❤️'],
    ]);
  });

  it('rolls back when the server rejects the reaction', () => {
    const { result } = renderRoom([message('m1', { reactions: [{ userId: 'me', emoji: '👍', updatedAt: 't0' }] })]);

    act(() => result.current.reactToMessage('m1', null));
    expect(reactionsOf(result, 'm1')).toEqual([]);

    expect(result.current.reactionFailure).toBe('');
    act(() => trigger('error', { message: 'nope', code: 'message.reactionUnavailable', event: 'message:react', messageId: 'm1' }));

    expect(reactionsOf(result, 'm1')).toEqual([['me', '👍']]);
    expect(result.current.reactionFailure).not.toBe('');
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.reactionFailure).toBe('');
  });

  it('rolls back when the server never answers, as an older server would', () => {
    const { result } = renderRoom([message('m1')]);

    act(() => result.current.reactToMessage('m1', '🙏'));
    expect(reactionsOf(result, 'm1')).toEqual([['me', '🙏']]);

    act(() => {
      vi.advanceTimersByTime(10001);
    });

    expect(reactionsOf(result, 'm1')).toEqual([]);
    expect(result.current.reactionFailure).not.toBe('');
  });

  it('keeps the pending reaction on top of updates from other people and rolls back to the latest server state', () => {
    const { result } = renderRoom([message('m1')]);

    act(() => result.current.reactToMessage('m1', '❤️'));
    act(() =>
      trigger('message:reactions-updated', { roomId: ROOM_ID, messageId: 'm1', reactions: [{ userId: 'friend', emoji: '😮', updatedAt: 't1' }] }),
    );
    expect(reactionsOf(result, 'm1')).toEqual([
      ['friend', '😮'],
      ['me', '❤️'],
    ]);

    act(() => trigger('error', { message: 'nope', event: 'message:react', messageId: 'm1' }));
    expect(reactionsOf(result, 'm1')).toEqual([['friend', '😮']]);
  });

  it('follows reactions made on another device and clears them when the message is deleted', () => {
    const { result } = renderRoom([message('m1'), message('m2')]);

    act(() =>
      trigger('message:reactions-updated', { roomId: ROOM_ID, messageId: 'm2', reactions: [{ userId: 'me', emoji: '😢', updatedAt: 't1' }] }),
    );
    expect(reactionsOf(result, 'm2')).toEqual([['me', '😢']]);
    expect(reactionsOf(result, 'm1')).toEqual([]);

    act(() => trigger('message:reactions-updated', { roomId: 'other-room', messageId: 'm1', reactions: [{ userId: 'x', emoji: '👍', updatedAt: 't' }] }));
    expect(reactionsOf(result, 'm1')).toEqual([]);

    act(() => trigger('message:deleted', { roomId: ROOM_ID, messageId: 'm2' }));
    expect(reactionsOf(result, 'm2')).toEqual([]);
  });

  it('keeps the pending reaction when another update of the message arrives', () => {
    const { result } = renderRoom([message('m1')]);

    act(() => result.current.reactToMessage('m1', '😂'));
    act(() => trigger('message:updated', message('m1', { playedBy: ['friend'], reactions: [] })));

    expect(reactionsOf(result, 'm1')).toEqual([['me', '😂']]);
    expect(result.current.messages[0]?.playedBy).toEqual(['friend']);
  });

  it('does not react to system, deleted or pending messages', () => {
    const { result } = renderRoom([message('s1', { type: 'system' }), message('d1', { deletedForEveryone: true })]);

    act(() => {
      result.current.reactToMessage('s1', '❤️');
      result.current.reactToMessage('d1', '❤️');
      result.current.reactToMessage('missing', '❤️');
    });

    expect(fakeSocket.emit).not.toHaveBeenCalledWith('message:react', expect.anything());
  });

  it('keeps a message usable when an older server sends it without reactions', () => {
    const legacy = message('m1');
    delete legacy.reactions;
    const { result } = renderRoom([legacy]);

    act(() => result.current.reactToMessage('m1', '👍'));
    expect(reactionsOf(result, 'm1')).toEqual([['me', '👍']]);
  });
});
