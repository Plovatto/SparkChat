import { openLocalSecret, sealLocalSecret } from '../../../lib/e2ee/key-store';

export const NOTIFICATION_MIRROR_DB = 'sparkchat-notify';
const STORE = 'kv';
const RECORD_KEY = 'current';
const DISPLAY_CONTEXT = 'sparkchat:notify-display:v1';
const MAX_NAME_LENGTH = 80;

export interface NotificationDisplayNames {
  users: Record<string, string>;
  groups: Record<string, string>;
}

export interface NotificationMirror {
  ownerId: string;
  hideContent: boolean;
  language: 'pt' | 'en';
  names: NotificationDisplayNames;
}

interface StoredMirror {
  ownerId: string;
  hideContent: boolean;
  language: 'pt' | 'en';
  display: unknown;
}

const EMPTY_NAMES: NotificationDisplayNames = { users: {}, groups: {} };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(NOTIFICATION_MIRROR_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('notify store unavailable'));
  });
}

function run<T>(mode: IDBTransactionMode, apply: (store: IDBObjectStore) => IDBRequest | void): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = apply(tx.objectStore(STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(request ? (request.result as T) : undefined);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error ?? new Error('notify store failed'));
        };
        tx.onabort = tx.onerror;
      }),
  );
}

function cleanNames(source: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [id, name] of Object.entries(source)) {
    const trimmed = typeof name === 'string' ? name.trim().slice(0, MAX_NAME_LENGTH) : '';
    if (trimmed) {
      result[id] = trimmed;
    }
  }
  return result;
}

export async function writeNotificationMirror(mirror: NotificationMirror): Promise<void> {
  const names = { users: cleanNames(mirror.names.users), groups: cleanNames(mirror.names.groups) };
  const display = await sealLocalSecret(DISPLAY_CONTEXT, [mirror.ownerId], new TextEncoder().encode(JSON.stringify(names)));
  const record: StoredMirror = { ownerId: mirror.ownerId, hideContent: mirror.hideContent, language: mirror.language, display };
  await run('readwrite', (store) => store.put(record, RECORD_KEY));
}

function parseNames(bytes: Uint8Array | null): NotificationDisplayNames {
  if (!bytes) {
    return EMPTY_NAMES;
  }
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<NotificationDisplayNames>;
    return {
      users: parsed.users && typeof parsed.users === 'object' ? cleanNames(parsed.users) : {},
      groups: parsed.groups && typeof parsed.groups === 'object' ? cleanNames(parsed.groups) : {},
    };
  } catch {
    return EMPTY_NAMES;
  }
}

export async function readNotificationMirror(): Promise<NotificationMirror | null> {
  try {
    const stored = await run<StoredMirror>('readonly', (store) => store.get(RECORD_KEY));
    if (!stored || typeof stored.ownerId !== 'string') {
      return null;
    }
    const names = parseNames(await openLocalSecret(stored.display, DISPLAY_CONTEXT, [stored.ownerId]));
    return {
      ownerId: stored.ownerId,
      hideContent: stored.hideContent !== false,
      language: stored.language === 'en' ? 'en' : 'pt',
      names,
    };
  } catch {
    return null;
  }
}

export async function clearNotificationMirror(): Promise<void> {
  try {
    await run('readwrite', (store) => store.delete(RECORD_KEY));
  } catch {
    return;
  }
}
