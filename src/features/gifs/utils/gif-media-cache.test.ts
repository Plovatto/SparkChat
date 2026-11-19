import { describe, expect, it, vi } from 'vitest';
import { GIF_MEDIA_CACHE_LIMIT, GifMediaCache, takeLoadedGif } from './gif-media-cache';

const WEBP_BYTES = new TextEncoder().encode('RIFF____WEBPVP8 data');
const GIF_BYTES = new TextEncoder().encode('GIF89a data');

function createObjectUrls() {
  let counter = 0;
  const revoked: string[] = [];
  return {
    revoked,
    api: {
      create: vi.fn(() => {
        counter += 1;
        return `blob:gif/${counter}`;
      }),
      revoke: vi.fn((url: string) => {
        revoked.push(url);
      }),
    },
  };
}

describe('GifMediaCache', () => {
  it('loads media once, sniffs its type and serves it from memory', async () => {
    const { api } = createObjectUrls();
    const cache = new GifMediaCache(10, api);
    const loader = vi.fn(() => Promise.resolve(new Blob([WEBP_BYTES], { type: 'application/octet-stream' })));

    const [first, second] = await Promise.all([cache.load('https://a', loader), cache.load('https://a', loader)]);
    const third = await cache.load('https://a', loader);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
    expect(third).toBe(first);
    expect(first?.mimeType).toBe('image/webp');
    expect(first?.blob.type).toBe('image/webp');
    expect(first?.objectUrl).toBe('blob:gif/1');
    expect(cache.peek('https://a')).toBe(first);
  });

  it('recognizes gif media', async () => {
    const cache = new GifMediaCache(10, createObjectUrls().api);

    const entry = await cache.load('https://g', () => Promise.resolve(new Blob([GIF_BYTES])));

    expect(entry?.mimeType).toBe('image/gif');
  });

  it('refuses media that is not webp or gif and failed loads without caching them', async () => {
    const { api } = createObjectUrls();
    const cache = new GifMediaCache(10, api);

    await expect(cache.load('https://svg', () => Promise.resolve(new Blob(['<svg/>'])))).resolves.toBeNull();
    await expect(cache.load('https://down', () => Promise.reject(new Error('offline')))).resolves.toBeNull();

    expect(cache.size).toBe(0);
    expect(api.create).not.toHaveBeenCalled();
  });

  it('revokes the object url of entries that leave the cache', async () => {
    const { api, revoked } = createObjectUrls();
    const cache = new GifMediaCache(2, api);
    const loader = () => Promise.resolve(new Blob([WEBP_BYTES]));

    await cache.load('https://1', loader);
    await cache.load('https://2', loader);
    await cache.load('https://3', loader);

    expect(cache.size).toBe(2);
    expect(cache.peek('https://1')).toBeUndefined();
    expect(revoked).toEqual(['blob:gif/1']);

    cache.clear();
    expect(revoked).toEqual(['blob:gif/1', 'blob:gif/2', 'blob:gif/3']);
  });

  it('drops loads that finish after the cache was cleared', async () => {
    const { api, revoked } = createObjectUrls();
    const cache = new GifMediaCache(10, api);
    let resolveLoad: (blob: Blob) => void = () => undefined;
    const pending = cache.load('https://late', () => new Promise<Blob>((resolve) => (resolveLoad = resolve)));

    cache.clear();
    resolveLoad(new Blob([WEBP_BYTES]));

    await expect(pending).resolves.toBeNull();
    expect(cache.size).toBe(0);
    expect(revoked).toEqual(['blob:gif/1']);
  });

  it('keeps around two hundred items by default', () => {
    expect(GIF_MEDIA_CACHE_LIMIT).toBe(200);
  });
});

describe('takeLoadedGif', () => {
  it('only returns a gif that was already loaded for display and never fetches', async () => {
    const cache = new GifMediaCache(10, createObjectUrls().api);
    const loader = vi.fn(() => Promise.resolve(new Blob([WEBP_BYTES])));
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    expect(takeLoadedGif(cache, 'https://a')).toBeNull();

    await cache.load('https://a', loader);
    const blob = takeLoadedGif(cache, 'https://a');

    expect(blob?.type).toBe('image/webp');
    expect(loader).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
