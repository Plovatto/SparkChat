import type { Language } from '@lib/i18n/language';
import { pairKey, type PairKey, type TranslationEngine, type TranslationProgressEvent, type TranslationSupport } from '../types';

const INTERACTION_EVENTS = ['pointerdown', 'keydown'] as const;

const translators = new Map<PairKey, Promise<TranslatorInstance>>();
const progressListeners = new Set<(event: TranslationProgressEvent) => void>();

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
  try {
    return await translatorApi.availability({ sourceLanguage: source, targetLanguage: target });
  } catch {
    return 'unavailable';
  }
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
};

export function armNativeOnFirstInteraction(pairs: PairKey[]): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }
  const dispose = () => {
    for (const type of INTERACTION_EVENTS) {
      window.removeEventListener(type, handler, true);
    }
  };
  const handler = () => {
    dispose();
    for (const pair of pairs) {
      const [source, target] = pair.split('-') as [Language, Language];
      void support(source, target).then((availability) => {
        if (availability === 'downloadable') {
          return nativeEngine.prepare(source, target).catch(() => undefined);
        }
      });
    }
  };
  for (const type of INTERACTION_EVENTS) {
    window.addEventListener(type, handler, { capture: true, once: true });
  }
  return dispose;
}

export function resetNativeEngineForTests(): void {
  translators.clear();
  progressListeners.clear();
}
