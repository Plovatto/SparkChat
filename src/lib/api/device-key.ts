export const DEVICE_KEY_DB_NAME = 'sparkchat-device-key';
const STORE_NAME = 'keys';
const RECORD_KEY = 'current';
const LOCK_NAME = 'sparkchat-device-key';
export const SIGNATURE_VERSION = 'SPARKCHAT-SIG-V1';
export const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD';
export const SOCKET_JOIN_METHOD = 'SOCKET';
export const SOCKET_JOIN_PATH = 'user:join';

export interface DeviceKeyRecord {
  userId: string | null;
  keyPair: CryptoKeyPair;
  publicKey: string;
  bound: boolean;
}

export interface SessionProof {
  timestamp: number;
  nonce: string;
  signature: string;
}

let cached: Promise<DeviceKeyRecord | null> | null = null;
let clockOffsetMs = 0;

function hasPlatformSupport(): boolean {
  return typeof indexedDB !== 'undefined' && typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';
}

export function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const byte of view) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256Base64Url(value: string): Promise<string> {
  return toBase64Url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DEVICE_KEY_DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('device key store unavailable'));
  });
}

async function runStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const request = run(transaction.objectStore(STORE_NAME));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error ?? new Error('device key store failed'));
      transaction.onabort = () => reject(transaction.error ?? new Error('device key store aborted'));
    });
  } finally {
    db.close();
  }
}

function isDeviceKeyRecord(value: unknown): value is DeviceKeyRecord {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Partial<DeviceKeyRecord>;
  return typeof record.publicKey === 'string' && typeof record.bound === 'boolean' && record.keyPair?.privateKey instanceof CryptoKey;
}

async function readStoredRecord(): Promise<DeviceKeyRecord | null> {
  const value = await runStore<unknown>('readonly', (store) => store.get(RECORD_KEY));
  return isDeviceKeyRecord(value) ? value : null;
}

async function writeStoredRecord(record: DeviceKeyRecord): Promise<DeviceKeyRecord> {
  await runStore('readwrite', (store) => store.put(record, RECORD_KEY));
  const stored = await readStoredRecord();
  if (stored?.publicKey !== record.publicKey) {
    throw new Error('device key was not persisted');
  }
  cached = Promise.resolve(stored);
  return stored;
}

function loadRecord(): Promise<DeviceKeyRecord | null> {
  if (!hasPlatformSupport()) {
    return Promise.resolve(null);
  }
  cached ??= readStoredRecord().catch(() => null);
  return cached;
}

async function generateRecord(userId: string | null): Promise<DeviceKeyRecord> {
  const keyPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const publicKey = toBase64Url(await crypto.subtle.exportKey('spki', keyPair.publicKey));
  return { userId, keyPair, publicKey, bound: false };
}

async function withDeviceKeyLock<T>(run: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' && 'locks' in navigator ? navigator.locks : null;
  if (!locks) {
    return run();
  }
  return locks.request(LOCK_NAME, run);
}

export async function prepareLoginDeviceKey(): Promise<string | null> {
  if (!hasPlatformSupport()) {
    return null;
  }
  try {
    return await withDeviceKeyLock(async () => (await writeStoredRecord(await generateRecord(null))).publicKey);
  } catch {
    cached = null;
    return null;
  }
}

export async function completeLoginDeviceKey(userId: string, publicKey: string | null, bound: boolean): Promise<void> {
  if (!publicKey) {
    return;
  }
  await withDeviceKeyLock(async () => {
    const record = await readStoredRecord();
    if (record?.publicKey === publicKey) {
      await writeStoredRecord({ ...record, userId, bound });
    }
  }).catch(() => undefined);
}

export async function ensureDeviceKey(
  userId: string,
  register: (record: DeviceKeyRecord) => Promise<'bound' | 'conflict' | 'unsupported'>,
): Promise<DeviceKeyRecord | null> {
  if (!hasPlatformSupport()) {
    return null;
  }
  try {
    return await withDeviceKeyLock(async () => {
      let record = await readStoredRecord();
      if (!record || record.userId !== userId) {
        record = await writeStoredRecord(await generateRecord(userId));
      }
      if (record.bound) {
        return record;
      }
      const outcome = await register(record);
      if (outcome === 'bound') {
        return writeStoredRecord({ ...record, bound: true });
      }
      if (outcome === 'conflict') {
        await runStore('readwrite', (store) => store.delete(RECORD_KEY));
        cached = Promise.resolve(null);
        return null;
      }
      return record;
    });
  } catch {
    cached = null;
    return null;
  }
}

export async function getDeviceKey(userId: string): Promise<DeviceKeyRecord | null> {
  const record = await loadRecord();
  return record?.userId === userId ? record : null;
}

export function adjustClockOffset(serverTime: number): void {
  if (Number.isFinite(serverTime)) {
    clockOffsetMs = serverTime - Date.now();
  }
}

export function signatureTimestamp(): number {
  return Date.now() + clockOffsetMs;
}

function createNonce(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
}

export function canonicalRequest(userId: string, method: string, path: string, timestamp: number, nonce: string, bodyHash: string): string {
  return [SIGNATURE_VERSION, userId, method.toUpperCase(), path, String(timestamp), nonce, bodyHash].join('\n');
}

export async function signWithRecord(record: DeviceKeyRecord, userId: string, method: string, path: string, bodyHash: string): Promise<SessionProof> {
  const timestamp = signatureTimestamp();
  const nonce = createNonce();
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    record.keyPair.privateKey,
    new TextEncoder().encode(canonicalRequest(userId, method, path, timestamp, nonce, bodyHash)),
  );
  return { timestamp, nonce, signature: toBase64Url(signature) };
}

export async function signForSession(userId: string, method: string, path: string, bodyHash: string): Promise<SessionProof | null> {
  const record = await getDeviceKey(userId);
  if (!record) {
    return null;
  }
  try {
    return await signWithRecord(record, userId, method, path, bodyHash);
  } catch {
    return null;
  }
}

export async function buildSocketJoinProof(userId: string): Promise<SessionProof | null> {
  return signForSession(userId, SOCKET_JOIN_METHOD, SOCKET_JOIN_PATH, await sha256Base64Url(''));
}

export function proofHeaders(proof: SessionProof): Record<string, string> {
  return {
    'X-Spark-Timestamp': String(proof.timestamp),
    'X-Spark-Nonce': proof.nonce,
    'X-Spark-Signature': proof.signature,
  };
}

export function resetDeviceKeyCache(): void {
  cached = null;
  clockOffsetMs = 0;
}
