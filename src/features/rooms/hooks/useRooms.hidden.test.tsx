import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MessageView, RoomSummary } from '@lib/socket';

type Handler = (payload: never) => void;

class FakeSocket {
  handlers = new Map<string, Set<Handler>>();

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

  emit() {
    return this;
  }

  fire(event: string, payload: unknown) {
    for (const handler of this.handlers.get(event) ?? []) {
      handler(payload as never);
    }
  }
}

const socketState = vi.hoisted(() => ({ socket: null as FakeSocket | null }));

vi.mock('@lib/socket', () => ({
  useSocket: () => ({ socket: socketState.socket }),
  markPreviewOnlyHandler: <T,>(handler: T) => handler,
}));

vi.mock('@lib/e2ee', () => ({
  getRoomName: () => null,
  subscribeRoomName: () => () => undefined,
}));

vi.mock('@lib/translation', () => ({
  clearTranslationsForRoom: vi.fn(),
}));

const { useRooms } = await import('./useRooms');

function message(id: string, minute = 0): MessageView {
  return {
    id,
    roomId: 'room-1',
    sender: { id: 'other', nickname: 'Outra', avatar: 0 },
    content: id,
    type: 'text',
    duration: null,
    timestamp: new Date(Date.UTC(2026, 10, 20, 12, minute)).toISOString(),
    deletedForEveryone: false,
    status: 'sent',
    deliveredTo: [],
    readBy: [],
    playedBy: [],
    replyTo: null,
    mentionedUserIds: [],
    fileMeta: null,
    caption: null,
    linkPreview: null,
  };
}

function room(lastMessage: MessageView | null): RoomSummary {
  return { id: 'room-1', type: 'private', participants: [], lastMessage, unreadCount: 3, mentionCount: 1 } as unknown as RoomSummary;
}

let socket: FakeSocket;

beforeEach(() => {
  socket = new FakeSocket();
  socketState.socket = socket;
});

describe('useRooms message:hidden', () => {
  it('replaces the preview and counts with the ones the server sends', () => {
    const { result } = renderHook(() => useRooms(null, 'me'));
    act(() => socket.fire('rooms:list', { rooms: [room(message('latest'))] }));

    act(() => socket.fire('message:hidden', { roomId: 'room-1', messageIds: ['latest'], lastMessage: message('previous'), unreadCount: 1, mentionCount: 0 }));

    expect(result.current.rooms[0]).toMatchObject({ lastMessage: { id: 'previous' }, unreadCount: 1, mentionCount: 0 });
  });

  it('clears the preview when the room has no visible message left', () => {
    const { result } = renderHook(() => useRooms(null, 'me'));
    act(() => socket.fire('rooms:list', { rooms: [room(message('only'))] }));

    act(() => socket.fire('message:hidden', { roomId: 'room-1', messageIds: ['only'], lastMessage: null, unreadCount: 0, mentionCount: 0 }));

    expect(result.current.rooms[0]).toMatchObject({ lastMessage: null, unreadCount: 0, mentionCount: 0 });
  });

  it('drops a hidden preview even when the payload carries no new preview', () => {
    const { result } = renderHook(() => useRooms(null, 'me'));
    act(() => socket.fire('rooms:list', { rooms: [room(message('latest'))] }));

    act(() => socket.fire('message:hidden', { roomId: 'room-1', messageIds: ['latest'] }));
    expect(result.current.rooms[0]).toMatchObject({ lastMessage: null, unreadCount: 3, mentionCount: 1 });

    act(() => socket.fire('rooms:list', { rooms: [room(message('kept'))] }));
    act(() => socket.fire('message:hidden', { roomId: 'room-1', messageIds: ['other'] }));
    expect(result.current.rooms[0]).toMatchObject({ lastMessage: { id: 'kept' } });
  });

  it('ignores a late reply when a newer message already took over the preview', () => {
    const { result } = renderHook(() => useRooms(null, 'me'));
    act(() => socket.fire('rooms:list', { rooms: [room(message('newest', 10))] }));

    act(() => socket.fire('message:hidden', { roomId: 'room-1', messageIds: ['old'], lastMessage: message('older', 5), unreadCount: 0, mentionCount: 0 }));

    expect(result.current.rooms[0]).toMatchObject({ lastMessage: { id: 'newest' }, unreadCount: 3, mentionCount: 1 });
  });
});
