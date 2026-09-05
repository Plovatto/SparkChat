const DB_NAME = 'sparkchat-e2ee';
const DB_VERSION = 2;
const IDENTITY_STORE_NAME = 'identity';
const ROOM_KEYS_STORE_NAME = 'room_keys';
const RECORD_KEY = 'current';

interface StoredIdentity {
  userId: string;
  publicKey: string;
  privateKey: Uint8Array;
}

interface StoredRoomKey {
  roomId: string;
  key: Uint8Array;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(IDENTITY_STORE_NAME)) {
        request.result.createObjectStore(IDENTITY_STORE_NAME);
      }
      if (!request.result.objectStoreNames.contains(ROOM_KEYS_STORE_NAME)) {
        request.result.createObjectStore(ROOM_KEYS_STORE_NAME, { keyPath: 'roomId' });
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

export async function saveRoomKey(roomId: string, key: Uint8Array): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(ROOM_KEYS_STORE_NAME, 'readwrite');
      tx.objectStore(ROOM_KEYS_STORE_NAME).put({ roomId, key } satisfies StoredRoomKey);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Falha ao salvar a chave da sala.'));
    });
    db.close();
  } catch {
    return;
  }
}

export async function loadRoomKey(roomId: string): Promise<Uint8Array | null> {
  try {
    const db = await openDb();
    const stored = await new Promise<StoredRoomKey | undefined>((resolve, reject) => {
      const tx = db.transaction(ROOM_KEYS_STORE_NAME, 'readonly');
      const request = tx.objectStore(ROOM_KEYS_STORE_NAME).get(roomId);
      request.onsuccess = () => resolve(request.result as StoredRoomKey | undefined);
      request.onerror = () => reject(request.error ?? new Error('Falha ao ler a chave da sala.'));
    });
    db.close();

    return stored?.key ?? null;
  } catch {
    return null;
  }
}

export async function deleteRoomKey(roomId: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(ROOM_KEYS_STORE_NAME, 'readwrite');
      tx.objectStore(ROOM_KEYS_STORE_NAME).delete(roomId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Falha ao remover a chave da sala.'));
    });
    db.close();
  } catch {
    return;
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
