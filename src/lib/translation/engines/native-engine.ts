import type { Language } from '@lib/i18n/language';
import { NATIVE_API_TIMEOUT_MS, TIMED_OUT, withNativeTimeout } from '../native-timeout';
import { invalidateEngineRoutes } from '../router';
import { pairKey, type PairKey, type TranslationEngine, type TranslationProgressEvent, type TranslationSupport } from '../types';

export { NATIVE_API_TIMEOUT_MS };

const INTERACTION_EVENTS = ['pointerdown', 'keydown'] as const;

const translators = new Map<PairKey, Promise<TranslatorInstance>>();
/**
 * Pairs whose availability check did not answer in time: treated as unavailable until that late answer arrives.
 * If it then says the pair is usable, the pair leaves this set and routes are recomputed (native wins again).
 */
const hungPairs = new Set<PairKey>();
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
  const created = translatorApi.create({
    sourceLanguage: source,
    targetLanguage: target,
    monitor: (monitor) => {
      monitor.addEventListener('downloadprogress', (event) => emitProgress(key, event.loaded));
    },
  });
  translators.set(key, created);
  created.catch(() => {
    if (translators.get(key) === created) {
      translators.delete(key);
    }
  });
  return created;
}

async function support(source: Language, target: Language): Promise<TranslationSupport> {
  const translatorApi = api();
  if (!translatorApi) {
    return 'unavailable';
  }
  const key = pairKey(source, target);
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

/** User rule: Bergamot only when the device cannot use the Translator API, so a slow answer is not final. */
function watchLateAvailability(key: PairKey, availability: Promise<TranslationSupport>): void {
  availability.then(
    (late) => {
      if (late !== 'unavailable' && hungPairs.delete(key)) {
        invalidateEngineRoutes();
        for (const listener of [...retryListeners]) {
          listener();
        }
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
    for (const pair of pairs) {
      const [source, target] = pair.split('-') as [Language, Language];
      void support(source, target).then((availability) => {
        if (availability === 'downloadable') {
          // create() can reject when the gesture's activation was already gone: wait for the next interaction.
          return nativeEngine.prepare(source, target).catch(() => {
            if (!disposed) {
              listen();
            }
          });
        }
      });
    }
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
  progressListeners.clear();
  retryListeners.clear();
}
