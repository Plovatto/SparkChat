import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearCachedModels,
  ensureModelFileCached,
  fetchModelFile,
  hasCachedPair,
  TRANSLATION_MODELS_CACHE,
  type BergamotModelFile,
  type BergamotRegistry,
} from './model-fetch';
import { chunkedResponse, FakeCacheStorage, gzip, sha256Hex } from './test-fakes.test-utils';

const BASE = 'https://spark.test/translation-models/v1/';
const VOCAB_TEXT = 'vocab bytes for the test '.repeat(40);
const VOCAB_RAW = new TextEncoder().encode(VOCAB_TEXT);
const VOCAB_GZ = gzip(VOCAB_TEXT);
const VOCAB_URL = `${BASE}enpt/vocab.enpt.spm.gz`;

function fileFor(name: string, raw: Uint8Array, gz: Uint8Array): BergamotModelFile {
  return { name, size: gz.byteLength, expectedSha256Hash: sha256Hex(gz), rawSize: raw.byteLength, rawSha256Hash: sha256Hex(raw) };
}

const VOCAB = fileFor(VOCAB_URL, VOCAB_RAW, VOCAB_GZ);

let cacheStorage: FakeCacheStorage;
let fetchSpy: ReturnType<typeof vi.fn<typeof fetch>>;

const decode = (buffer: ArrayBuffer) => new TextDecoder().decode(buffer);
const failure = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => (error as Error).message,
  );

beforeEach(() => {
  cacheStorage = new FakeCacheStorage();
  (globalThis as Record<string, unknown>).caches = cacheStorage;
  fetchSpy = vi.fn<typeof fetch>(() => Promise.resolve(chunkedResponse(VOCAB_GZ, 8)));
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (globalThis as Record<string, unknown>).caches;
});

describe('fetchModelFile', () => {
  it('downloads gzip bytes without credentials, verifies both hashes and returns them decompressed', async () => {
    const onBytes = vi.fn<(n: number) => void>();
    expect(decode(await fetchModelFile(VOCAB, onBytes))).toBe(VOCAB_TEXT);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe(VOCAB_URL);
    expect(init).toMatchObject({ credentials: 'omit' });
    expect(init).not.toHaveProperty('integrity');
    expect(onBytes.mock.calls.length).toBeGreaterThan(1);
    expect(onBytes.mock.calls.reduce((sum, [n]) => sum + n, 0)).toBe(VOCAB.size);
  });

  it('accepts a body the browser already decoded (Content-Encoding: gzip), counting progress up to the registry size', async () => {
    fetchSpy.mockResolvedValueOnce(chunkedResponse(VOCAB_RAW, 64));
    const onBytes = vi.fn<(n: number) => void>();
    expect(decode(await fetchModelFile(VOCAB, onBytes))).toBe(VOCAB_TEXT);
    expect(VOCAB_RAW.byteLength).toBeGreaterThan(VOCAB.size);
    expect(onBytes.mock.calls.reduce((sum, [n]) => sum + n, 0)).toBe(VOCAB.size);
  });

  it('rejects wrong gzip bytes with integrity-failed and caches nothing', async () => {
    const tampered = VOCAB_GZ.slice();
    tampered[tampered.length - 9]! ^= 0xff;
    fetchSpy.mockResolvedValueOnce(chunkedResponse(tampered));
    expect(await failure(fetchModelFile(VOCAB, () => undefined))).toBe('integrity-failed');
    expect(cacheStorage.putUrls).toEqual([]);
  });

  it('stops reading a body larger than the pinned sizes and rejects it with integrity-failed', async () => {
    const oversized = new Uint8Array(VOCAB_RAW.byteLength * 4).fill(0x61);
    let pulls = 0;
    let offset = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (offset >= oversized.byteLength) {
          controller.close();
          return;
        }
        controller.enqueue(oversized.slice(offset, offset + 64));
        offset += 64;
      },
    });
    fetchSpy.mockResolvedValueOnce(new Response(body, { status: 200 }));
    expect(await failure(fetchModelFile(VOCAB, () => undefined))).toBe('integrity-failed');
    expect(pulls * 64).toBeLessThan(oversized.byteLength);
    expect(cacheStorage.putUrls).toEqual([]);
  });

  it('rejects gzip bytes that match the compressed hash but not the raw one', async () => {
    expect(await failure(fetchModelFile({ ...VOCAB, rawSha256Hash: 'ab'.repeat(32) }, () => undefined))).toBe('integrity-failed');
    expect(cacheStorage.putUrls).toEqual([]);
  });

  it('rejects wrong decoded bytes with integrity-failed and caches nothing', async () => {
    const tampered = VOCAB_RAW.slice();
    tampered[3] = 0x21;
    fetchSpy.mockResolvedValueOnce(chunkedResponse(tampered));
    expect(await failure(fetchModelFile(VOCAB, () => undefined))).toBe('integrity-failed');
    expect(cacheStorage.putUrls).toEqual([]);
  });

  it('treats a truncated body as a network failure, not tampering', async () => {
    fetchSpy.mockResolvedValueOnce(chunkedResponse(VOCAB_GZ.slice(0, VOCAB_GZ.byteLength - 10)));
    expect(await failure(fetchModelFile(VOCAB, () => undefined))).toBe('download-failed');
    fetchSpy.mockResolvedValueOnce(chunkedResponse(VOCAB_RAW.slice(0, 100)));
    expect(await failure(fetchModelFile(VOCAB, () => undefined))).toBe('download-failed');
  });

  it('rejects and caches nothing on an HTTP error or a network error', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('missing', { status: 404 }));
    expect(await failure(fetchModelFile(VOCAB, () => undefined))).toBe('download-failed');
    fetchSpy.mockRejectedValueOnce(new TypeError('offline'));
    expect(await failure(fetchModelFile(VOCAB, () => undefined))).toBe('download-failed');
    expect(cacheStorage.putUrls).toEqual([]);
  });

  it('serves model files from the Cache API on the second load, stored decompressed', async () => {
    await ensureModelFileCached(VOCAB, () => undefined);
    fetchSpy.mockClear();
    expect(decode(await fetchModelFile(VOCAB, () => undefined))).toBe(VOCAB_TEXT);
    expect(fetchSpy).toHaveBeenCalledTimes(0);
    expect(cacheStorage.putUrls).toEqual([VOCAB_URL]);
    expect([...cacheStorage.stores.keys()]).toEqual([TRANSLATION_MODELS_CACHE]);
    expect(decode(cacheStorage.stores.get(TRANSLATION_MODELS_CACHE)!.get(VOCAB_URL)!.slice().buffer)).toBe(VOCAB_TEXT);
  });

  it('drops a stale or corrupt cache entry and downloads it again', async () => {
    const cache = await cacheStorage.open(TRANSLATION_MODELS_CACHE);
    await cache.put(VOCAB_URL, new Response(VOCAB_GZ.slice()));
    expect(decode(await fetchModelFile(VOCAB, () => undefined))).toBe(VOCAB_TEXT);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(decode(await (await cache.match(VOCAB_URL))!.arrayBuffer())).toBe(VOCAB_TEXT);
  });
});

describe('cached pairs', () => {
  it('tells whether every file of a pair is cached, and clears them', async () => {
    const pair = (key: string) => ({
      model: { ...VOCAB, name: `${BASE}${key}/model.bin.gz` },
      lex: { ...VOCAB, name: `${BASE}${key}/lex.bin.gz` },
      vocab: { ...VOCAB, name: `${BASE}${key}/vocab.spm.gz` },
    });
    const registry: BergamotRegistry = { enpt: pair('enpt'), pten: pair('pten') };
    expect(await hasCachedPair('en-pt', registry)).toBe(false);
    for (const file of Object.values(registry.enpt)) {
      await fetchModelFile(file, () => undefined);
    }
    expect(await hasCachedPair('en-pt', registry)).toBe(true);
    expect(await hasCachedPair('pt-en', registry)).toBe(false);
    await clearCachedModels();
    expect(await hasCachedPair('en-pt', registry)).toBe(false);
  });
});
