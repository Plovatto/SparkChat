import { describe, expect, it } from 'vitest';
import { armCallAnswer, ARMED_ANSWER_TTL_MS, consumeArmedAnswer } from './armed-answer';

function memoryCaches() {
  const stores = new Map<string, Map<string, Response>>();
  return {
    open: (name: string) => {
      const store = stores.get(name) ?? new Map<string, Response>();
      stores.set(name, store);
      return Promise.resolve({
        put: (url: string, response: Response) => {
          store.set(url, response);
          return Promise.resolve();
        },
        match: (url: string) => Promise.resolve(store.get(url)?.clone()),
        delete: (url: string) => Promise.resolve(store.delete(url)),
      } as unknown as Cache);
    },
  };
}

const SCOPE = 'https://chat.example/app/';

describe('armed call answers', () => {
  it('never answers from a crafted launch url the service worker did not arm', async () => {
    expect(await consumeArmedAnswer(memoryCaches(), SCOPE, 'c1', 1000)).toBe(false);
    expect(await consumeArmedAnswer(null, SCOPE, 'c1', 1000)).toBe(false);
  });

  it('answers once for the call the notification armed and refuses a replay', async () => {
    const caches = memoryCaches();
    await armCallAnswer(caches, SCOPE, 'c1', 1000);

    expect(await consumeArmedAnswer(caches, SCOPE, 'c2', 1000)).toBe(false);
    expect(await consumeArmedAnswer(caches, SCOPE, 'c1', 2000)).toBe(true);
    expect(await consumeArmedAnswer(caches, SCOPE, 'c1', 2000)).toBe(false);
  });

  it('refuses an armed answer once it expired and ignores unsafe ids', async () => {
    const caches = memoryCaches();
    await armCallAnswer(caches, SCOPE, 'c1', 1000);
    await armCallAnswer(caches, SCOPE, '../x', 1000);

    expect(await consumeArmedAnswer(caches, SCOPE, 'c1', 1000 + ARMED_ANSWER_TTL_MS + 1)).toBe(false);
    expect(await consumeArmedAnswer(caches, SCOPE, '../x', 1000)).toBe(false);
  });
});
