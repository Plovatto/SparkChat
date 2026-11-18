import type { Language } from '@lib/i18n/language';
import { NATIVE_STALLED_PAIRS_STORAGE_KEY } from '@constants/storage-keys';
import { NATIVE_API_TIMEOUT_MS, TIMED_OUT, withNativeTimeout } from '../native-timeout';
import { invalidateEngineRoutes } from '../router';
import { pairKey, type PairKey, type TranslationEngine, type TranslationProgressEvent, type TranslationSupport } from '../types';

export { NATIVE_API_TIMEOUT_MS };

export const NATIVE_DOWNLOAD_STALL_MS = 15_000;

export const NATIVE_STALL_MEMORY_MS = 24 * 60 * 60 * 1000;

export const NATIVE_STALL_RECHECK_MS = 30_000;

const translators = new Map<PairKey, Promise<TranslatorInstance>>();
const hungPairs = new Set<PairKey>();
const stalledPairs = new Set<PairKey>();
const stalledRechecks = new Set<PairKey>();
const lastStalledRecheck = new Map<PairKey, number>();
const gestureRetriedStalls = new Set<PairKey>();
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

type RememberedStalls = Record<string, number>;

function readRememberedStalls(): RememberedStalls {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(NATIVE_STALLED_PAIRS_STORAGE_KEY) ?? '{}');
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    const now = Date.now();
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, number] =>
          typeof entry[1] === 'number' && entry[1] > now && entry[1] <= now + NATIVE_STALL_MEMORY_MS,
      ),
    );
  } catch {
    return {};
  }
}

function writeRememberedStalls(stalls: RememberedStalls): void {
  try {
    if (Object.keys(stalls).length === 0) {
      localStorage.removeItem(NATIVE_STALLED_PAIRS_STORAGE_KEY);
    } else {
      localStorage.setItem(NATIVE_STALLED_PAIRS_STORAGE_KEY, JSON.stringify(stalls));
    }
  } catch {
    return;
  }
}

function rememberStall(key: PairKey): void {
  const stalls = readRememberedStalls();
  if (!(key in stalls)) {
    writeRememberedStalls({ ...stalls, [key]: Date.now() + NATIVE_STALL_MEMORY_MS });
  }
}

function clearStall(key: PairKey): boolean {
  const stalls = readRememberedStalls();
  if (key in stalls) {
    delete stalls[key];
    writeRememberedStalls(stalls);
  }
  return stalledPairs.delete(key);
}

async function interactionAvailability(source: Language, target: Language): Promise<TranslationSupport> {
  const translatorApi = api();
  const key = pairKey(source, target);
  if (!translatorApi || translators.has(key) || !isStalled(key)) {
    return support(source, target);
  }
  try {
    const result = await withNativeTimeout(translatorApi.availability({ sourceLanguage: source, targetLanguage: target }));
    return result === TIMED_OUT ? 'unavailable' : result;
  } catch {
    return 'unavailable';
  }
}

function isStalled(key: PairKey): boolean {
  if (!stalledPairs.has(key) && key in readRememberedStalls()) {
    stalledPairs.add(key);
  }
  return stalledPairs.has(key);
}

function markStalled(key: PairKey): void {
  rememberStall(key);
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
  created.catch(() => undefined);
  armStallTimer();
  translators.set(key, created);
  raw.then(
    (instance) => {
      settled = true;
      clearTimeout(stallTimer);
      if (clearStall(key)) {
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
  if (isStalled(key)) {
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
        if (result === 'available' && clearStall(key)) {
          notifyRetry();
        }
      },
      () => undefined,
    )
    .finally(() => stalledRechecks.delete(key));
}

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
  onRetryAvailable(listener) {
    retryListeners.add(listener);
    return () => {
      retryListeners.delete(listener);
    };
  },
};

export async function prepareNativeFromGesture(source: Language, target: Language): Promise<void> {
  const key = pairKey(source, target);
  if (!api()) {
    return;
  }
  if (!translators.has(key) && isStalled(key)) {
    if (gestureRetriedStalls.has(key)) {
      return;
    }
    gestureRetriedStalls.add(key);
  }
  const availability = await interactionAvailability(source, target);
  if (availability === 'downloadable' || availability === 'downloading') {
    await nativeEngine.prepare(source, target);
  }
}

export function resetNativeEngineForTests(): void {
  translators.clear();
  hungPairs.clear();
  stalledPairs.clear();
  stalledRechecks.clear();
  lastStalledRecheck.clear();
  gestureRetriedStalls.clear();
  progressListeners.clear();
  retryListeners.clear();
}
