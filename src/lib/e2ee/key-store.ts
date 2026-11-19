const DB_NAME = 'sparkchat-e2ee';
const DB_VERSION = 4;
const IDENTITY_STORE_NAME = 'identity';
const ROOM_KEYS_STORE_NAME = 'room_keys';
const CONTACT_PINS_STORE_NAME = 'contact_pins';
const RECORD_KEY = 'current';

interface StoredIdentity {
  userId: string;
  publicKey: string;
  privateKey: Uint8Array;
}

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
}

export interface StoredRoomKeyGeneration {
  roomId: string;
  keyId: string;
  epoch: number;
  key: Uint8Array;
}

const ROOM_KEYS_BY_ROOM_INDEX = 'by_room';

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
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Não foi possível abrir o armazenamento local.'));
  });
}

export async function savePrivateKey(userId: string, publicKey: string, privateKey: Uint8Array): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDENTITY_STORE_NAME, 'readwrite');
      tx.objectStore(IDENTITY_STORE_NAME).put({ userId, publicKey, privateKey } satisfies StoredIdentity, RECORD_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Falha ao salvar a chave local.'));
    });
    db.close();
  } catch {
    return;
  }
}

export async function loadPrivateKey(userId: string): Promise<{ publicKey: string; privateKey: Uint8Array } | null> {
  try {
    const db = await openDb();
    const stored = await new Promise<StoredIdentity | undefined>((resolve, reject) => {
      const tx = db.transaction(IDENTITY_STORE_NAME, 'readonly');
      const request = tx.objectStore(IDENTITY_STORE_NAME).get(RECORD_KEY);
      request.onsuccess = () => resolve(request.result as StoredIdentity | undefined);
      request.onerror = () => reject(request.error ?? new Error('Falha ao ler a chave local.'));
    });
    db.close();

    if (!stored || stored.userId !== userId) {
      return null;
    }

    return { publicKey: stored.publicKey, privateKey: stored.privateKey };
  } catch {
    return null;
  }
}

export async function clearPrivateKey(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDENTITY_STORE_NAME, 'readwrite');
      tx.objectStore(IDENTITY_STORE_NAME).delete(RECORD_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Falha ao limpar a chave local.'));
    });
    db.close();
  } catch {
    return;
  }
}

export async function saveRoomKeyGeneration(generation: StoredRoomKeyGeneration): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(ROOM_KEYS_STORE_NAME, 'readwrite');
      tx.objectStore(ROOM_KEYS_STORE_NAME).put(generation);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Falha ao salvar a chave da sala.'));
    });
    db.close();
  } catch {
    return;
  }
}

export async function loadRoomKeyGenerations(roomId: string): Promise<StoredRoomKeyGeneration[]> {
  try {
    const db = await openDb();
    const stored = await new Promise<StoredRoomKeyGeneration[]>((resolve, reject) => {
      const tx = db.transaction(ROOM_KEYS_STORE_NAME, 'readonly');
      const request = tx.objectStore(ROOM_KEYS_STORE_NAME).index(ROOM_KEYS_BY_ROOM_INDEX).getAll(roomId);
      request.onsuccess = () => resolve(request.result as StoredRoomKeyGeneration[]);
      request.onerror = () => reject(request.error ?? new Error('Falha ao ler a chave da sala.'));
    });
    db.close();

    return stored;
  } catch {
    return [];
  }
}

export async function clearRoomKeyStore(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(ROOM_KEYS_STORE_NAME, 'readwrite');
      tx.objectStore(ROOM_KEYS_STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Falha ao limpar as chaves de sala.'));
    });
    db.close();
  } catch {
    return;
  }
}

export function contactPinId(ownerId: string, contactId: string): string {
  return `${ownerId}:${contactId}`;
}

export async function loadContactPin(ownerId: string, contactId: string): Promise<ContactPin | null> {
  try {
    const db = await openDb();
    const stored = await new Promise<ContactPin | undefined>((resolve, reject) => {
      const tx = db.transaction(CONTACT_PINS_STORE_NAME, 'readonly');
      const request = tx.objectStore(CONTACT_PINS_STORE_NAME).get(contactPinId(ownerId, contactId));
      request.onsuccess = () => resolve(request.result as ContactPin | undefined);
      request.onerror = () => reject(request.error ?? new Error('Falha ao ler a chave do contato.'));
    });
    db.close();

    return stored ?? null;
  } catch {
    return null;
  }
}

export async function saveContactPin(pin: ContactPin): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CONTACT_PINS_STORE_NAME, 'readwrite');
      tx.objectStore(CONTACT_PINS_STORE_NAME).put(pin);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Falha ao salvar a chave do contato.'));
    });
    db.close();
  } catch {
    return;
  }
}
