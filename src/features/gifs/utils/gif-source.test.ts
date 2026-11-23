import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGifSource, type GifRequestContext } from './gif-source';

vi.mock('@config/env', () => ({ env: { apiUrl: 'https://api.test' } }));
vi.mock('@lib/i18n/app-i18n', () => ({ translate: (key: string) => key, hasTranslation: () => false }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createGifSource', () => {
  it('reads the current session and locale on every request', async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(Response.json({ items: [], page: 1, hasNext: false })));
    vi.stubGlobal('fetch', fetchSpy);
    let context: GifRequestContext = { auth: { userId: 'u', sessionToken: 'old' }, locale: 'br' };
    const source = createGifSource(() => context);
    const signal = new AbortController().signal;

    await source.trending(1, signal);
    context = { auth: { userId: 'u', sessionToken: 'new' }, locale: 'us' };
    await source.search('cat', 2, signal);

    const calls = fetchSpy.mock.calls as unknown as [string, RequestInit][];
    expect(new Headers(calls[0]?.[1].headers).get('Authorization')).toBe('Bearer u:old');
    expect(JSON.parse(calls[0]?.[1].body as string)).toEqual({ page: 1, locale: 'br' });
    expect(new Headers(calls[1]?.[1].headers).get('Authorization')).toBe('Bearer u:new');
    expect(JSON.parse(calls[1]?.[1].body as string)).toEqual({ q: 'cat', page: 2, locale: 'us' });
  });
});
