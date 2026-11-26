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

beforeEach(() => {
  vi.useFakeTimers();
  socket = new FakeSocket();
  socketState.socket = socket;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useRoomMessages quick replies', () => {
  it('sends the button label as text with the quickReply payload', () => {
    const { result } = renderHook(() => useRoomMessages(ROOM, ME));
    act(() => {
      socket.fire('messages:list', { roomId: ROOM, messages: [message('card', 1)], hasMore: false });
    });

    act(() => result.current.sendMessage({ content: 'Aplicar', type: 'text', quickReply: { cardId: 'card', choice: 'yes' } }));

    const sent = socket.sent('message:send') as { content: string; quickReply?: unknown }[];
    expect(sent).toHaveLength(1);
    expect(sent[0]?.content).toBe('Aplicar');
    expect(sent[0]?.quickReply).toEqual({ cardId: 'card', choice: 'yes' });
  });

  it('marks the card message as resolved on message:card-resolved for this room only', () => {
    const { result } = renderHook(() => useRoomMessages(ROOM, ME));
    act(() => {
      socket.fire('messages:list', { roomId: ROOM, messages: [message('card', 1)], hasMore: false });
    });

    act(() => socket.fire('message:card-resolved', { roomId: 'other-room', cardId: 'card', choice: 'no' }));
    expect(result.current.messages[0]?.resolvedChoice).toBeUndefined();

    act(() => socket.fire('message:card-resolved', { roomId: ROOM, cardId: 'card', choice: 'yes' }));
    expect(result.current.messages[0]?.resolvedChoice).toBe('yes');
  });
});
