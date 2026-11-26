import { describe, expect, it } from 'vitest';
import { DISMISSED_CALL_TTL_MS, isCallDismissed, rememberDismissedCall } from './dismissed-call';

function memoryCaches() {
  const store = new Map<string, Response>();
  return {
    store,
    open: () =>
      Promise.resolve({
        put: (url: string, response: Response) => {
          store.set(url, response);
          return Promise.resolve();
        },
        match: (url: string) => Promise.resolve(store.get(url)?.clone()),
        keys: () => Promise.resolve([...store.keys()]),
        delete: (url: string) => Promise.resolve(store.delete(url)),
      } as unknown as Cache),
  };
}

const SCOPE = 'https://chat.example/app/';

describe('dismissed calls', () => {
  it('knows nothing about calls the user did not dismiss', async () => {
    expect(await isCallDismissed(memoryCaches(), SCOPE, 'c1', 1000)).toBe(false);
    expect(await isCallDismissed(null, SCOPE, 'c1', 1000)).toBe(false);
  });

  it('remembers a dismissal until it expires', async () => {
    const caches = memoryCaches();
    await rememberDismissedCall(caches, SCOPE, 'c1', 1000);
    expect(await isCallDismissed(caches, SCOPE, 'c1', 1000 + DISMISSED_CALL_TTL_MS - 1)).toBe(true);
    expect(await isCallDismissed(caches, SCOPE, 'c1', 1000 + DISMISSED_CALL_TTL_MS)).toBe(false);
    expect(await isCallDismissed(caches, SCOPE, 'c2', 1000)).toBe(false);
  });

  it('drops expired dismissals when a new one is stored', async () => {
    const caches = memoryCaches();
    await rememberDismissedCall(caches, SCOPE, 'c1', 1000);
    await rememberDismissedCall(caches, SCOPE, 'c2', 1000 + DISMISSED_CALL_TTL_MS);
    expect(caches.store.size).toBe(1);
    expect(await isCallDismissed(caches, SCOPE, 'c2', 1000 + DISMISSED_CALL_TTL_MS)).toBe(true);
  });

  it('ignores unsafe ids', async () => {
    const caches = memoryCaches();
    await rememberDismissedCall(caches, SCOPE, '../x', 1000);
    expect(await isCallDismissed(caches, SCOPE, '../x', 1000)).toBe(false);
  });
});
