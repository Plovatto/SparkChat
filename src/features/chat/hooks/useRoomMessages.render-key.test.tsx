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


beforeEach(() => {
  vi.useFakeTimers();
  fakeSocket.emit.mockClear();
  fakeSocket.handlers.clear();
});

afterEach(() => {
  vi.useRealTimers();
});
describe('useRoomMessages render key', () => {
  it('keeps the optimistic key when the server confirms a sent message so the bubble is not remounted', () => {
    const { result } = renderRoom([message('m1')]);

    act(() => {
      result.current.sendMessage({ content: 'olá', type: 'text' });
    });
    const optimistic = result.current.messages[1];
    expect(optimistic?.pending).toBe(true);
    const clientTempId = optimistic?.clientTempId;

    act(() => {
      trigger('message:new', { ...message('server-id', { sender: ME, content: 'olá' }), clientTempId });
    });

    const confirmed = result.current.messages[1];
    expect(confirmed?.id).toBe('server-id');
    expect(confirmed?.pending).toBeUndefined();
    expect(confirmed?.renderKey).toBe(optimistic?.id);
  });

  it('does not add a render key to messages received from other people', () => {
    const { result } = renderRoom([]);
    act(() => {
      trigger('message:new', message('m2'));
    });
    expect(result.current.messages[0]?.renderKey).toBeUndefined();
  });
});
