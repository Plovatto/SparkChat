import type * as BergamotTranslator from '@mkljczk/bergamot-translator/translator.js';
import type { Language } from '@lib/i18n/language';
import { pairKey, type PairKey, type TranslationEngine, type TranslationProgressEvent, type TranslationSupport } from '../types';
import { isBergamotRuntimeSupported } from './bergamot-loader';
import {
  ensureModelFileCached,
  fetchModelFile,
  hasCachedPair,
  registryKeyOf,
  TRANSLATION_MODELS_CACHE,
  type BergamotRegistry,
} from './model-fetch';
import { modelRegistry } from './model-registry';

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
  registry: () => BergamotRegistry;
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
      // Bundled from the pinned manifest: never fetched at runtime.
      return Promise.resolve(
        Object.entries(hooks.registry()).map(([key, files]) => ({ from: key.slice(0, 2), to: key.slice(2, 4), files })),
      );
    }

    override fetch(url: string, checksum: string | undefined, extra: { signal?: AbortSignal } | undefined): Promise<ArrayBuffer> {
      // Only files of the bundled registry, matched by URL and pinned hash, are ever loaded.
      const resolved = new URL(url, this.registryUrl).href;
      const file = Object.values(hooks.registry())
        .flatMap((files) => Object.values(files))
        .find((entry) => entry.name === resolved && entry.expectedSha256Hash === checksum);
      if (!file) {
        return Promise.reject(new Error('model-load-failed'));
      }
      return fetchModelFile(file, () => undefined, extra?.signal);
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
  let registry: BergamotRegistry | null = null;
  let cacheUsable: Promise<boolean> | null = null;
  // Pairs whose files failed our own sha256 check: a broken deploy, not a network blip. No retry this session.
  const failedPairs = new Set<PairKey>();
  let translator: Promise<BatchTranslatorInstance> | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let activeCalls = 0;
  const readyPairs = new Set<PairKey>();
  const downloads = new Map<PairKey, Promise<void>>();
  const cooldowns = new Map<PairKey, ReturnType<typeof setTimeout>>();
  const pendingRejects = new Set<(error: Error) => void>();
  const progressListeners = new Set<(event: TranslationProgressEvent) => void>();
  const retryListeners = new Set<() => void>();

  function getRegistry(): BergamotRegistry {
    registry ??= modelRegistry(modelsBaseUrl());
    return registry;
  }

  /** Probed once: the Cache API can exist and still throw (e.g. Firefox private browsing). */
  function probeCache(): Promise<boolean> {
    cacheUsable ??= (async () => {
      try {
        await caches.open(TRANSLATION_MODELS_CACHE);
        return true;
      } catch {
        return false;
      }
    })();
    return cacheUsable;
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
    const cached = await hasCachedPair(pair, getRegistry());
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
    if (!(await probeCache())) {
      throw new Error('model-load-failed');
    }
    const controller = new AbortController();
    try {
      const files = Object.values(getRegistry()[registryKeyOf(pair)]);
      const cache = await caches.open(TRANSLATION_MODELS_CACHE);
      const cachedFlags = await Promise.all(files.map(async (file) => (await cache.match(file.name)) !== undefined));
      const missing = files.filter((_, index) => !cachedFlags[index]);
      if (missing.length === 0) {
        readyPairs.add(pair);
        return;
      }
      const total = files.reduce((sum, file) => sum + file.size, 0);
      // Files already in the cache count as loaded, so a partly filled cache still reaches the total.
      let loaded = files.reduce((sum, file, index) => (cachedFlags[index] ? sum + file.size : sum), 0);
      const onBytes = (n: number) => {
        loaded += n;
        // `loaded >= total` means "ready"; only the final event below may claim it.
        emitProgress(pair, Math.min(loaded, total - 1), total);
      };
      await Promise.all(missing.map((file) => ensureModelFileCached(file, onBytes, controller.signal)));
      readyPairs.add(pair);
      emitProgress(pair, total, total);
    } catch (error) {
      controller.abort();
      if (error instanceof Error && error.message === 'integrity-failed') {
        failedPairs.add(pair);
        throw new Error('model-load-failed');
      }
      startCooldown(pair);
      throw new Error('download-failed');
    }
  }

  function prepare(source: Language, target: Language): Promise<void> {
    const pair = supportedPair(source, target);
    if (!pair || !isBergamotRuntimeSupported() || failed || failedPairs.has(pair)) {
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
          // Only a base for resolving names: loadModelRegistry() is overridden, so this URL is never fetched.
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
    if (failed || failedPairs.has(pair)) {
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
    if (!(await probeCache())) {
      return 'unavailable';
    }
    if (failed || failedPairs.has(pair)) {
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
