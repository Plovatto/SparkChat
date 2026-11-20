import { clearGifMediaCache } from '@features/gifs/utils/gif-media-cache';
import { clearGifStatusCache } from '@features/gifs/utils/gif-status-cache';
import { clearLocalPushSubscription } from '@features/pwa/lib/push-subscription';
import { clearIdentity, clearRoomKeys } from '@lib/e2ee';
import { clearStoredSession } from '../api/session-storage';

export const ACCOUNT_INDEXED_DB_NAMES: readonly string[] = ['sparkchat-e2ee', 'sparkchat-recovery-files'];
export const DELETE_DATABASE_TIMEOUT_MS = 3000;

export function deleteIndexedDatabase(name: string, timeoutMs = DELETE_DATABASE_TIMEOUT_MS): Promise<void> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, timeoutMs);
    const finish = () => {
      clearTimeout(timer);
      resolve();
    };
    try {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = finish;
      request.onerror = finish;
      request.onblocked = finish;
    } catch {
      finish();
    }
  });
}

export async function clearLocalAccountData(): Promise<void> {
  clearStoredSession();
  clearGifMediaCache();
  clearGifStatusCache();
  await Promise.allSettled([clearIdentity(), clearRoomKeys(), clearLocalPushSubscription()]);
  await Promise.all(ACCOUNT_INDEXED_DB_NAMES.map((name) => deleteIndexedDatabase(name)));
}
