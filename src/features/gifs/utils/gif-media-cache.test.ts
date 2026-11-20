import { describe, expect, it, vi } from 'vitest';
import { GIF_MEDIA_CACHE_LIMIT, GIF_MEDIA_CACHE_MAX_BYTES, GifMediaCache, pickDisplayedGif } from './gif-media-cache';

const WEBP_BYTES = new TextEncoder().encode('RIFF____WEBPVP8 data');
const GIF_BYTES = new TextEncoder().encode('GIF89a data');

function webpOfSize(size: number): Blob {
  const bytes = new Uint8Array(size);
  bytes.set(WEBP_BYTES);
  return new Blob([bytes]);
}

describe('GifMediaCache', () => {
  it('loads media once, sniffs its type and serves it from memory', async () => {
    const cache = new GifMediaCache({ maxEntries: 10 });
    const loader = vi.fn(() => Promise.resolve(new Blob([WEBP_BYTES], { type: 'application/octet-stream' })));

    const [first, second] = await Promise.all([cache.load('https://a', loader), cache.load('https://a', loader)]);
    const third = await cache.load('https://a', loader);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
    expect(third).toBe(first);
    expect(first?.mimeType).toBe('image/webp');
    expect(first?.blob.type).toBe('image/webp');
    expect(cache.peek('https://a')).toBe(first);
  });

  it('recognizes gif media', async () => {
    const cache = new GifMediaCache();

    const entry = await cache.load('https://g', () => Promise.resolve(new Blob([GIF_BYTES])));

    expect(entry?.mimeType).toBe('image/gif');
  });

  it('refuses media that is not webp or gif and failed loads without caching them', async () => {
    const cache = new GifMediaCache();

    await expect(cache.load('https://svg', () => Promise.resolve(new Blob(['<svg/>'])))).resolves.toBeNull();
    await expect(cache.load('https://down', () => Promise.reject(new Error('offline')))).resolves.toBeNull();

    expect(cache.size).toBe(0);
  });

  it('evicts the least recently used entries beyond the item limit', async () => {
    const cache = new GifMediaCache({ maxEntries: 2 });
    const loader = () => Promise.resolve(new Blob([WEBP_BYTES]));

    await cache.load('https://1', loader);
    await cache.load('https://2', loader);
    cache.peek('https://1');
    await cache.load('https://3', loader);

    expect(cache.size).toBe(2);
    expect(cache.peek('https://2')).toBeUndefined();
    expect(cache.peek('https://1')).toBeDefined();
  });

  it('caps the cache by total bytes as well', async () => {
    const cache = new GifMediaCache({ maxEntries: 100, maxBytes: 1000 });

    await cache.load('https://1', () => Promise.resolve(webpOfSize(400)));
    await cache.load('https://2', () => Promise.resolve(webpOfSize(400)));
    await cache.load('https://3', () => Promise.resolve(webpOfSize(400)));

    expect(cache.bytes).toBe(800);
    expect(cache.peek('https://1')).toBeUndefined();
    expect(cache.size).toBe(2);
  });

  it('keeps the blob of an evicted entry usable for the tile that still shows it', async () => {
    const cache = new GifMediaCache({ maxEntries: 1 });
    const shown = await cache.load('https://shown', () => Promise.resolve(new Blob([WEBP_BYTES])));

    await cache.load('https://other', () => Promise.resolve(new Blob([GIF_BYTES])));

    expect(cache.peek('https://shown')).toBeUndefined();
    expect(new Uint8Array(await (shown?.blob as Blob).arrayBuffer())).toEqual(WEBP_BYTES);
  });

  it('drops loads that finish after the cache was cleared', async () => {
    const cache = new GifMediaCache();
    let resolveLoad: (blob: Blob) => void = () => undefined;
    const pending = cache.load('https://late', () => new Promise<Blob>((resolve) => (resolveLoad = resolve)));

    cache.clear();
    resolveLoad(new Blob([WEBP_BYTES]));

    await expect(pending).resolves.toBeNull();
    expect(cache.size).toBe(0);
    expect(cache.bytes).toBe(0);
  });

  it('keeps around two hundred items and sixty megabytes by default', () => {
    expect(GIF_MEDIA_CACHE_LIMIT).toBe(200);
    expect(GIF_MEDIA_CACHE_MAX_BYTES).toBe(60 * 1024 * 1024);
  });
});

describe('pickDisplayedGif', () => {
  it('only sends the blob the tile already displayed, even after cache eviction, without any request', async () => {
    const cache = new GifMediaCache({ maxEntries: 1 });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const loader = vi.fn(() => Promise.resolve(new Blob([WEBP_BYTES])));
    const displayed = await cache.load('https://a', loader);
    await cache.load('https://b', () => Promise.resolve(new Blob([GIF_BYTES])));

    expect(pickDisplayedGif(null, false)).toBeNull();
    expect(pickDisplayedGif(displayed, false)).toBeNull();
    expect(pickDisplayedGif(displayed, true)).toBe(displayed?.blob);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
