import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as KeyStoreNamespace from './key-store';

type KeyStore = typeof KeyStoreNamespace;

const DB_NAME = 'sparkchat-e2ee';

async function freshModule(): Promise<KeyStore> {
  vi.resetModules();
  return import('./key-store');
}

function openRaw(version?: number, upgrade?: (db: IDBDatabase) => void): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = version === undefined ? indexedDB.open(DB_NAME) : indexedDB.open(DB_NAME, version);
    request.onupgradeneeded = () => upgrade?.(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('open failed'));
  });
}

async function rawAll(storeName: string): Promise<unknown[]> {
  const db = await openRaw();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result as unknown[]);
      request.onerror = () => reject(request.error ?? new Error('read failed'));
    });
  } finally {
    db.close();
  }
}

async function rawPut(storeName: string, value: unknown, key?: IDBValidKey): Promise<void> {
  const db = await openRaw();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('write failed'));
    });
  } finally {
    db.close();
  }
}

async function seedLegacyDatabase(): Promise<void> {
  const db = await openRaw(4, (upgrade) => {
    upgrade.createObjectStore('identity');
    upgrade.createObjectStore('room_keys', { keyPath: ['roomId', 'keyId'] }).createIndex('by_room', 'roomId');
    upgrade.createObjectStore('contact_pins', { keyPath: 'id' });
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['identity', 'room_keys'], 'readwrite');
    tx.objectStore('identity').put({ userId: 'ana', publicKey: 'pub-ana', privateKey: new Uint8Array(32).fill(7) }, 'current');
    tx.objectStore('room_keys').put({ roomId: 'room', keyId: 'k1', epoch: 1, key: new Uint8Array(32).fill(9), roomType: 'group' });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('seed failed'));
  });
  db.close();
}

function containsBytes(value: unknown, fill: number): boolean {
  if (value instanceof Uint8Array) {
    return value.length === 32 && value.every((byte) => byte === fill);
  }
  if (value && typeof value === 'object') {
    return Object.values(value).some((child) => containsBytes(child, fill));
  }
  return false;
}

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
});

describe('key store wrapping', () => {
  it('stores the identity private key and room keys only wrapped by a non-extractable AES-GCM key', async () => {
    const store = await freshModule();
    await store.savePrivateKey('ana', 'pub-ana', new Uint8Array(32).fill(3));
    await store.saveRoomKeyGeneration({ roomId: 'room', keyId: 'k1', epoch: 1, key: new Uint8Array(32).fill(5), encryptedRoster: 'roster-blob' });

    const [wrappingKey] = await rawAll('wrapping_key');
    expect(wrappingKey).toBeInstanceOf(CryptoKey);
    expect((wrappingKey as CryptoKey).extractable).toBe(false);
    expect((wrappingKey as CryptoKey).algorithm.name).toBe('AES-GCM');

    const identities = await rawAll('identity');
    const roomKeys = await rawAll('room_keys');
    expect(identities.some((record) => containsBytes(record, 3))).toBe(false);
    expect(roomKeys.some((record) => containsBytes(record, 5))).toBe(false);
    expect(roomKeys[0]).not.toHaveProperty('key');

    const reloaded = await freshModule();
    expect((await reloaded.loadPrivateKey('ana'))?.privateKey).toEqual(new Uint8Array(32).fill(3));
    const [generation] = await reloaded.loadRoomKeyGenerations('room');
    expect(generation?.key).toEqual(new Uint8Array(32).fill(5));
    expect(generation?.encryptedRoster).toBe('roster-blob');
  });

  it('migrates legacy unwrapped records on first load and deletes the plaintext copies', async () => {
    await seedLegacyDatabase();
    const store = await freshModule();

    expect((await store.loadPrivateKey('ana'))?.privateKey).toEqual(new Uint8Array(32).fill(7));
    const [generation] = await store.loadRoomKeyGenerations('room');
    expect(generation).toMatchObject({ roomId: 'room', keyId: 'k1', epoch: 1, roomType: 'group' });
    expect(generation?.key).toEqual(new Uint8Array(32).fill(9));

    const identities = await rawAll('identity');
    const roomKeys = await rawAll('room_keys');
    expect(identities).toHaveLength(1);
    expect(identities[0]).not.toHaveProperty('privateKey');
    expect(identities.some((record) => containsBytes(record, 7))).toBe(false);
    expect(roomKeys).toHaveLength(1);
    expect(roomKeys[0]).not.toHaveProperty('key');
    expect(roomKeys.some((record) => containsBytes(record, 9))).toBe(false);
  });

  it('refuses a wrapped room key moved to another room or key id', async () => {
    const store = await freshModule();
    await store.saveRoomKeyGeneration({ roomId: 'room', keyId: 'k1', epoch: 1, key: new Uint8Array(32).fill(5) });
    const [record] = (await rawAll('room_keys')) as Record<string, unknown>[];
    await rawPut('room_keys', { ...record, roomId: 'other' });
    await rawPut('room_keys', { ...record, keyId: 'k2' });
    await rawPut('room_keys', { ...record, keyId: 'k3', epoch: 2 });

    expect(await store.loadRoomKeyGenerations('other')).toEqual([]);
    const generations = await store.loadRoomKeyGenerations('room');
    expect(generations.map((generation) => generation.keyId)).toEqual(['k1']);
  });

  it('deletes the wrapping key on logout so wrapped records can no longer be opened', async () => {
    const store = await freshModule();
    await store.savePrivateKey('ana', 'pub-ana', new Uint8Array(32).fill(3));
    await store.saveRoomKeyGeneration({ roomId: 'room', keyId: 'k1', epoch: 1, key: new Uint8Array(32).fill(5) });

    await store.clearWrappingKey();

    expect(await rawAll('wrapping_key')).toEqual([]);
    const reloaded = await freshModule();
    expect(await reloaded.loadRoomKeyGenerations('room')).toEqual([]);
    expect(await reloaded.loadPrivateKey('ana')).toBeNull();
  });

  it('keeps a single wrapping key when several secrets are saved at once', async () => {
    const store = await freshModule();
    await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        store.saveRoomKeyGeneration({ roomId: 'room', keyId: `k${index}`, epoch: index + 1, key: new Uint8Array(32).fill(index) }),
      ),
    );
    expect(await rawAll('wrapping_key')).toHaveLength(1);
    expect(await (await freshModule()).loadRoomKeyGenerations('room')).toHaveLength(5);
  });

  it('rejects plaintext records written after the migration ran', async () => {
    const store = await freshModule();
    expect(await store.loadPrivateKey('ana')).toBeNull();
    await rawPut('identity', { userId: 'ana', publicKey: 'pub-ana', privateKey: new Uint8Array(32).fill(7) }, 'current');
    await rawPut('room_keys', { roomId: 'room', keyId: 'k1', epoch: 1, key: new Uint8Array(32).fill(9) });

    expect(await store.loadPrivateKey('ana')).toBeNull();
    expect(await store.loadRoomKeyGenerations('room')).toEqual([]);
  });

  it('binds the room type and the history flag of a wrapped room key', async () => {
    const store = await freshModule();
    await store.saveRoomKeyGeneration({ roomId: 'room', keyId: 'k1', epoch: 1, key: new Uint8Array(32).fill(5), historyOnly: true, roomType: 'group' });
    const [record] = (await rawAll('room_keys')) as Record<string, unknown>[];
    const { historyOnly: _historyOnly, ...promoted } = record as Record<string, unknown>;
    await rawPut('room_keys', promoted);
    expect(await store.loadRoomKeyGenerations('room')).toEqual([]);

    await rawPut('room_keys', { ...record, roomType: 'private' });
    expect(await store.loadRoomKeyGenerations('room')).toEqual([]);

    await rawPut('room_keys', record);
    expect((await store.loadRoomKeyGenerations('room'))[0]).toMatchObject({ historyOnly: true, roomType: 'group' });
  });

  it('never lets the migration overwrite an identity saved while it runs', async () => {
    await seedLegacyDatabase();
    const store = await freshModule();
    await Promise.all([store.loadPrivateKey('ana'), store.savePrivateKey('ana', 'pub-ana', new Uint8Array(32).fill(1))]);

    expect((await (await freshModule()).loadPrivateKey('ana'))?.privateKey).toEqual(new Uint8Array(32).fill(1));
  });
});
