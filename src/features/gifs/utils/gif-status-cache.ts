import { fetchGifStatus } from '@lib/api/gifs';
import type { SessionAuth } from '@lib/api/session-auth';

const statusBySession = new Map<string, Promise<boolean>>();

function sessionKey(auth: SessionAuth): string {
  return `${auth.userId}:${auth.sessionToken}`;
}

export function loadGifStatus(auth: SessionAuth, fetchStatus: (auth: SessionAuth) => Promise<boolean> = fetchGifStatus): Promise<boolean> {
  const key = sessionKey(auth);
  const cached = statusBySession.get(key);
  if (cached) {
    return cached;
  }
  const task = fetchStatus(auth).catch(() => {
    if (statusBySession.get(key) === task) {
      statusBySession.delete(key);
    }
    return false;
  });
  statusBySession.set(key, task);
  return task;
}

export function clearGifStatusCache(): void {
  statusBySession.clear();
}
