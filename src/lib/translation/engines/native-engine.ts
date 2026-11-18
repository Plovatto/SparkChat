import type { Language } from '@lib/i18n/language';
import { NATIVE_API_TIMEOUT_MS, TIMED_OUT, withNativeTimeout } from '../native-timeout';
import { invalidateEngineRoutes } from '../router';
import { pairKey, type PairKey, type TranslationEngine, type TranslationProgressEvent, type TranslationSupport } from '../types';

export { NATIVE_API_TIMEOUT_MS };

/**
 * A model download that shows no progress for this long (create() pending, no downloadprogress event) is treated as
 * stalled: blocked by policy or network, or a language pack stuck in Chrome. Measured on Chrome 157, fresh profile:
 * first progress 8-9 s after create(), gaps under 2.1 s, then 4-8 s of silent install after 100 %. A busy machine
 * stretches those, so the window is generous: a false stall costs a needless fallback download.
 */
export const NATIVE_DOWNLOAD_STALL_MS = 30_000;

/**
 * A stalled pair asks Chrome again at most this often. Chrome can answer 'available' and still refuse create()
 * (e.g. "translation service count exceeded"): without a bound, un-stalling and stalling again would loop.
 */
export const NATIVE_STALL_RECHECK_MS = 30_000;

const INTERACTION_EVENTS = ['pointerdown', 'keydown'] as const;

const translators = new Map<PairKey, Promise<TranslatorInstance>>();
/**
 * Pairs whose availability check did not answer in time: treated as unavailable until that late answer arrives.
 * If it then says the pair is usable, the pair leaves this set and routes are recomputed (native wins again).
 */
const hungPairs = new Set<PairKey>();
/**
 * Pairs whose download stalled or whose create() failed for a reason other than the missing gesture: treated as
 * unavailable (the fallback takes over) until that create() succeeds after all.
 */
const stalledPairs = new Set<PairKey>();
const stalledRechecks = new Set<PairKey>();
const lastStalledRecheck = new Map<PairKey, number>();
const progressListeners = new Set<(event: TranslationProgressEvent) => void>();
const retryListeners = new Set<() => void>();

function api(): TranslatorStatic | undefined {
  return typeof Translator === 'undefined' ? undefined : Translator;
}

function emitProgress(pair: PairKey, loaded: number): void {
  for (const listener of progressListeners) {
    listener({ engine: 'native', pair, loaded, total: 1 });
  }
}

function notifyRetry(): void {
  invalidateEngineRoutes();
  for (const listener of [...retryListeners]) {
    listener();
  }
}

function markStalled(key: PairKey): void {
  if (!stalledPairs.has(key)) {
    stalledPairs.add(key);
    notifyRetry();
  }
}

function isMissingGesture(error: unknown): boolean {
  return error instanceof Error && error.name === 'NotAllowedError';
}

function getTranslator(source: Language, target: Language): Promise<TranslatorInstance> {
  const key = pairKey(source, target);
  const existing = translators.get(key);
  if (existing) {
    return existing;
  }
  const translatorApi = api();
  if (!translatorApi) {
    return Promise.reject(new Error('translate-failed'));
  }
  let stallTimer: ReturnType<typeof setTimeout> | undefined;
  let settled = false;
  let giveUp: (error: Error) => void = () => undefined;
  const armStallTimer = () => {
    clearTimeout(stallTimer);
    if (!settled) {
      stallTimer = setTimeout(() => {
        // Whoever waits on this download (a draft translation, prepare) fails now instead of hanging forever.
        if (translators.get(key) === created) {
          translators.delete(key);
        }
        giveUp(new Error('download-stalled'));
        markStalled(key);
      }, NATIVE_DOWNLOAD_STALL_MS);
    }
  };
  const raw = translatorApi.create({
    sourceLanguage: source,
    targetLanguage: target,
    monitor: (monitor) => {
      monitor.addEventListener('downloadprogress', (event) => {
        armStallTimer();
        emitProgress(key, event.loaded);
      });
    },
  });
  const created = new Promise<TranslatorInstance>((resolve, reject) => {
    giveUp = reject;
    raw.then(resolve, reject);
  });
  // Callers handle their own rejection; this only keeps a give-up nobody awaits from being reported as unhandled.
  created.catch(() => undefined);
  armStallTimer();
  translators.set(key, created);
  raw.then(
    (instance) => {
      settled = true;
      clearTimeout(stallTimer);
      // A download that was given up on finished after all: native wins again.
      if (stalledPairs.delete(key)) {
        if (!translators.has(key)) {
          translators.set(key, Promise.resolve(instance));
        }
        notifyRetry();
      }
    },
    (error: unknown) => {
      settled = true;
      clearTimeout(stallTimer);
      if (translators.get(key) === created) {
        translators.delete(key);
      }
      // Without a gesture the next interaction retries; any other failure will not fix itself on a click.
      if (!isMissingGesture(error)) {
        markStalled(key);
      }
    },
  );
  return created;
}

async function support(source: Language, target: Language): Promise<TranslationSupport> {
  const translatorApi = api();
  if (!translatorApi) {
    return 'unavailable';
  }
  const key = pairKey(source, target);
  if (stalledPairs.has(key)) {
    recheckStalled(translatorApi, key, source, target);
    return 'unavailable';
  }
  if (hungPairs.has(key)) {
    return 'unavailable';
  }
  try {
    const availability = translatorApi.availability({ sourceLanguage: source, targetLanguage: target });
    const result = await withNativeTimeout(availability);
    if (result === TIMED_OUT) {
      hungPairs.add(key);
      watchLateAvailability(key, availability);
      return 'unavailable';
    }
    return result;
  } catch {
    return 'unavailable';
  }
}

/**
 * A stalled pair asks Chrome again in the background each time it is consulted: if the model became available another
 * way (another tab, Chrome finishing on its own while this page's create() stays wedged), native wins again. Only
 * 'available' counts: 'downloading' may be the same stuck download.
 */
function recheckStalled(translatorApi: TranslatorStatic, key: PairKey, source: Language, target: Language): void {
  const last = lastStalledRecheck.get(key);
  if (stalledRechecks.has(key) || (last !== undefined && Date.now() - last < NATIVE_STALL_RECHECK_MS)) {
    return;
  }
  stalledRechecks.add(key);
  lastStalledRecheck.set(key, Date.now());
  void withNativeTimeout(translatorApi.availability({ sourceLanguage: source, targetLanguage: target }))
    .then(
      (result) => {
        if (result === 'available' && stalledPairs.delete(key)) {
          notifyRetry();
        }
      },
      () => undefined,
    )
    .finally(() => stalledRechecks.delete(key));
}

/** User rule: Bergamot only when the device cannot use the Translator API, so a slow answer is not final. */
function watchLateAvailability(key: PairKey, availability: Promise<TranslationSupport>): void {
  availability.then(
    (late) => {
      if (late !== 'unavailable' && hungPairs.delete(key)) {
        notifyRetry();
      }
    },
    () => undefined,
  );
}

export const nativeEngine: TranslationEngine = {
  id: 'native',
  support,
  async prepare(source, target) {
    try {
      await getTranslator(source, target);
    } catch {
      throw new Error('model-load-failed');
    }
  },
  async translate(text, source, target) {
    try {
      const translator = await getTranslator(source, target);
      return await translator.translate(text);
    } catch {
      throw new Error('translate-failed');
    }
  },
  onProgress(listener) {
    progressListeners.add(listener);
    return () => {
      progressListeners.delete(listener);
    };
  },
  /** Fires when a pair whose availability check timed out turns out to be usable after all. */
  onRetryAvailable(listener) {
    retryListeners.add(listener);
    return () => {
      retryListeners.delete(listener);
    };
  },
};

export function armNativeOnFirstInteraction(pairs: PairKey[]): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }
  let disposed = false;
  const unlisten = () => {
    for (const type of INTERACTION_EVENTS) {
      window.removeEventListener(type, handler, true);
    }
  };
  const listen = () => {
    for (const type of INTERACTION_EVENTS) {
      window.addEventListener(type, handler, { capture: true, once: true });
    }
  };
  const handler = () => {
    unlisten();
    // In order, one after the other: the gesture unlocks a single create(), and it goes to the first pair that needs it.
    void (async () => {
      for (const pair of pairs) {
        const [source, target] = pair.split('-') as [Language, Language];
        const availability = await support(source, target);
        // 'downloading' too: a download started by an earlier page may be stuck, and create() attaches our monitor.
        if (availability === 'downloadable' || availability === 'downloading') {
          // create() can reject when the gesture's activation was already gone: wait for the next interaction.
          void nativeEngine.prepare(source, target).catch(() => {
            if (!disposed) {
              listen();
            }
          });
        }
      }
    })();
  };
  listen();
  return () => {
    disposed = true;
    unlisten();
  };
}

export function resetNativeEngineForTests(): void {
  translators.clear();
  hungPairs.clear();
  stalledPairs.clear();
  stalledRechecks.clear();
  lastStalledRecheck.clear();
  progressListeners.clear();
  retryListeners.clear();
}
