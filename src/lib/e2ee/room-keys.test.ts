import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSocket } from '@lib/socket';
import {
  clearRoomKeys,
  ensureRoomKeyForDecryption,
  getCachedRoomKey,
  handleIncomingRoomKeyPush,
  handleRoomKeyRejected,
  subscribeRoomKeyAvailable,
} from './room-keys';

const persistedKeys = vi.hoisted(() => new Map<string, Uint8Array>());

vi.mock('@lib/i18n/app-i18n', () => ({ translate: (key: string) => key }));

vi.mock('./key-store', () => ({
  loadRoomKey: (roomId: string) => Promise.resolve(persistedKeys.get(roomId) ?? null),
  saveRoomKey: () => Promise.resolve(),
  deleteRoomKey: (roomId: string) => {
    persistedKeys.delete(roomId);
    return Promise.resolve();
  },
  clearRoomKeyStore: () => Promise.resolve(),
}));

vi.mock('./current-identity', () => ({
  getCurrentIdentity: () => ({ userId: 'me', publicKey: 'public', privateKey: new Uint8Array(32) }),
}));

vi.mock('./sodium', () => ({
  getSodium: () =>
    Promise.resolve({
      from_base64: (value: string) => new TextEncoder().encode(value),
      crypto_box_seal_open: (sealed: Uint8Array) => sealed.slice(),
    }),
}));

const socket = {} as AppSocket;

describe('subscribeRoomKeyAvailable', () => {
  beforeEach(() => {
    persistedKeys.clear();
  });

  afterEach(async () => {
    await clearRoomKeys();
  });

  it('notifies when a pushed room key is cached', async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeRoomKeyAvailable(listener);

    await handleIncomingRoomKeyPush({ roomId: 'room-1', sealedKey: 'sealed' });

    expect(listener).toHaveBeenCalledExactlyOnceWith('room-1');
    unsubscribe();
  });

  it('notifies when a persisted key is loaded and not again on cache hits', async () => {
    persistedKeys.set('room-2', new Uint8Array([1, 2, 3]));
    const listener = vi.fn();
    const unsubscribe = subscribeRoomKeyAvailable(listener);

    await ensureRoomKeyForDecryption(socket, 'room-2');
    await ensureRoomKeyForDecryption(socket, 'room-2');

    expect(listener).toHaveBeenCalledExactlyOnceWith('room-2');
    unsubscribe();
  });

  it('stops notifying after unsubscribe and isolates failing listeners', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const removed = vi.fn();
    const failing = vi.fn(() => {
      throw new Error('boom');
    });
    const healthy = vi.fn();
    const unsubscribeRemoved = subscribeRoomKeyAvailable(removed);
    const unsubscribeFailing = subscribeRoomKeyAvailable(failing);
    const unsubscribeHealthy = subscribeRoomKeyAvailable(healthy);
    unsubscribeRemoved();

    await handleIncomingRoomKeyPush({ roomId: 'room-3', sealedKey: 'sealed' });

    expect(removed).not.toHaveBeenCalled();
    expect(failing).toHaveBeenCalledOnce();
    expect(healthy).toHaveBeenCalledExactlyOnceWith('room-3');
    unsubscribeFailing();
    unsubscribeHealthy();
    consoleError.mockRestore();
  });
});

describe('room key pushes', () => {
  beforeEach(() => {
    persistedKeys.clear();
    vi.stubGlobal('window', { setTimeout, clearTimeout });
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await clearRoomKeys();
  });

  it('keeps the key it already has when another one is pushed', async () => {
    await handleIncomingRoomKeyPush({ roomId: 'room-1', sealedKey: 'first' });
    await handleIncomingRoomKeyPush({ roomId: 'room-1', sealedKey: 'second' });

    expect(new TextDecoder().decode(getCachedRoomKey('room-1') ?? new Uint8Array())).toBe('first');
  });

  it('prefers the key stored on this device over a pushed one', async () => {
    persistedKeys.set('room-2', new TextEncoder().encode('stored'));

    await handleIncomingRoomKeyPush({ roomId: 'room-2', sealedKey: 'pushed' });

    expect(new TextDecoder().decode(getCachedRoomKey('room-2') ?? new Uint8Array())).toBe('stored');
  });

  function fakeSocket(storedKeys: { roomId: string; sealedKey: string }[]) {
    const listeners = new Map<string, (payload: unknown) => void>();
    const emit = vi.fn((event: string) => {
      if (event === 'e2e:get-room-keys') {
        queueMicrotask(() => listeners.get('e2e:room-keys')?.({ keys: storedKeys }));
      }
    });
    const fake = {
      emit,
      on: (event: string, handler: (payload: unknown) => void) => listeners.set(event, handler),
      off: (event: string) => listeners.delete(event),
    };
    return { socket: fake as unknown as AppSocket, emit };
  }

  it('recovers its own stored key after a rejection without bothering the other participant', async () => {
    const { socket: rejectedSocket, emit } = fakeSocket([{ roomId: 'room-4', sealedKey: 'own-row' }]);
    await handleIncomingRoomKeyPush({ roomId: 'room-4', sealedKey: 'competing' });

    await handleRoomKeyRejected(rejectedSocket, { roomId: 'room-4' });

    expect(new TextDecoder().decode(getCachedRoomKey('room-4') ?? new Uint8Array())).toBe('own-row');
    expect(emit).not.toHaveBeenCalledWith('e2e:request-room-key', expect.anything());
  });

  it('drops a rejected key, asks for the existing one and accepts it when it arrives', async () => {
    const { socket: rejectedSocket, emit } = fakeSocket([]);
    await handleIncomingRoomKeyPush({ roomId: 'room-3', sealedKey: 'competing' });

    await handleRoomKeyRejected(rejectedSocket, { roomId: 'room-3' });

    expect(getCachedRoomKey('room-3')).toBeNull();
    expect(persistedKeys.has('room-3')).toBe(false);
    expect(emit).toHaveBeenCalledWith('e2e:request-room-key', { roomId: 'room-3' });

    await handleIncomingRoomKeyPush({ roomId: 'room-3', sealedKey: 'existing' });
    expect(new TextDecoder().decode(getCachedRoomKey('room-3') ?? new Uint8Array())).toBe('existing');
  });
});
