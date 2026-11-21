import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MessageView } from '@lib/socket';

type Handler = (payload: never) => void;

class FakeSocket {
  handlers = new Map<string, Set<Handler>>();
  emitted: { event: string; payload: unknown }[] = [];

  on(event: string, handler: Handler) {
    const bucket = this.handlers.get(event) ?? new Set<Handler>();
    bucket.add(handler);
    this.handlers.set(event, bucket);
    return this;
  }

  off(event: string, handler: Handler) {
    this.handlers.get(event)?.delete(handler);
    return this;
  }

  emit(event: string, payload?: unknown) {
    this.emitted.push({ event, payload });
    return this;
  }

  fire(event: string, payload: unknown) {
    for (const handler of this.handlers.get(event) ?? []) {
      handler(payload as never);
    }
  }

  sent(event: string) {
    return this.emitted.filter((entry) => entry.event === event).map((entry) => entry.payload);
  }
}

const socketState = vi.hoisted(() => ({ socket: null as FakeSocket | null }));

vi.mock('@lib/socket', () => ({
  useSocket: () => ({ socket: socketState.socket, connected: true }),
  markPreviewOnlyHandler: <T,>(handler: T) => handler,
}));

vi.mock('@lib/e2ee', () => ({
  isEncryptedMediaUrl: () => false,
  subscribeRoomKeyAvailable: () => () => undefined,
}));

vi.mock('@lib/translation', () => ({
  forgetTranslation: vi.fn(),
}));

const { useRoomMessages } = await import('./useRoomMessages');

const ROOM = 'room-1';
const ME = { id: 'me', nickname: 'Eu', avatar: 0 };

function message(id: string, minute: number, senderId = 'other'): MessageView {
  return {
    id,
    roomId: ROOM,
    sender: { id: senderId, nickname: senderId, avatar: 0 },
    content: id,
    type: 'text',
    duration: null,
    timestamp: new Date(Date.UTC(2026, 10, 20, 12, minute)).toISOString(),
    deletedForEveryone: false,
    status: 'read',
    deliveredTo: [],
    readBy: [ME.id],
    playedBy: [],
    replyTo: null,
    mentionedUserIds: [],
    fileMeta: null,
    caption: null,
    linkPreview: null,
  };
}

let socket: FakeSocket;

function renderLoaded(initial: MessageView[]) {
  const hook = renderHook(() => useRoomMessages(ROOM, ME));
  act(() => {
    socket.fire('messages:list', { roomId: ROOM, messages: initial, hasMore: false });
  });
  return hook;
}

function ids(result: { current: { messages: { id: string }[] } }) {
  return result.current.messages.map((entry) => entry.id);
}

beforeEach(() => {
  vi.useFakeTimers();
  socket = new FakeSocket();
  socketState.socket = socket;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useRoomMessages hiding', () => {
  it('removes the messages optimistically with an exit phase and asks the server to hide them', () => {
    const { result } = renderLoaded([message('a', 1), message('b', 2, ME.id), message('c', 3)]);

    act(() => result.current.hideMessages(['b', 'c']));

    expect(socket.sent('message:hide')).toEqual([{ messageIds: ['b', 'c'] }]);
    expect(result.current.messages.filter((entry) => entry.exiting).map((entry) => entry.id)).toEqual(['b', 'c']);

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(ids(result)).toEqual(['a']);

    act(() => socket.fire('message:hidden', { roomId: ROOM, messageIds: ['b', 'c'], lastMessage: null, unreadCount: 0, mentionCount: 0 }));
    act(() => {
      vi.advanceTimersByTime(20000);
    });
    expect(ids(result)).toEqual(['a']);
    expect(result.current.hideFailure).toBeNull();
  });

  it('puts the messages back in order when the server rejects the hide', () => {
    const { result } = renderLoaded([message('a', 1), message('b', 2), message('c', 3)]);

    act(() => result.current.hideMessages(['b']));
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(ids(result)).toEqual(['a', 'c']);

    act(() => socket.fire('error', { message: 'x', code: 'message.notFound', event: 'message:hide' }));

    expect(ids(result)).toEqual(['a', 'b', 'c']);
    expect(result.current.messages.every((entry) => !entry.exiting)).toBe(true);
    expect(result.current.hideFailure).not.toBeNull();
    act(() => result.current.dismissHideFailure());
    expect(result.current.hideFailure).toBeNull();
  });

  it('rolls back when the server never confirms, like an older server without the event', () => {
    const { result } = renderLoaded([message('a', 1), message('b', 2)]);

    act(() => result.current.hideMessages(['a']));
    act(() => {
      vi.advanceTimersByTime(9000);
    });
    expect(ids(result)).toEqual(['b']);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(ids(result)).toEqual(['a', 'b']);
    expect(result.current.hideFailure).not.toBeNull();
  });

  it('ignores errors from other events', () => {
    const { result } = renderLoaded([message('a', 1), message('b', 2)]);
    act(() => result.current.hideMessages(['a']));
    act(() => socket.fire('error', { message: 'x', code: 'message.deleteForbidden', event: 'message:delete' }));
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(ids(result)).toEqual(['b']);
    expect(result.current.hideFailure).toBeNull();
  });

  it('splits large selections in batches of one hundred', () => {
    const many = Array.from({ length: 150 }, (_, index) => message(`m${index}`, index));
    const { result } = renderLoaded(many);

    act(() => result.current.hideMessages(many.map((entry) => entry.id)));

    const batches = socket.sent('message:hide') as { messageIds: string[] }[];
    expect(batches.map((batch) => batch.messageIds.length)).toEqual([100, 50]);
  });

  it('removes messages hidden from another device of the same user', () => {
    const { result } = renderLoaded([message('a', 1), message('b', 2)]);

    act(() => socket.fire('message:hidden', { roomId: ROOM, messageIds: ['a'] }));
    expect(result.current.messages.find((entry) => entry.id === 'a')?.exiting).toBe(true);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(ids(result)).toEqual(['b']);
    expect(socket.sent('message:hide')).toEqual([]);
  });

  it('ignores hidden events for other rooms', () => {
    const { result } = renderLoaded([message('a', 1)]);
    act(() => socket.fire('message:hidden', { roomId: 'other-room', messageIds: ['a'] }));
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(ids(result)).toEqual(['a']);
  });

  it('keeps a pending hide out of a refreshed page', () => {
    const { result } = renderLoaded([message('a', 1), message('b', 2)]);
    act(() => result.current.hideMessages(['b']));
    act(() => {
      vi.advanceTimersByTime(300);
    });

    act(() => socket.fire('user:resumed', {}));
    act(() => socket.fire('messages:list', { roomId: ROOM, messages: [message('a', 1), message('b', 2)], hasMore: false }));

    expect(ids(result)).toEqual(['a']);
  });

  it('rolls back exactly the request named in the error and leaves a concurrent hide alone', () => {
    const { result } = renderLoaded([message('a', 1), message('b', 2), message('c', 3)]);

    act(() => result.current.hideMessages(['a']));
    act(() => result.current.hideMessages(['b']));
    act(() => socket.fire('error', { message: 'x', code: 'message.notFound', event: 'message:hide', messageIds: ['b'] }));

    expect(result.current.messages.find((entry) => entry.id === 'a')?.exiting).toBe(true);
    expect(result.current.messages.find((entry) => entry.id === 'b')?.exiting).toBe(false);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(ids(result)).toEqual(['b', 'c']);
    expect(result.current.hideFailure).toEqual({ code: 'message.notFound' });
  });

  it('ignores an error naming ids that no pending hide asked for', () => {
    const { result } = renderLoaded([message('a', 1), message('b', 2)]);
    act(() => result.current.hideMessages(['a']));
    act(() => socket.fire('error', { message: 'x', code: 'message.notFound', event: 'message:hide', messageIds: ['zzz'] }));
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(ids(result)).toEqual(['b']);
    expect(result.current.hideFailure).toBeNull();
  });

  it('keeps a message leaving the list when it is updated meanwhile', () => {
    const { result } = renderLoaded([message('a', 1), message('b', 2)]);
    act(() => result.current.hideMessages(['a']));
    act(() => socket.fire('message:updated', { ...message('a', 1), playedBy: ['x'] }));
    expect(result.current.messages.find((entry) => entry.id === 'a')).toMatchObject({ exiting: true, playedBy: ['x'] });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(ids(result)).toEqual(['b']);
  });

  it('restores a message deleted for everyone meanwhile with its deleted state', () => {
    const { result } = renderLoaded([message('a', 1), message('b', 2)]);
    act(() => result.current.hideMessages(['a']));
    act(() => {
      vi.advanceTimersByTime(300);
    });
    act(() => socket.fire('message:deleted', { messageId: 'a', roomId: ROOM }));
    act(() => socket.fire('error', { message: 'x', code: 'internal.unexpected', event: 'message:hide', messageIds: ['a'] }));

    expect(result.current.messages[0]).toMatchObject({ id: 'a', deletedForEveryone: true, content: '' });
  });

  it('drops messages a reloaded page no longer returns, as when a hide happened while offline', () => {
    const { result } = renderLoaded([message('a', 1), message('b', 2), message('c', 3), message('d', 4)]);
    act(() => {
      socket.fire('message:new', message('live', 6));
    });
    act(() => {
      result.current.sendMessage({ content: 'local', type: 'text' });
    });

    act(() => socket.fire('user:resumed', {}));
    act(() => socket.fire('messages:list', { roomId: ROOM, messages: [message('a', 1), message('c', 3), message('d', 4)], hasMore: true }));

    expect(ids(result).slice(0, 4)).toEqual(['a', 'c', 'd', 'live']);
    expect(result.current.messages.some((entry) => entry.pending)).toBe(true);
  });

  it('clears everything but unsent messages when the reloaded page comes back empty', () => {
    const { result } = renderLoaded([message('a', 1), message('b', 2)]);
    act(() => socket.fire('user:resumed', {}));
    act(() => socket.fire('messages:list', { roomId: ROOM, messages: [], hasMore: false }));
    expect(ids(result)).toEqual([]);
  });
});
