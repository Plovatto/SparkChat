import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSocket } from '@lib/socket';
import { clearRoomKeys, ensureRoomKeyForDecryption, handleIncomingRoomKeyPush, subscribeRoomKeyAvailable } from './room-keys';

const persistedKeys = vi.hoisted(() => new Map<string, Uint8Array>());

vi.mock('@lib/i18n/app-i18n', () => ({ translate: (key: string) => key }));

vi.mock('./key-store', () => ({
  loadRoomKey: (roomId: string) => Promise.resolve(persistedKeys.get(roomId) ?? null),
  saveRoomKey: () => Promise.resolve(),
  deleteRoomKey: () => Promise.resolve(),
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
