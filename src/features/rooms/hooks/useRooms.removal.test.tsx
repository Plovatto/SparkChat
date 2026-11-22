import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoomSummary } from '@lib/socket';

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
const { dismissGroupRemovalNotice, getGroupRemovalNotice } = await import('../utils/group-removal-notice');

function group(id: string, name: string): RoomSummary {
  return { id, type: 'group', name, participants: [], lastMessage: null, unreadCount: 0, mentionCount: 0 } as unknown as RoomSummary;
}

let socket: FakeSocket;

beforeEach(() => {
  socket = new FakeSocket();
  socketState.socket = socket;
  dismissGroupRemovalNotice();
});

describe('useRooms group removal notice', () => {
  it('drops the room and raises a notice naming the group when the user was removed', () => {
    const { result } = renderHook(() => useRooms(null, 'me'));
    act(() => socket.fire('rooms:list', { rooms: [group('g1', 'Amigos'), group('g2', 'Trabalho')] }));

    act(() => socket.fire('group:left', { roomId: 'g1', reason: 'removed' }));

    expect(result.current.rooms.map((candidate) => candidate.id)).toEqual(['g2']);
    expect(getGroupRemovalNotice()).toEqual({ roomName: 'Amigos' });
  });

  it('stays quiet when the user left the group on purpose', () => {
    const { result } = renderHook(() => useRooms(null, 'me'));
    act(() => socket.fire('rooms:list', { rooms: [group('g1', 'Amigos')] }));

    act(() => socket.fire('group:left', { roomId: 'g1' }));

    expect(result.current.rooms).toEqual([]);
    expect(getGroupRemovalNotice()).toBeNull();
  });
});
