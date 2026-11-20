const DB_NAME = 'sparkchat-e2ee';
const DB_VERSION = 5;
const IDENTITY_STORE_NAME = 'identity';
const ROOM_KEYS_STORE_NAME = 'room_keys';
const CONTACT_PINS_STORE_NAME = 'contact_pins';
const WRAPPING_KEY_STORE_NAME = 'wrapping_key';
const RECORD_KEY = 'current';
const WRAP_IV_BYTES = 12;
const IDENTITY_WRAP_CONTEXT = 'sparkchat:wrap-identity:v1';
const ROOM_KEY_WRAP_CONTEXT = 'sparkchat:wrap-room-key:v1';

export interface WrappedSecret {
  iv: Uint8Array;
  data: Uint8Array;
}

interface LegacyStoredIdentity {
  userId: string;
  publicKey: string;
  privateKey: Uint8Array;
}

interface WrappedStoredIdentity {
  userId: string;
  publicKey: string;
  wrappedPrivateKey: WrappedSecret;
}

type StoredIdentityRecord = LegacyStoredIdentity | WrappedStoredIdentity;

export interface ContactPin {
  id: string;
  ownerId: string;
  contactId: string;
  publicKey: string;
  signingPublicKey: string | null;
  ownPublicKey: string;
  verified: boolean;
  pinnedAt: number;
  pending: { publicKey: string; signingPublicKey: string | null; seenAt: number } | null;
  replacedSigningPublicKey?: string | null;
}

export interface StoredRoomKeyGeneration {
  roomId: string;
  keyId: string;
  epoch: number;
  key: Uint8Array;
  roomType?: 'private' | 'group';
  encryptedRoster?: string;
  historyOnly?: boolean;
}

interface WrappedRoomKeyRecord {
  roomId: string;
  keyId: string;
  epoch: number;
  wrappedKey: WrappedSecret;
  roomType?: 'private' | 'group';
  encryptedRoster?: string;
  historyOnly?: boolean;
}

type RoomKeyRecord = StoredRoomKeyGeneration | WrappedRoomKeyRecord;

const ROOM_KEYS_BY_ROOM_INDEX = 'by_room';

let wrappingKeyPromise: Promise<CryptoKey> | null = null;
let migrationPromise: Promise<void> | null = null;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      if (!request.result.objectStoreNames.contains(IDENTITY_STORE_NAME)) {
        request.result.createObjectStore(IDENTITY_STORE_NAME);
      }
      if (event.oldVersion < 4 && request.result.objectStoreNames.contains(ROOM_KEYS_STORE_NAME)) {
        request.result.deleteObjectStore(ROOM_KEYS_STORE_NAME);
      }
      if (!request.result.objectStoreNames.contains(ROOM_KEYS_STORE_NAME)) {
        const store = request.result.createObjectStore(ROOM_KEYS_STORE_NAME, { keyPath: ['roomId', 'keyId'] });
        store.createIndex(ROOM_KEYS_BY_ROOM_INDEX, 'roomId');
      }
      if (!request.result.objectStoreNames.contains(CONTACT_PINS_STORE_NAME)) {
        request.result.createObjectStore(CONTACT_PINS_STORE_NAME, { keyPath: 'id' });
      }
      if (!request.result.objectStoreNames.contains(WRAPPING_KEY_STORE_NAME)) {
        request.result.createObjectStore(WRAPPING_KEY_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Não foi possível abrir o armazenamento local.'));
  });
}

async function withDb<T>(run: (db: IDBDatabase) => Promise<T>): Promise<T> {
  const db = await openDb();
  try {
    return await run(db);
  } finally {
    db.close();
  }
}

function readRecord<T>(db: IDBDatabase, storeName: string, key: IDBValidKey): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error ?? new Error('Falha ao ler o armazenamento local.'));
  });
}

function readAll<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error ?? new Error('Falha ao ler o armazenamento local.'));
  });
}

function writeTransaction(db: IDBDatabase, storeName: string, apply: (store: IDBObjectStore) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    apply(tx.objectStore(storeName));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Falha ao gravar no armazenamento local.'));
    tx.onabort = () => reject(tx.error ?? new Error('Falha ao gravar no armazenamento local.'));
  });
}

function storeWrappingKeyOnce(db: IDBDatabase, candidate: CryptoKey): Promise<CryptoKey> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(WRAPPING_KEY_STORE_NAME, 'readwrite');
    const store = tx.objectStore(WRAPPING_KEY_STORE_NAME);
    let chosen = candidate;
    const request = store.get(RECORD_KEY);
    request.onsuccess = () => {
      if (request.result instanceof CryptoKey) {
        chosen = request.result;
      } else {
        store.put(candidate, RECORD_KEY);
      }
    };
    tx.oncomplete = () => resolve(chosen);
    tx.onerror = () => reject(tx.error ?? new Error('Falha ao gravar a chave local.'));
    tx.onabort = () => reject(tx.error ?? new Error('Falha ao gravar a chave local.'));
  });
}

async function loadOrCreateWrappingKey(): Promise<CryptoKey> {
  return withDb(async (db) => {
    const existing = await readRecord<unknown>(db, WRAPPING_KEY_STORE_NAME, RECORD_KEY);
    if (existing instanceof CryptoKey) {
      return existing;
    }
    const candidate = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    return storeWrappingKeyOnce(db, candidate);
  });
}

function getWrappingKey(): Promise<CryptoKey> {
  if (!wrappingKeyPromise) {
    const pending = loadOrCreateWrappingKey();
    wrappingKeyPromise = pending;
    pending.catch(() => {
      if (wrappingKeyPromise === pending) {
        wrappingKeyPromise = null;
      }
    });
  }
  return wrappingKeyPromise;
}

const encoder = new TextEncoder();

function wrapAssociatedData(context: string, parts: string[]): Uint8Array<ArrayBuffer> {
  return encoder.encode([context, ...parts].join('|'));
}

async function wrapSecret(secret: Uint8Array, associatedData: Uint8Array<ArrayBuffer>): Promise<WrappedSecret> {
  const key = await getWrappingKey();
  const iv = crypto.getRandomValues(new Uint8Array(WRAP_IV_BYTES));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: associatedData }, key, Uint8Array.from(secret));
  return { iv, data: new Uint8Array(data) };
}

async function unwrapSecret(wrapped: WrappedSecret, associatedData: Uint8Array<ArrayBuffer>): Promise<Uint8Array | null> {
  try {
    const key = await getWrappingKey();
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: Uint8Array.from(wrapped.iv), additionalData: associatedData },
      key,
      Uint8Array.from(wrapped.data),
    );
    return new Uint8Array(plaintext);
  } catch {
    return null;
  }
}

export function isWrappedSecret(value: unknown): value is WrappedSecret {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<WrappedSecret>;
  return candidate.iv instanceof Uint8Array && candidate.data instanceof Uint8Array;
}

function isLegacyIdentity(record: StoredIdentityRecord): record is LegacyStoredIdentity {
  return 'privateKey' in record && record.privateKey instanceof Uint8Array;
}

function isLegacyRoomKey(record: RoomKeyRecord): record is StoredRoomKeyGeneration {
  return 'key' in record && record.key instanceof Uint8Array;
}

function identityAssociatedData(userId: string, publicKey: string): Uint8Array<ArrayBuffer> {
  return wrapAssociatedData(IDENTITY_WRAP_CONTEXT, [userId, publicKey]);
}

function roomKeyAssociatedData(
  roomId: string,
  keyId: string,
  epoch: number,
  roomType: 'private' | 'group' | undefined,
  historyOnly: boolean,
): Uint8Array<ArrayBuffer> {
  return wrapAssociatedData(ROOM_KEY_WRAP_CONTEXT, [roomId, keyId, String(epoch), roomType ?? '', historyOnly ? 'history' : 'current']);
}

async function wrapIdentity(userId: string, publicKey: string, privateKey: Uint8Array): Promise<WrappedStoredIdentity> {
  return { userId, publicKey, wrappedPrivateKey: await wrapSecret(privateKey, identityAssociatedData(userId, publicKey)) };
}

async function wrapRoomKey(generation: StoredRoomKeyGeneration): Promise<WrappedRoomKeyRecord> {
  return {
    roomId: generation.roomId,
    keyId: generation.keyId,
    epoch: generation.epoch,
    wrappedKey: await wrapSecret(
      generation.key,
      roomKeyAssociatedData(generation.roomId, generation.keyId, generation.epoch, generation.roomType, generation.historyOnly === true),
    ),
    ...(generation.roomType ? { roomType: generation.roomType } : {}),
    ...(typeof generation.encryptedRoster === 'string' ? { encryptedRoster: generation.encryptedRoster } : {}),
    ...(generation.historyOnly ? { historyOnly: true } : {}),
  };
}

async function migrateLegacyRecords(): Promise<void> {
  await withDb(async (db) => {
    const identity = await readRecord<StoredIdentityRecord>(db, IDENTITY_STORE_NAME, RECORD_KEY);
    if (identity && isLegacyIdentity(identity)) {
      const wrapped = await wrapIdentity(identity.userId, identity.publicKey, identity.privateKey);
      await writeTransaction(db, IDENTITY_STORE_NAME, (store) => store.put(wrapped, RECORD_KEY));
    }
    const roomKeys = (await readAll<RoomKeyRecord>(db, ROOM_KEYS_STORE_NAME)).filter(isLegacyRoomKey);
    if (roomKeys.length > 0) {
      const wrapped = await Promise.all(roomKeys.map(wrapRoomKey));
      await writeTransaction(db, ROOM_KEYS_STORE_NAME, (store) => {
        for (const record of wrapped) {
          store.put(record);
        }
      });
    }
  });
}

export function migrateLegacySecrets(): Promise<void> {
  if (!migrationPromise) {
    const pending = migrateLegacyRecords();
    migrationPromise = pending;
    pending.catch(() => {
      if (migrationPromise === pending) {
        migrationPromise = null;
      }
    });
  }
  return migrationPromise;
}

async function migratedDb<T>(run: (db: IDBDatabase) => Promise<T>): Promise<T> {
  await migrateLegacySecrets().catch(() => undefined);
  return withDb(run);
}

export async function savePrivateKey(userId: string, publicKey: string, privateKey: Uint8Array): Promise<void> {
  try {
    await migrateLegacySecrets().catch(() => undefined);
    const wrapped = await wrapIdentity(userId, publicKey, privateKey);
    await withDb((db) => writeTransaction(db, IDENTITY_STORE_NAME, (store) => store.put(wrapped, RECORD_KEY)));
  } catch {
    return;
  }
}

export async function loadPrivateKey(userId: string): Promise<{ publicKey: string; privateKey: Uint8Array } | null> {
  try {
    const stored = await migratedDb((db) => readRecord<StoredIdentityRecord>(db, IDENTITY_STORE_NAME, RECORD_KEY));
    if (!stored || stored.userId !== userId) {
      return null;
    }
    if (isLegacyIdentity(stored) || !isWrappedSecret(stored.wrappedPrivateKey)) {
      return null;
    }
    const privateKey = await unwrapSecret(stored.wrappedPrivateKey, identityAssociatedData(stored.userId, stored.publicKey));
    return privateKey ? { publicKey: stored.publicKey, privateKey } : null;
  } catch {
    return null;
  }
}

export async function loadStoredIdentityUserId(): Promise<string | null> {
  try {
    const stored = await withDb((db) => readRecord<StoredIdentityRecord>(db, IDENTITY_STORE_NAME, RECORD_KEY));
    return stored && typeof stored.userId === 'string' ? stored.userId : null;
  } catch {
    return null;
  }
}

export function forgetCachedWrappingKey(): void {
  wrappingKeyPromise = null;
}

export async function sealLocalSecret(context: string, parts: string[], secret: Uint8Array): Promise<WrappedSecret> {
  return wrapSecret(secret, wrapAssociatedData(context, parts));
}

export async function openLocalSecret(wrapped: unknown, context: string, parts: string[]): Promise<Uint8Array | null> {
  if (!isWrappedSecret(wrapped)) {
    return null;
  }
  return unwrapSecret(wrapped, wrapAssociatedData(context, parts));
}

export async function clearPrivateKey(): Promise<void> {
  try {
    await withDb((db) => writeTransaction(db, IDENTITY_STORE_NAME, (store) => store.delete(RECORD_KEY)));
  } catch {
    return;
  }
}

export async function clearWrappingKey(): Promise<void> {
  wrappingKeyPromise = null;
  migrationPromise = null;
  try {
    await withDb((db) => writeTransaction(db, WRAPPING_KEY_STORE_NAME, (store) => store.delete(RECORD_KEY)));
  } catch {
    return;
  }
}

export async function saveRoomKeyGeneration(generation: StoredRoomKeyGeneration): Promise<void> {
  try {
    await migrateLegacySecrets().catch(() => undefined);
    const wrapped = await wrapRoomKey(generation);
    await withDb((db) => writeTransaction(db, ROOM_KEYS_STORE_NAME, (store) => store.put(wrapped)));
  } catch {
    return;
  }
}

async function unwrapRoomKeyRecord(record: RoomKeyRecord): Promise<StoredRoomKeyGeneration | null> {
  if (isLegacyRoomKey(record) || !isWrappedSecret(record.wrappedKey)) {
    return null;
  }
  const key = await unwrapSecret(
    record.wrappedKey,
    roomKeyAssociatedData(record.roomId, record.keyId, record.epoch, record.roomType, record.historyOnly === true),
  );
  if (!key) {
    return null;
  }
  return {
    roomId: record.roomId,
    keyId: record.keyId,
    epoch: record.epoch,
    key,
    ...(record.roomType ? { roomType: record.roomType } : {}),
    ...(typeof record.encryptedRoster === 'string' ? { encryptedRoster: record.encryptedRoster } : {}),
    ...(record.historyOnly === true ? { historyOnly: true } : {}),
  };
}

export async function loadRoomKeyGenerations(roomId: string): Promise<StoredRoomKeyGeneration[]> {
  try {
    const stored = await migratedDb(
      (db) =>
        new Promise<RoomKeyRecord[]>((resolve, reject) => {
          const request = db.transaction(ROOM_KEYS_STORE_NAME, 'readonly').objectStore(ROOM_KEYS_STORE_NAME).index(ROOM_KEYS_BY_ROOM_INDEX).getAll(roomId);
          request.onsuccess = () => resolve(request.result as RoomKeyRecord[]);
          request.onerror = () => reject(request.error ?? new Error('Falha ao ler a chave da sala.'));
        }),
    );
    const unwrapped = await Promise.all(stored.map(unwrapRoomKeyRecord));
    return unwrapped.filter((entry): entry is StoredRoomKeyGeneration => entry !== null);
  } catch {
    return [];
  }
}

export async function clearRoomKeyStore(): Promise<void> {
  try {
    await withDb((db) => writeTransaction(db, ROOM_KEYS_STORE_NAME, (store) => store.clear()));
  } catch {
    return;
  }
}

export function contactPinId(ownerId: string, contactId: string): string {
  return `${ownerId}:${contactId}`;
}

export async function loadContactPin(ownerId: string, contactId: string): Promise<ContactPin | null> {
  try {
    return (await withDb((db) => readRecord<ContactPin>(db, CONTACT_PINS_STORE_NAME, contactPinId(ownerId, contactId)))) ?? null;
  } catch {
    return null;
  }
}

export async function saveContactPin(pin: ContactPin): Promise<void> {
  try {
    await withDb((db) => writeTransaction(db, CONTACT_PINS_STORE_NAME, (store) => store.put(pin)));
  } catch {
    return;
  }
}
