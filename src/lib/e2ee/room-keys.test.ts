import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSocket } from '@lib/socket';
import {
  clearRoomKeys,
  ensureRoomKeyForDecryption,
  establishPrivateRoomKey,
  getCachedRoomKey,
  handleIncomingRoomKeyPush,
  handleRoomKeyRejected,
  subscribeRoomKeyAvailable,
} from './room-keys';

const persistedKeys = vi.hoisted(() => new Map<string, Uint8Array>());
const identityState = vi.hoisted(() => ({ signedIn: true }));
const generatedKeys = vi.hoisted(() => ({ next: 'generated' }));

vi.mock('@lib/i18n/app-i18n', () => ({ translate: (key: string) => key }));

vi.mock('./key-store', () => ({
  loadRoomKey: (roomId: string) => Promise.resolve(persistedKeys.get(roomId) ?? null),
  saveRoomKey: () => Promise.resolve(),
  deleteRoomKey: (roomId: string) => {
    persistedKeys.delete(roomId);
    return Promise.resolve();
  },
  clearRoomKeyStore: () => Promise.resolve(),
  contactPinId: (ownerId: string, contactId: string) => `${ownerId}:${contactId}`,
  loadContactPin: () => Promise.resolve(null),
  saveContactPin: () => Promise.resolve(),
}));

vi.mock('./current-identity', () => ({
  getCurrentIdentity: () => (identityState.signedIn ? { userId: 'me', publicKey: 'public', privateKey: new Uint8Array(32) } : null),
}));

vi.mock('./sodium', () => ({
  getSodium: () =>
    Promise.resolve({
      from_base64: (value: string) => new TextEncoder().encode(value),
      to_base64: (value: Uint8Array) => new TextDecoder().decode(value),
      crypto_box_seal_open: (sealed: Uint8Array) => sealed.slice(),
      crypto_box_seal: (message: Uint8Array) => message.slice(),
      crypto_secretbox_KEYBYTES: 32,
      randombytes_buf: () => new TextEncoder().encode(generatedKeys.next),
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

function decodeCached(roomId: string): string {
  return new TextDecoder().decode(getCachedRoomKey(roomId) ?? new Uint8Array());
}

describe('room key pushes', () => {
  beforeEach(() => {
    persistedKeys.clear();
    identityState.signedIn = true;
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

  function fakeSocket(
    storedKeys: { roomId: string; sealedKey: string }[],
    beforePublicKeys: () => Promise<void> = () => Promise.resolve(),
    publicKeyOf: (userId: string) => string = (userId) => `pk-${userId}`,
  ) {
    const listeners = new Map<string, (payload: unknown) => void>();
    const emit = vi.fn((event: string, payload?: { userIds?: string[] }) => {
      if (event === 'e2e:get-room-keys') {
        queueMicrotask(() => listeners.get('e2e:room-keys')?.({ keys: storedKeys }));
      }
      if (event === 'e2e:get-public-keys') {
        void beforePublicKeys().then(() =>
          listeners.get('e2e:public-keys')?.({ keys: (payload?.userIds ?? []).map((userId) => ({ userId, publicKey: publicKeyOf(userId) })) }),
        );
      }
    });
    const fake = {
      emit,
      on: (event: string, handler: (payload: unknown) => void) => listeners.set(event, handler),
      off: (event: string) => listeners.delete(event),
    };
    return { socket: fake as unknown as AppSocket, emit };
  }

  const privateRoom = {
    id: 'private-1',
    type: 'private',
    participants: [{ id: 'me' }, { id: 'peer' }],
  } as unknown as Parameters<typeof establishPrivateRoomKey>[1];

  it('ignores pushes while signed out', async () => {
    identityState.signedIn = false;
    persistedKeys.set('room-5', new TextEncoder().encode('stored'));

    await handleIncomingRoomKeyPush({ roomId: 'room-5', sealedKey: 'pushed' });

    expect(getCachedRoomKey('room-5')).toBeNull();
  });

  it('lets the winning key replace a key this device just created, but not later', async () => {
    const { socket: creator } = fakeSocket([]);
    generatedKeys.next = 'mine';
    await establishPrivateRoomKey(creator, { ...privateRoom, id: 'private-2' }, 'me', true);
    expect(decodeCached('private-2')).toBe('mine');

    await handleIncomingRoomKeyPush({ roomId: 'private-2', sealedKey: 'winner' });
    expect(decodeCached('private-2')).toBe('winner');

    await handleIncomingRoomKeyPush({ roomId: 'private-2', sealedKey: 'late' });
    expect(decodeCached('private-2')).toBe('winner');
  });

  it('never seals a room key to a contact whose key changed', async () => {
    const trustRoom = { ...privateRoom, participants: [{ id: 'me' }, { id: 'peer-trust' }] } as typeof privateRoom;
    const trusted = fakeSocket([], undefined, () => 'pk-trusted');
    await establishPrivateRoomKey(trusted.socket, { ...trustRoom, id: 'private-trust-1' }, 'me', true);
    expect(trusted.emit).toHaveBeenCalledWith('e2e:publish-room-key', expect.anything());

    const swapped = fakeSocket([], undefined, () => 'pk-swapped');
    await establishPrivateRoomKey(swapped.socket, { ...trustRoom, id: 'private-trust-2' }, 'me', true);

    expect(swapped.emit.mock.calls.some(([event]) => event === 'e2e:publish-room-key')).toBe(false);
    expect(getCachedRoomKey('private-trust-2')).toBeNull();
  });

  it('stops treating a created key as provisional after the window', async () => {
    const { socket: creator } = fakeSocket([]);
    generatedKeys.next = 'mine';
    await establishPrivateRoomKey(creator, { ...privateRoom, id: 'private-3' }, 'me', true);
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 60_000);

    await handleIncomingRoomKeyPush({ roomId: 'private-3', sealedKey: 'too-late' });

    expect(decodeCached('private-3')).toBe('mine');
    clock.mockRestore();
  });

  it('does not overwrite a key that arrived while it was preparing its own', async () => {
    const { socket: creator, emit } = fakeSocket([], async () => {
      await handleIncomingRoomKeyPush({ roomId: 'private-4', sealedKey: 'arrived-first' });
    });
    generatedKeys.next = 'mine';

    await establishPrivateRoomKey(creator, { ...privateRoom, id: 'private-4' }, 'me', true);

    expect(decodeCached('private-4')).toBe('arrived-first');
    expect(emit).not.toHaveBeenCalledWith('e2e:publish-room-key', expect.anything());
  });

  it('keeps a pushed key when a slower lookup for the same room finishes', async () => {
    const listeners = new Map<string, (payload: unknown) => void>();
    const slow = {
      emit: (event: string) => {
        if (event === 'e2e:get-room-keys') {
          void handleIncomingRoomKeyPush({ roomId: 'room-6', sealedKey: 'pushed' }).then(() =>
            listeners.get('e2e:room-keys')?.({ keys: [{ roomId: 'room-6', sealedKey: 'looked-up' }] }),
          );
        }
      },
      on: (event: string, handler: (payload: unknown) => void) => listeners.set(event, handler),
      off: (event: string) => listeners.delete(event),
    } as unknown as AppSocket;

    const result = await ensureRoomKeyForDecryption(slow, 'room-6');

    expect(new TextDecoder().decode(result ?? new Uint8Array())).toBe('pushed');
    expect(decodeCached('room-6')).toBe('pushed');
  });

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
