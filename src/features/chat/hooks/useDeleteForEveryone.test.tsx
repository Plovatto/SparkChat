import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

  sent() {
    return this.emitted.filter((entry) => entry.event === 'message:delete').map((entry) => entry.payload);
  }
}

const socketState = vi.hoisted(() => ({ socket: null as FakeSocket | null }));

vi.mock('@lib/socket', () => ({
  useSocket: () => ({ socket: socketState.socket }),
}));

const { useDeleteForEveryone } = await import('./useDeleteForEveryone');

let socket: FakeSocket;

beforeEach(() => {
  vi.useFakeTimers();
  socket = new FakeSocket();
  socketState.socket = socket;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useDeleteForEveryone', () => {
  it('keeps the single id payload for one message', () => {
    const { result } = renderHook(() => useDeleteForEveryone('room'));
    act(() => result.current.deleteForEveryone(['a']));
    expect(socket.sent()).toEqual([{ messageId: 'a' }]);
  });

  it('sends large selections as batches of one hundred instead of one event per message', () => {
    const { result } = renderHook(() => useDeleteForEveryone('room'));
    const ids = Array.from({ length: 140 }, (_, index) => `m${index}`);
    act(() => result.current.deleteForEveryone(ids));
    expect((socket.sent() as { messageIds: string[] }[]).map((payload) => payload.messageIds.length)).toEqual([100, 40]);
  });

  it('tells the user how many messages could not be deleted', () => {
    const { result } = renderHook(() => useDeleteForEveryone('room'));
    act(() => result.current.deleteForEveryone(['a', 'b']));
    act(() => socket.fire('error', { message: 'x', code: 'message.deleteForbidden', event: 'message:delete', messageIds: ['b'] }));
    expect(result.current.deleteFailure).toEqual({ count: 1, code: 'message.deleteForbidden' });
    act(() => result.current.dismissDeleteFailure());
    expect(result.current.deleteFailure).toBeNull();
  });

  it('falls back to paced single deletes when an older server rejects the batch payload', () => {
    const { result } = renderHook(() => useDeleteForEveryone('room'));
    act(() => result.current.deleteForEveryone(['a', 'b', 'c']));
    act(() => socket.fire('error', { message: 'x', code: 'validation.invalidPayload' }));
    expect(socket.sent()).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(socket.sent().slice(1)).toEqual([{ messageId: 'a' }, { messageId: 'b' }, { messageId: 'c' }]);
  });

  it('does not resend once the server confirmed every deletion', () => {
    const { result } = renderHook(() => useDeleteForEveryone('room'));
    act(() => result.current.deleteForEveryone(['a', 'b']));
    act(() => {
      socket.fire('message:deleted', { messageId: 'a', roomId: 'room' });
      socket.fire('message:deleted', { messageId: 'b', roomId: 'room' });
    });
    act(() => socket.fire('error', { message: 'x', code: 'validation.invalidPayload' }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(socket.sent()).toHaveLength(1);
  });
});
