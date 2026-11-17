import type * as BergamotTranslator from '@mkljczk/bergamot-translator/translator.js';
import type { Language } from '@lib/i18n/language';
import { pairKey, type PairKey, type TranslationEngine, type TranslationProgressEvent, type TranslationSupport } from '../types';
import { isBergamotRuntimeSupported } from './bergamot-loader';
import {
  ensureModelFileCached,
  fetchModelFile,
  hasCachedPair,
  loadRegistry,
  registryKeyOf,
  TRANSLATION_MODELS_CACHE,
  type BergamotRegistry,
} from './model-fetch';

export const BERGAMOT_IDLE_TEARDOWN_MS = 120_000;
/** Without this, every visible message would start a new 26 MB download after a network failure. */
export const BERGAMOT_DOWNLOAD_RETRY_COOLDOWN_MS = 60_000;

type BergamotModule = typeof BergamotTranslator;
type BatchTranslatorInstance = InstanceType<BergamotModule['BatchTranslator']>;
type WorkerCall = (...args: unknown[]) => Promise<unknown>;

export type BergamotEngine = TranslationEngine & { onRetryAvailable(listener: () => void): () => void };

function modelsBaseUrl(): string {
  // `||`, not `??`: an empty VITE_TRANSLATION_MODELS_URL= in .env means "not set".
  const configured = import.meta.env.VITE_TRANSLATION_MODELS_URL || `${import.meta.env.BASE_URL}translation-models/v1/`;
  const base = new URL(configured, location.origin).href;
  return base.endsWith('/') ? base : `${base}/`;
}

function workerUrl(): string {
  return new URL('bergamot/translator-worker.js', location.origin + import.meta.env.BASE_URL).href;
}

function supportedPair(source: Language, target: Language): PairKey | null {
  const key = pairKey(source, target);
  return key === 'en-pt' || key === 'pt-en' ? key : null;
}

type BackingHooks = {
  registry: () => Promise<BergamotRegistry>;
  onWorkerModelLoadFailed: () => void;
};

/**
 * The package's backing fetches without gunzip and without our cache. This subclass reads the verified,
 * cached `.gz` files and decompresses them. It keeps no class fields: the base constructor calls
 * `loadModelRegistry()` before subclass fields would exist.
 */
function createBacking(module: BergamotModule, hooks: BackingHooks, options: Record<string, unknown>) {
  class SparkBacking extends module.TranslatorBacking {
    override loadModelRegistry() {
      return hooks.registry().then((registry) =>
        Object.entries(registry).map(([key, files]) => ({ from: key.slice(0, 2), to: key.slice(2, 4), files })),
      );
    }

    override fetch(url: string, checksum: string | undefined, extra: { signal?: AbortSignal } | undefined): Promise<ArrayBuffer> {
      if (!checksum) {
        return Promise.reject(new Error('model-load-failed'));
      }
      return fetchModelFile(new URL(url, this.registryUrl).href, checksum, () => undefined, extra?.signal);
    }

    override async loadWorker() {
      const loaded = await super.loadWorker();
      const remote = loaded.exports as Record<string | symbol, WorkerCall>;
      const buffers = this.buffers;
      const exports = new Proxy(
        {},
        {
          get(_target, name) {
            // Not then-able, like the package's own proxy.
            if (name === 'then') {
              return undefined;
            }
            return (...args: unknown[]) => {
              const call = remote[name]!(...args);
              if (name === 'loadTranslationModel') {
                const { from, to } = args[0] as { from: string; to: string };
                call.then(
                  // The worker has its own copy now; drop the decompressed buffers held on the main thread.
                  () => buffers.delete(JSON.stringify({ from, to })),
                  () => hooks.onWorkerModelLoadFailed(),
                );
              }
              return call;
            };
          },
        },
      );
      return { worker: loaded.worker, exports };
    }
  }
  return new SparkBacking(options);
}

export function createBergamotEngine(): BergamotEngine {
  let failed = false;
  let registry: Promise<BergamotRegistry> | null = null;
  let translator: Promise<BatchTranslatorInstance> | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let activeCalls = 0;
  const readyPairs = new Set<PairKey>();
  const downloads = new Map<PairKey, Promise<void>>();
  const cooldowns = new Map<PairKey, ReturnType<typeof setTimeout>>();
  const pendingRejects = new Set<(error: Error) => void>();
  const progressListeners = new Set<(event: TranslationProgressEvent) => void>();
  const retryListeners = new Set<() => void>();

  function getRegistry(): Promise<BergamotRegistry> {
    if (!registry) {
      const loading = loadRegistry(modelsBaseUrl());
      registry = loading;
      loading.catch(() => {
        if (registry === loading) {
          registry = null;
        }
      });
    }
    return registry;
  }

  function emitProgress(pair: PairKey, loaded: number, total: number): void {
    for (const listener of [...progressListeners]) {
      listener({ engine: 'bergamot', pair, loaded, total });
    }
  }

  function clearIdleTimer(): void {
    if (idleTimer !== null) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  }

  function teardown(): void {
    clearIdleTimer();
    const current = translator;
    translator = null;
    void current?.then((instance) => instance.delete()).catch(() => undefined);
  }

  function scheduleIdleTeardown(): void {
    clearIdleTimer();
    if (activeCalls > 0 || !translator) {
      return;
    }
    idleTimer = setTimeout(() => {
      idleTimer = null;
      if (activeCalls === 0) {
        teardown();
      }
    }, BERGAMOT_IDLE_TEARDOWN_MS);
  }

  /** Worker or WASM failure: unusable for the rest of the session, no retry until reload. */
  function fail(): void {
    if (failed) {
      return;
    }
    failed = true;
    for (const reject of [...pendingRejects]) {
      reject(new Error('model-load-failed'));
    }
    pendingRejects.clear();
    teardown();
  }

  async function isPairCached(pair: PairKey): Promise<boolean> {
    if (readyPairs.has(pair)) {
      return true;
    }
    // An empty cache answers without touching the network, so nothing is fetched until a download is asked for.
    const cache = await caches.open(TRANSLATION_MODELS_CACHE);
    if ((await cache.keys()).length === 0) {
      return false;
    }
    const cached = await hasCachedPair(pair, await getRegistry());
    if (cached) {
      readyPairs.add(pair);
    }
    return cached;
  }

  function startCooldown(pair: PairKey): void {
    const timer = setTimeout(() => {
      cooldowns.delete(pair);
      for (const listener of [...retryListeners]) {
        listener();
      }
    }, BERGAMOT_DOWNLOAD_RETRY_COOLDOWN_MS);
    cooldowns.set(pair, timer);
  }

  async function downloadPair(pair: PairKey): Promise<void> {
    const controller = new AbortController();
    try {
      if (await isPairCached(pair)) {
        return;
      }
      const files = Object.values((await getRegistry())[registryKeyOf(pair)]);
      const total = files.reduce((sum, file) => sum + file.size, 0);
      let loaded = 0;
      const onBytes = (n: number) => {
        loaded += n;
        // `loaded >= total` means "ready"; only the final event below may claim it.
        emitProgress(pair, Math.min(loaded, total - 1), total);
      };
      await Promise.all(files.map((file) => ensureModelFileCached(file.name, file.expectedSha256Hash, onBytes, controller.signal)));
      readyPairs.add(pair);
      emitProgress(pair, total, total);
    } catch {
      controller.abort();
      startCooldown(pair);
      throw new Error('download-failed');
    }
  }

  function prepare(source: Language, target: Language): Promise<void> {
    const pair = supportedPair(source, target);
    if (!pair || !isBergamotRuntimeSupported() || failed) {
      return Promise.reject(new Error('model-load-failed'));
    }
    const inFlight = downloads.get(pair);
    if (inFlight) {
      return inFlight;
    }
    if (cooldowns.has(pair)) {
      return Promise.reject(new Error('download-cooldown'));
    }
    const download = downloadPair(pair).finally(() => {
      downloads.delete(pair);
    });
    downloads.set(pair, download);
    return download;
  }

  function getTranslator(): Promise<BatchTranslatorInstance> {
    if (!translator) {
      const creating = import('@mkljczk/bergamot-translator/translator.js').then((module) => {
        // Posted to the worker on initialize: must stay structured-cloneable (no callbacks here).
        const backingOptions = {
          registryUrl: new URL('registry.json', modelsBaseUrl()).href,
          workerUrl: workerUrl(),
          // null disables pivoting through a third language (verified in the Task 0 spike).
          pivotLanguage: null as unknown as string,
          downloadTimeout: 0,
        };
        const backing = createBacking(module, { registry: getRegistry, onWorkerModelLoadFailed: fail }, backingOptions);
        backing.onerror = fail;
        return new module.BatchTranslator({ ...backingOptions, workers: 1, batchSize: 4, onerror: fail }, backing);
      });
      translator = creating;
      creating.catch(() => {
        if (translator === creating) {
          translator = null;
        }
        fail();
      });
    }
    return translator;
  }

  /** Lets a worker failure reject requests the package itself would leave hanging. */
  function trackPending<T>(work: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      pendingRejects.add(reject);
      void work.then(resolve, reject).finally(() => pendingRejects.delete(reject));
    });
  }

  async function translate(
    text: string,
    source: Language,
    target: Language,
    options?: { priority?: number },
  ): Promise<string> {
    const pair = supportedPair(source, target);
    if (!pair) {
      throw new Error('translate-failed');
    }
    if (failed) {
      throw new Error('model-load-failed');
    }
    if (!readyPairs.has(pair)) {
      await prepare(source, target);
    }
    activeCalls += 1;
    clearIdleTimer();
    try {
      const instance = await getTranslator();
      if (failed) {
        throw new Error('model-load-failed');
      }
      const response = await trackPending(
        instance.translate({ from: source, to: target, text, html: false, priority: options?.priority ?? 0 }),
      );
      return response.target.text;
    } catch {
      if (failed) {
        throw new Error('model-load-failed');
      }
      // Maybe the cache was evicted: let the next call check it again.
      readyPairs.delete(pair);
      throw new Error('translate-failed');
    } finally {
      activeCalls -= 1;
      scheduleIdleTeardown();
    }
  }

  async function support(source: Language, target: Language): Promise<TranslationSupport> {
    const pair = supportedPair(source, target);
    if (!pair || !isBergamotRuntimeSupported()) {
      return 'unavailable';
    }
    if (failed) {
      return 'failed';
    }
    if (downloads.has(pair)) {
      return 'downloading';
    }
    try {
      return (await isPairCached(pair)) ? 'available' : 'downloadable';
    } catch {
      return 'downloadable';
    }
  }

  return {
    id: 'bergamot',
    support,
    prepare,
    translate,
    onProgress(listener) {
      progressListeners.add(listener);
      return () => {
        progressListeners.delete(listener);
      };
    },
    onRetryAvailable(listener) {
      retryListeners.add(listener);
      return () => {
        retryListeners.delete(listener);
      };
    },
  };
}

export const bergamotEngine: BergamotEngine = createBergamotEngine();
