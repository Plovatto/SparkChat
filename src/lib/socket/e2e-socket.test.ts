import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSocket } from './socket-client';
import type { RoomSummary } from './socket-events';

const identityState = vi.hoisted(() => ({
  current: null as { userId: string; publicKey: string; privateKey: Uint8Array } | null,
  listeners: new Set<(identity: unknown) => void>(),
}));

const establishPrivateRoomKey = vi.hoisted(() => vi.fn());

vi.mock('@lib/i18n/app-i18n', () => ({ translate: (key: string) => key }));

vi.mock('@lib/e2ee', () => ({
  decryptMessageView: (message: unknown) => Promise.resolve(message),
  decryptMessageViews: (messages: unknown) => Promise.resolve(messages),
  decryptRoomSummaries: (rooms: unknown) => Promise.resolve(rooms),
  decryptRoomSummary: (room: unknown) => Promise.resolve(room),
  encryptOutgoingMessage: (payload: unknown) => Promise.resolve(payload),
  ensureRoomKeyForDecryption: () => Promise.resolve(null),
  establishGroupRoomKeyOnCreate: vi.fn(),
  establishPrivateRoomKey,
  getCurrentIdentity: () => identityState.current,
  subscribeCurrentIdentity: (listener: (identity: unknown) => void) => {
    identityState.listeners.add(listener);
    return () => identityState.listeners.delete(listener);
  },
  handleGroupUserJoined: vi.fn(),
  handleIncomingRoomKeyPush: vi.fn(),
  handleKeyRequest: vi.fn(),
  MissingRoomKeyError: class extends Error {},
  requestGroupRoomKeyIfMissing: vi.fn(),
  trackRoomParticipants: vi.fn(),
}));

const { wrapSocketWithE2e } = await import('./e2e-socket');

type Handler = (payload: unknown) => void;

function createFakeSocket() {
  const handlers = new Map<string, Set<Handler>>();
  const socket = {
    on(event: string, handler: Handler) {
      const bucket = handlers.get(event) ?? new Set<Handler>();
      bucket.add(handler);
      handlers.set(event, bucket);
      return socket;
    },
    off(event: string, handler: Handler) {
      handlers.get(event)?.delete(handler);
      return socket;
    },
    emit: vi.fn(() => socket),
    close: vi.fn(() => socket),
    listeners: (event: string) => Array.from(handlers.get(event) ?? []),
  };
  const receive = (event: string, payload: unknown) => {
    for (const handler of Array.from(handlers.get(event) ?? [])) {
      handler(payload);
    }
  };
  return { socket: socket as unknown as AppSocket, receive };
}

function setIdentity(userId: string | null): void {
  identityState.current = userId ? { userId, publicKey: 'public', privateKey: new Uint8Array(32) } : null;
  for (const listener of Array.from(identityState.listeners)) {
    listener(identityState.current);
  }
}

const privateRoom = {
  id: 'room-1',
  type: 'private',
  participants: [
    { id: 'me', nickname: 'Me' },
    { id: 'assistant', nickname: 'SparkAI' },
  ],
} as unknown as RoomSummary;

describe('wrapSocketWithE2e room key setup', () => {
  beforeEach(() => {
    identityState.current = null;
    identityState.listeners.clear();
    establishPrivateRoomKey.mockClear();
  });

  it('establishes the key right away when the identity is ready', () => {
    setIdentity('me');
    const { socket, receive } = createFakeSocket();
    wrapSocketWithE2e(socket);

    receive('room:joined', { room: privateRoom, messages: [] });

    expect(establishPrivateRoomKey).toHaveBeenCalledWith(socket, privateRoom, 'me', true);
  });

  it('waits for the identity before establishing the key of a room created earlier', () => {
    const { socket, receive } = createFakeSocket();
    wrapSocketWithE2e(socket);

    receive('room:joined', { room: privateRoom, messages: [] });
    expect(establishPrivateRoomKey).not.toHaveBeenCalled();

    setIdentity('me');

    expect(establishPrivateRoomKey).toHaveBeenCalledTimes(1);
    expect(establishPrivateRoomKey).toHaveBeenCalledWith(socket, privateRoom, 'me', true);
  });

  it('keeps the active creation when a passive listing arrives before the identity', () => {
    const { socket, receive } = createFakeSocket();
    wrapSocketWithE2e(socket);

    receive('room:joined', { room: privateRoom, messages: [] });
    receive('rooms:list', { rooms: [privateRoom] });
    setIdentity('me');

    expect(establishPrivateRoomKey).toHaveBeenCalledTimes(1);
    expect(establishPrivateRoomKey).toHaveBeenCalledWith(socket, privateRoom, 'me', true);
  });

  it('drops deferred rooms when the identity is cleared', () => {
    const { socket, receive } = createFakeSocket();
    wrapSocketWithE2e(socket);

    receive('room:joined', { room: privateRoom, messages: [] });
    setIdentity(null);
    setIdentity('me');

    expect(establishPrivateRoomKey).not.toHaveBeenCalled();
  });

  it('stops listening for identity changes once the socket is closed', () => {
    const { socket, receive } = createFakeSocket();
    wrapSocketWithE2e(socket);

    receive('room:joined', { room: privateRoom, messages: [] });
    socket.close();
    setIdentity('me');

    expect(establishPrivateRoomKey).not.toHaveBeenCalled();
    expect(identityState.listeners.size).toBe(0);
  });
});
