import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearCachedModels,
  fetchModelFile,
  hasCachedPair,
  loadRegistry,
  TRANSLATION_MODELS_CACHE,
  type BergamotRegistry,
} from './model-fetch';
import { chunkedResponse, FakeCacheStorage, gzip, sha256Hex, urlOf } from './test-fakes';

const BASE = 'https://spark.test/translation-models/v1/';
const VOCAB_TEXT = 'vocab bytes for the test';
const VOCAB_GZ = gzip(VOCAB_TEXT);
const VOCAB_URL = `${BASE}enpt/vocab.enpt.spm.gz`;

let cacheStorage: FakeCacheStorage;
let fetchSpy: ReturnType<typeof vi.fn<typeof fetch>>;

function fileEntry(name: string, bytes: Uint8Array) {
  return { name, size: bytes.byteLength, expectedSha256Hash: sha256Hex(bytes) };
}

function rawRegistry() {
  const pair = (key: string) => ({
    model: fileEntry(`${key}/model.${key}.intgemm.alphas.bin.gz`, VOCAB_GZ),
    lex: fileEntry(`${key}/lex.50.50.${key}.s2t.bin.gz`, VOCAB_GZ),
    vocab: fileEntry(`${key}/vocab.${key}.spm.gz`, VOCAB_GZ),
  });
  return { enpt: pair('enpt'), pten: pair('pten') };
}

beforeEach(() => {
  cacheStorage = new FakeCacheStorage();
  (globalThis as Record<string, unknown>).caches = cacheStorage;
  fetchSpy = vi.fn<typeof fetch>((input) => {
    const url = urlOf(input);
    if (url.endsWith('registry.json')) {
      return Promise.resolve(new Response(JSON.stringify(rawRegistry()), { status: 200 }));
    }
    return Promise.resolve(chunkedResponse(VOCAB_GZ, 8));
  });
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (globalThis as Record<string, unknown>).caches;
});

describe('fetchModelFile', () => {
  it('downloads with SRI and no credentials, counts streamed bytes and gunzips', async () => {
    const onBytes = vi.fn<(n: number) => void>();
    const buffer = await fetchModelFile(VOCAB_URL, sha256Hex(VOCAB_GZ), onBytes);
    expect(new TextDecoder().decode(buffer)).toBe(VOCAB_TEXT);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe(VOCAB_URL);
    expect(init).toMatchObject({
      credentials: 'omit',
      integrity: `sha256-${Buffer.from(sha256Hex(VOCAB_GZ), 'hex').toString('base64')}`,
    });
    expect(onBytes.mock.calls.length).toBeGreaterThan(1);
    expect(onBytes.mock.calls.reduce((sum, [n]) => sum + n, 0)).toBe(VOCAB_GZ.byteLength);
  });

  it('serves model files from the Cache API on the second load', async () => {
    await fetchModelFile(VOCAB_URL, sha256Hex(VOCAB_GZ), () => undefined);
    fetchSpy.mockClear();
    const buffer = await fetchModelFile(VOCAB_URL, sha256Hex(VOCAB_GZ), () => undefined);
    expect(fetchSpy).toHaveBeenCalledTimes(0);
    expect(new TextDecoder().decode(buffer)).toBe(VOCAB_TEXT);
    // the cache holds the compressed, verified model file and nothing else
    expect(cacheStorage.putUrls).toEqual([VOCAB_URL]);
    expect([...cacheStorage.stores.keys()]).toEqual([TRANSLATION_MODELS_CACHE]);
  });

  it('rejects and caches nothing when the bytes do not match the sha256', async () => {
    await expect(fetchModelFile(VOCAB_URL, 'ab'.repeat(32), () => undefined)).rejects.toThrow('integrity-failed');
    expect(cacheStorage.putUrls).toEqual([]);
  });

  it('rejects and caches nothing on an HTTP error', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('missing', { status: 404 }));
    await expect(fetchModelFile(VOCAB_URL, sha256Hex(VOCAB_GZ), () => undefined)).rejects.toThrow('download-failed');
    expect(cacheStorage.putUrls).toEqual([]);
  });

  it('drops a corrupt cache entry so the next load downloads it again', async () => {
    const cache = await cacheStorage.open(TRANSLATION_MODELS_CACHE);
    await cache.put(VOCAB_URL, new Response(new TextEncoder().encode('not gzip')));
    await expect(fetchModelFile(VOCAB_URL, sha256Hex(VOCAB_GZ), () => undefined)).rejects.toThrow('model-load-failed');
    expect(await cache.match(VOCAB_URL)).toBeUndefined();
    const buffer = await fetchModelFile(VOCAB_URL, sha256Hex(VOCAB_GZ), () => undefined);
    expect(new TextDecoder().decode(buffer)).toBe(VOCAB_TEXT);
  });

  it('returns non-gzip files as they are', async () => {
    const plain = new TextEncoder().encode('plain');
    fetchSpy.mockResolvedValueOnce(new Response(plain, { status: 200 }));
    const buffer = await fetchModelFile(`${BASE}enpt/config.yml`, sha256Hex(plain), () => undefined);
    expect(new TextDecoder().decode(buffer)).toBe('plain');
  });
});

describe('registry', () => {
  it('loads the registry and resolves file names against its base URL', async () => {
    const registry = await loadRegistry(BASE);
    expect(fetchSpy.mock.calls[0]![0]).toBe(`${BASE}registry.json`);
    expect(fetchSpy.mock.calls[0]![1]).toMatchObject({ credentials: 'omit' });
    expect(registry.enpt.vocab.name).toBe(VOCAB_URL);
    expect(registry.pten.model.size).toBe(VOCAB_GZ.byteLength);
  });

  it('rejects a malformed registry', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ enpt: {} }), { status: 200 }));
    await expect(loadRegistry(BASE)).rejects.toThrow('registry-load-failed');
  });

  it('tells whether every file of a pair is cached, and clears them', async () => {
    const registry: BergamotRegistry = await loadRegistry(BASE);
    expect(await hasCachedPair('en-pt', registry)).toBe(false);
    for (const file of Object.values(registry.enpt)) {
      await fetchModelFile(file.name, file.expectedSha256Hash, () => undefined);
    }
    expect(await hasCachedPair('en-pt', registry)).toBe(true);
    expect(await hasCachedPair('pt-en', registry)).toBe(false);
    await clearCachedModels();
    expect(await hasCachedPair('en-pt', registry)).toBe(false);
  });
});
