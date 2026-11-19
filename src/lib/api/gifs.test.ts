import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './api-error';
import { fetchGifMedia, fetchGifStatus, fetchTrendingGifs, searchGifs } from './gifs';

vi.mock('@config/env', () => ({ env: { apiUrl: 'https://api.test' } }));
vi.mock('@lib/i18n/app-i18n', () => ({ translate: (key: string) => key, hasTranslation: () => false }));

const AUTH = { userId: 'user-1', sessionToken: 'token' };
const ITEM = { id: '42', title: 'Happy cat', url: 'https://static.klipy.com/ii/abcdefgh/14/af/eUbp2uNc.webp', width: 220, height: 160, size: 1000 };

function stubFetch(response: Response) {
  const fetchSpy = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchSpy);
  return fetchSpy;
}

function lastCall(fetchSpy: ReturnType<typeof vi.fn>): [string, RequestInit] {
  return fetchSpy.mock.calls.at(-1) as [string, RequestInit];
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchGifStatus', () => {
  it('reads the enabled flag with the session header', async () => {
    const fetchSpy = stubFetch(Response.json({ enabled: true }));

    await expect(fetchGifStatus(AUTH)).resolves.toBe(true);

    const [url, init] = lastCall(fetchSpy);
    expect(url).toBe('https://api.test/api/gifs/status');
    expect(init.headers).toEqual({ Authorization: 'Bearer user-1:token' });
  });

  it('treats errors and malformed bodies as disabled', async () => {
    stubFetch(Response.json({ code: 'gifs.unavailable' }, { status: 503 }));
    await expect(fetchGifStatus(AUTH)).resolves.toBe(false);

    stubFetch(Response.json({ enabled: 'yes' }));
    await expect(fetchGifStatus(AUTH)).resolves.toBe(false);

    stubFetch(new Response('not found', { status: 404 }));
    await expect(fetchGifStatus(AUTH)).resolves.toBe(false);
  });
});

describe('fetchTrendingGifs and searchGifs', () => {
  it('posts the trending page and locale and normalizes the page', async () => {
    const fetchSpy = stubFetch(Response.json({ items: [ITEM], page: 2, hasNext: true }));

    const page = await fetchTrendingGifs(AUTH, { page: 2, locale: 'br' });

    const [url, init] = lastCall(fetchSpy);
    expect(url).toBe('https://api.test/api/gifs/trending');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ page: 2, locale: 'br' });
    expect(page).toEqual({ items: [ITEM], page: 2, hasNext: true });
  });

  it('posts the search term in the body and forwards the abort signal', async () => {
    const fetchSpy = stubFetch(Response.json({ items: [], page: 1, hasNext: false }));
    const controller = new AbortController();

    await searchGifs(AUTH, { q: 'gato feliz', locale: 'us' }, controller.signal);

    const [url, init] = lastCall(fetchSpy);
    expect(url).toBe('https://api.test/api/gifs/search');
    expect(url).not.toContain('gato');
    expect(JSON.parse(init.body as string)).toEqual({ q: 'gato feliz', locale: 'us' });
    expect(init.signal).toBe(controller.signal);
  });

  it('drops malformed items', async () => {
    stubFetch(
      Response.json({
        items: [ITEM, { ...ITEM, id: 7 }, { ...ITEM, url: 'http://static.klipy.com/a.webp' }, { ...ITEM, width: 0 }, null, { ...ITEM, id: '43', title: 5 }],
        page: 1,
        hasNext: false,
      }),
    );

    const page = await fetchTrendingGifs(AUTH);

    expect(page.items.map((item) => item.id)).toEqual(['42', '43']);
    expect(page.items[1]?.title).toBe('');
  });

  it('throws an api error carrying the server code', async () => {
    stubFetch(Response.json({ code: 'gifs.providerFailed' }, { status: 502 }));

    const error = await fetchTrendingGifs(AUTH).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('gifs.providerFailed');
  });

  it('throws on rate limiting', async () => {
    stubFetch(Response.json({ code: 'rateLimit.gifs' }, { status: 429 }));

    await expect(searchGifs(AUTH, { q: 'cat' })).rejects.toMatchObject({ code: 'rateLimit.gifs' });
  });
});

describe('fetchGifMedia', () => {
  it('posts the media url in the body and returns the bytes', async () => {
    const fetchSpy = stubFetch(new Response(new Blob(['RIFF'], { type: 'image/webp' })));

    const blob = await fetchGifMedia(ITEM.url, AUTH);

    const [url, init] = lastCall(fetchSpy);
    expect(url).toBe('https://api.test/api/gifs/media');
    expect(JSON.parse(init.body as string)).toEqual({ url: ITEM.url });
    expect(await blob.text()).toBe('RIFF');
  });

  it('throws when the media is refused', async () => {
    stubFetch(Response.json({ code: 'gifs.invalidMediaUrl' }, { status: 400 }));

    await expect(fetchGifMedia('https://evil.test/a.webp', AUTH)).rejects.toMatchObject({ code: 'gifs.invalidMediaUrl' });
  });
});
