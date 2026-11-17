import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TranslationProgressEvent } from '../types';
import { chunkedResponse, FakeCacheStorage, gzip, sha256Hex, urlOf } from './test-fakes';

type FakeRequest = { from: string; to: string; text: string; html: boolean; priority?: number };
type FakeResponse = { request: FakeRequest; target: { text: string } };
type WorkerExports = Record<string, (...args: unknown[]) => Promise<unknown>>;
type BackingLike = {
  registryUrl: string;
  registry: Promise<Array<{ from: string; to: string; files: Record<string, { name: string }> }>>;
  buffers: Map<string, unknown>;
  onerror: (error: Error) => void;
  fetch(url: string, checksum: string | undefined, extra: { signal?: AbortSignal } | undefined): Promise<ArrayBuffer>;
  loadWorker(): Promise<{ worker: unknown; exports: WorkerExports }>;
  triggerError(error: Error): void;
};

type FakeState = {
  instances: number;
  deleted: number;
  requests: FakeRequest[];
  backing: unknown;
  workerExports: WorkerExports;
  translateImpl: null | ((request: FakeRequest) => Promise<unknown>);
  imports: number;
};

const fakes = vi.hoisted(() => {
  const state: FakeState = {
    instances: 0,
    deleted: 0,
    requests: [],
    backing: null,
    workerExports: {},
    translateImpl: null,
    imports: 0,
  };
  return state;
});

vi.mock('@mkljczk/bergamot-translator/translator.js', () => {
  fakes.imports += 1;
  class TranslatorBacking {
    options: Record<string, unknown>;
    registryUrl: string;
    registry: Promise<unknown>;
    buffers = new Map<string, unknown>();
    onerror: (error: Error) => void;
    constructor(options: Record<string, unknown>) {
      this.options = options;
      this.registryUrl = options.registryUrl as string;
      this.registry = this.loadModelRegistry();
      this.onerror = () => undefined;
      fakes.backing = this;
    }
    loadModelRegistry(): Promise<unknown> {
      return Promise.reject(new Error('stock registry must not be used'));
    }
    fetch(): Promise<ArrayBuffer> {
      return Promise.reject(new Error('stock fetch must not be used'));
    }
    loadWorker() {
      return Promise.resolve({ worker: { terminate: () => undefined }, exports: fakes.workerExports });
    }
    triggerError(error: Error) {
      this.onerror(error);
    }
  }
  class BatchTranslator {
    options: Record<string, unknown>;
    backing: unknown;
    constructor(options: Record<string, unknown>, backing: unknown) {
      fakes.instances += 1;
      this.options = options;
      this.backing = backing;
    }
    translate(request: { from: string; to: string; text: string; html: boolean; priority?: number }) {
      fakes.requests.push(request);
      if (fakes.translateImpl) {
        return fakes.translateImpl(request);
      }
      return Promise.resolve({ request, target: { text: `${request.to.toUpperCase()}:${request.text}` } });
    }
    delete() {
      fakes.deleted += 1;
      return Promise.resolve();
    }
  }
  return { BatchTranslator, TranslatorBacking };
});

import {
  BERGAMOT_DOWNLOAD_RETRY_COOLDOWN_MS,
  BERGAMOT_IDLE_TEARDOWN_MS,
  createBergamotEngine,
  type BergamotEngine,
} from './bergamot-engine';

const ORIGIN = 'https://spark.test';
const BASE = `${ORIGIN}/translation-models/v1/`;
const REAL_ENPT_SIZES = { model: 23340019, lex: 2117608, vocab: 408686 };

type Fixture = { registry: Record<string, Record<string, { name: string; size: number; expectedSha256Hash: string }>>; bodies: Map<string, Uint8Array> };

function smallFixture(): Fixture {
  const bodies = new Map<string, Uint8Array>();
  const registry: Fixture['registry'] = {};
  for (const key of ['enpt', 'pten']) {
    registry[key] = {};
    for (const [part, name] of [
      ['model', `${key}/model.${key}.intgemm.alphas.bin.gz`],
      ['lex', `${key}/lex.50.50.${key}.s2t.bin.gz`],
      ['vocab', `${key}/vocab.${key}.spm.gz`],
    ] as const) {
      const bytes = gzip(`contents of ${name}`);
      bodies.set(BASE + name, bytes);
      registry[key][part] = { name, size: bytes.byteLength, expectedSha256Hash: sha256Hex(bytes) };
    }
  }
  return { registry, bodies };
}

let realSizeFixture: Fixture | null = null;
/** Bodies with the real enpt sizes, so progress is checked against the real total (25866313). */
function realSizeFixture_(): Fixture {
  if (realSizeFixture) {
    return realSizeFixture;
  }
  const fixture = smallFixture();
  for (const part of ['model', 'lex', 'vocab'] as const) {
    const entry = fixture.registry.enpt![part]!;
    const bytes = new Uint8Array(REAL_ENPT_SIZES[part]).fill(part.length);
    fixture.bodies.set(BASE + entry.name, bytes);
    fixture.registry.enpt![part] = { ...entry, size: bytes.byteLength, expectedSha256Hash: sha256Hex(bytes) };
  }
  realSizeFixture = fixture;
  return fixture;
}

let fixture: Fixture;
let cacheStorage: FakeCacheStorage;
let fetchSpy: ReturnType<typeof vi.fn<typeof fetch>>;
let failNextFetches = 0;
let bergamotEngine: BergamotEngine;

function fetchedUrls(): string[] {
  return fetchSpy.mock.calls.map(([input]) => urlOf(input)).filter((url) => !url.endsWith('registry.json'));
}

function fakeBacking(): BackingLike {
  return fakes.backing as BackingLike;
}

const fakeBatchTranslator = {
  get instances() {
    return fakes.instances;
  },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

function useFakeTimers() {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
}

beforeEach(() => {
  fakes.instances = 0;
  fakes.deleted = 0;
  fakes.requests = [];
  fakes.backing = null;
  fakes.translateImpl = null;
  fakes.workerExports = {
    loadTranslationModel: () => Promise.resolve(),
    hasTranslationModel: () => Promise.resolve(false),
  };
  fixture = smallFixture();
  failNextFetches = 0;
  cacheStorage = new FakeCacheStorage();
  fetchSpy = vi.fn<typeof fetch>((input) => {
    const url = urlOf(input);
    if (url === `${BASE}registry.json`) {
      return Promise.resolve(new Response(JSON.stringify(fixture.registry), { status: 200 }));
    }
    if (failNextFetches > 0) {
      failNextFetches -= 1;
      return Promise.reject(new TypeError('network down'));
    }
    const body = fixture.bodies.get(url);
    return Promise.resolve(body ? chunkedResponse(body) : new Response('missing', { status: 404 }));
  });
  vi.stubGlobal('fetch', fetchSpy);
  vi.stubGlobal('caches', cacheStorage);
  vi.stubGlobal('location', { origin: ORIGIN });
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('Worker', class {});
  bergamotEngine = createBergamotEngine();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('bergamotEngine', () => {
  it('downloads nothing until asked', async () => {
    expect(await bergamotEngine.support('en', 'pt')).toBe('downloadable');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(fakes.instances).toBe(0);
  });

  it('downloads only the requested direction, automatically', async () => {
    expect(await bergamotEngine.translate('hello there', 'en', 'pt')).toBe('PT:hello there');
    expect(fetchedUrls()).toHaveLength(3);
    expect(fetchedUrls().every((u) => u.includes('/enpt/'))).toBe(true);
    expect(await bergamotEngine.support('en', 'pt')).toBe('available');
    expect(await bergamotEngine.support('pt', 'en')).toBe('downloadable');
  });

  it('sends plain-text requests with the given priority and the configured URLs', async () => {
    await bergamotEngine.translate('hello there', 'en', 'pt', { priority: 1 });
    await bergamotEngine.translate('hello again', 'en', 'pt');
    expect(fakes.requests).toEqual([
      { from: 'en', to: 'pt', text: 'hello there', html: false, priority: 1 },
      { from: 'en', to: 'pt', text: 'hello again', html: false, priority: 0 },
    ]);
    expect(fakeBacking().registryUrl).toBe(`${BASE}registry.json`);
    const options = (fakeBacking() as unknown as { options: Record<string, unknown> }).options;
    expect(options).toMatchObject({
      workerUrl: `${ORIGIN}/bergamot/translator-worker.js`,
      pivotLanguage: null,
      downloadTimeout: 0,
    });
    // options are posted to the worker, so they must stay structured-cloneable (no functions)
    expect(Object.values(options).some((value) => typeof value === 'function')).toBe(false);
  });

  it('shares one download between concurrent requests', async () => {
    await Promise.all([
      bergamotEngine.translate('good morning', 'en', 'pt'),
      bergamotEngine.translate('see you soon', 'en', 'pt'),
    ]);
    expect(fetchedUrls().filter((u) => u.includes('model.enpt'))).toHaveLength(1);
    expect(fakes.instances).toBe(1);
  });

  it('reports downloading while the pair is being fetched', async () => {
    const preparing = bergamotEngine.prepare('en', 'pt');
    expect(await bergamotEngine.support('en', 'pt')).toBe('downloading');
    await preparing;
    expect(await bergamotEngine.support('en', 'pt')).toBe('available');
  });

  it('allows a retry after a network failure', async () => {
    useFakeTimers();
    failNextFetches = 1;
    await expect(bergamotEngine.translate('hello there', 'en', 'pt')).rejects.toThrow('download-failed');
    expect(await bergamotEngine.support('en', 'pt')).toBe('downloadable');
    vi.advanceTimersByTime(BERGAMOT_DOWNLOAD_RETRY_COOLDOWN_MS);
    expect(await bergamotEngine.translate('hello there', 'en', 'pt')).toBe('PT:hello there');
    expect(await bergamotEngine.support('en', 'pt')).toBe('available');
  });

  it('waits out a per-pair cooldown after a failed download without fetching', async () => {
    useFakeTimers();
    const retry = vi.fn();
    bergamotEngine.onRetryAvailable(retry);
    failNextFetches = 3;
    await expect(bergamotEngine.prepare('en', 'pt')).rejects.toThrow('download-failed');
    fetchSpy.mockClear();
    await expect(bergamotEngine.prepare('en', 'pt')).rejects.toThrow('download-cooldown');
    await expect(bergamotEngine.translate('hello there', 'en', 'pt')).rejects.toThrow('download-cooldown');
    vi.advanceTimersByTime(BERGAMOT_DOWNLOAD_RETRY_COOLDOWN_MS - 1);
    await expect(bergamotEngine.prepare('en', 'pt')).rejects.toThrow('download-cooldown');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(retry).not.toHaveBeenCalled();
    // the cooldown is per pair: the other direction may still download
    await bergamotEngine.prepare('pt', 'en');
    expect(fetchedUrls().every((u) => u.includes('/pten/'))).toBe(true);
    vi.advanceTimersByTime(1);
    expect(retry).toHaveBeenCalledTimes(1);
    failNextFetches = 0;
    fetchSpy.mockClear();
    await bergamotEngine.prepare('en', 'pt');
    expect(fetchedUrls().filter((u) => u.includes('/enpt/'))).toHaveLength(3);
    expect(await bergamotEngine.support('en', 'pt')).toBe('available');
  });

  it('does not emit a completed progress event when a download fails', async () => {
    const events: TranslationProgressEvent[] = [];
    bergamotEngine.onProgress((event) => events.push(event));
    failNextFetches = 1;
    await expect(bergamotEngine.prepare('en', 'pt')).rejects.toThrow();
    expect(events.some((event) => event.loaded >= event.total)).toBe(false);
  });

  it('serves model files from the Cache API on the second load', async () => {
    await bergamotEngine.prepare('en', 'pt');
    fetchSpy.mockClear();
    // a new session: the models come from the Cache API, only the small registry is fetched
    const nextSession = createBergamotEngine();
    expect(await nextSession.support('en', 'pt')).toBe('available');
    expect(await nextSession.translate('hello there', 'en', 'pt')).toBe('PT:hello there');
    expect(fetchedUrls()).toHaveLength(0);
    expect(cacheStorage.putUrls.every((url) => url.startsWith(BASE) && url.endsWith('.gz'))).toBe(true);
  });

  it('reports byte progress against registry sizes', async () => {
    fixture = realSizeFixture_();
    const events: TranslationProgressEvent[] = [];
    bergamotEngine.onProgress((event) => events.push(event));
    await bergamotEngine.prepare('en', 'pt');
    expect(events.length).toBeGreaterThan(3);
    expect(events.every((event) => event.engine === 'bergamot' && event.pair === 'en-pt' && event.total === 25866313)).toBe(true);
    const loaded = events.map((event) => event.loaded);
    expect(loaded).toEqual([...loaded].sort((a, b) => a - b));
    expect(loaded[0]).toBeLessThan(25866313);
    expect(loaded.at(-1)).toBe(25866313);
  }, 30_000);

  it('marks the engine failed for the session when the worker errors', async () => {
    expect(await bergamotEngine.translate('hello there', 'en', 'pt')).toBe('PT:hello there');
    fakeBacking().triggerError(new Error('wasm OOM'));
    expect(await bergamotEngine.support('en', 'pt')).toBe('failed');
    await expect(bergamotEngine.translate('hello there', 'en', 'pt')).rejects.toThrow();
    expect(fakeBatchTranslator.instances).toBe(1);
    await expect(bergamotEngine.prepare('pt', 'en')).rejects.toThrow('model-load-failed');
  });

  it('rejects pending translations when the worker fails, without leaking text', async () => {
    const hung = deferred<FakeResponse>();
    fakes.translateImpl = () => hung.promise;
    const pending = bergamotEngine.translate('secret words', 'en', 'pt');
    await vi.waitFor(() => expect(fakes.requests).toHaveLength(1));
    fakeBacking().triggerError(new Error('worker crashed'));
    const error = await pending.then(
      () => null,
      (reason: unknown) => reason as Error,
    );
    expect(error?.message).toBe('model-load-failed');
    expect(error?.message).not.toContain('secret');
    expect(fakes.deleted).toBe(1);
  });

  it('marks the engine failed when the worker cannot load a model', async () => {
    await bergamotEngine.translate('hello there', 'en', 'pt');
    fakes.workerExports.loadTranslationModel = () => Promise.reject(new Error('bad model'));
    const { exports } = await fakeBacking().loadWorker();
    await expect(exports.loadTranslationModel!({ from: 'en', to: 'pt' }, {})).rejects.toThrow();
    await flush();
    expect(await bergamotEngine.support('en', 'pt')).toBe('failed');
  });

  it('a translate error that is not a worker failure stays retryable', async () => {
    fakes.translateImpl = () => Promise.reject(new Error('hello there could not be translated'));
    const error = await bergamotEngine.translate('hello there', 'en', 'pt').then(
      () => null,
      (reason: unknown) => reason as Error,
    );
    expect(error?.message).toBe('translate-failed');
    fakes.translateImpl = null;
    expect(await bergamotEngine.support('en', 'pt')).toBe('available');
    expect(await bergamotEngine.translate('hello there', 'en', 'pt')).toBe('PT:hello there');
  });

  it('feeds the worker from verified, gunzipped cache entries resolved against the registry', async () => {
    await bergamotEngine.translate('hello there', 'en', 'pt');
    fetchSpy.mockClear();
    const backing = fakeBacking();
    const models = await backing.registry;
    expect(models.map(({ from, to }) => `${from}-${to}`).sort()).toEqual(['en-pt', 'pt-en']);
    const vocab = fixture.registry.enpt!.vocab!;
    const buffer = await backing.fetch(vocab.name, vocab.expectedSha256Hash, undefined);
    expect(new TextDecoder().decode(buffer)).toBe(`contents of ${vocab.name}`);
    expect(fetchSpy).not.toHaveBeenCalled();
    await expect(backing.fetch(vocab.name, undefined, undefined)).rejects.toThrow('model-load-failed');
  });

  it('frees decompressed model buffers once the worker has loaded them', async () => {
    await bergamotEngine.translate('hello there', 'en', 'pt');
    const backing = fakeBacking();
    backing.buffers.set(JSON.stringify({ from: 'en', to: 'pt' }), Promise.resolve({}));
    const { exports } = await backing.loadWorker();
    await exports.loadTranslationModel!({ from: 'en', to: 'pt' }, {});
    await flush();
    expect(backing.buffers.size).toBe(0);
    expect(await bergamotEngine.support('en', 'pt')).toBe('available');
  });

  it('tears the worker down after idle and recreates it lazily', async () => {
    useFakeTimers();
    await bergamotEngine.translate('hello there', 'en', 'pt');
    vi.advanceTimersByTime(BERGAMOT_IDLE_TEARDOWN_MS - 1);
    expect(fakes.deleted).toBe(0);
    await bergamotEngine.translate('hello again', 'en', 'pt');
    vi.advanceTimersByTime(BERGAMOT_IDLE_TEARDOWN_MS - 1);
    expect(fakes.deleted).toBe(0);
    vi.advanceTimersByTime(1);
    await flush();
    expect(fakes.deleted).toBe(1);
    fetchSpy.mockClear();
    expect(await bergamotEngine.translate('hello there', 'en', 'pt')).toBe('PT:hello there');
    expect(fakes.instances).toBe(2);
    expect(fetchedUrls()).toHaveLength(0);
  });

  it('does not tear down while a translation is running', async () => {
    useFakeTimers();
    await bergamotEngine.translate('hello there', 'en', 'pt');
    const hung = deferred<FakeResponse>();
    fakes.translateImpl = () => hung.promise;
    const pending = bergamotEngine.translate('slow one', 'en', 'pt');
    await vi.waitFor(() => expect(fakes.requests).toHaveLength(2));
    vi.advanceTimersByTime(BERGAMOT_IDLE_TEARDOWN_MS * 2);
    expect(fakes.deleted).toBe(0);
    hung.resolve({ request: fakes.requests[1]!, target: { text: 'PT:slow one' } });
    expect(await pending).toBe('PT:slow one');
    vi.advanceTimersByTime(BERGAMOT_IDLE_TEARDOWN_MS);
    await flush();
    expect(fakes.deleted).toBe(1);
  });

  it('only handles the pt/en pairs', async () => {
    expect(await bergamotEngine.support('pt', 'pt')).toBe('unavailable');
    await expect(bergamotEngine.translate('ola', 'pt', 'pt')).rejects.toThrow('translate-failed');
  });

  it('is unavailable without the required runtime features', async () => {
    vi.stubGlobal('DecompressionStream', undefined);
    Reflect.deleteProperty(globalThis, 'DecompressionStream');
    expect(await bergamotEngine.support('en', 'pt')).toBe('unavailable');
    await expect(bergamotEngine.prepare('en', 'pt')).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
