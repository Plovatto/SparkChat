import { BoundedMap } from '@lib/cache/bounded-map';
import { appI18n } from '@lib/i18n/app-i18n';
import type { Language } from '@lib/i18n/language';
import { detectLanguage } from './detection';
import { invalidateEngineRoutes, resolveEngine } from './router';
import { hasTranslatableText, translatePreservingSegments } from './segments';
import {
  captureTranslationEpoch,
  isTranslationEpochCurrent,
  readTranslation,
  TRANSLATION_CACHE_SIZE,
  translationCacheKey,
  writeTranslation,
  type CachedTranslation,
  type TranslationEpoch,
} from './translation-cache';
import { pairKey, type TranslationEngine, type TranslationProgressEvent } from './types';

export const MIN_DETECTION_CONFIDENCE = 0.7;
/** A job that takes longer than this (wedged worker, hung engine) resolves to an uncached none and frees the queue. */
export const TRANSLATION_JOB_TIMEOUT_MS = 20_000;

const PLACEHOLDER_KEY = 'chat.message.encryptedUnavailable';

type Field = 'content' | 'caption';

export type IncomingResult =
  | { status: 'translated'; text: string; sourceLanguage: Language }
  | { status: 'preparing'; sourceLanguage: Language }
  | { status: 'none' };

/** Aborting `signal` before the request starts drops it: the promise resolves to an uncached `{ status: 'none' }`. */
export type IncomingRequest = {
  roomId: string;
  messageId: string;
  field: Field;
  text: string;
  target: Language;
  signal: AbortSignal;
};

type Job = {
  request: IncomingRequest;
  cacheKey: string;
  epoch: TranslationEpoch;
  resolve: (result: IncomingResult) => void;
  onAbort: () => void;
  // Set once the job timed out or settled; a late result must not be written then.
  finished: boolean;
};

const NONE = { status: 'none' } as const satisfies IncomingResult;

const pending: Job[] = [];
let running = false;
const invalidationListeners = new Set<() => void>();
const progressSubscriptions = new Map<TranslationEngine, () => void>();
const preparing = new Map<string, Promise<void>>();
// Latest cache key per (room, message, field, target) so the first render can read synchronously without the text.
// Holds ids and a text hash only; the cache itself decides whether the entry still exists.
const latestKeys = new BoundedMap<string, string>(TRANSLATION_CACHE_SIZE);

function latestKeyOf(roomId: string, messageId: string, field: Field, target: Language): string {
  return [roomId, messageId, field, target].join('\u0000');
}

function isPlaceholder(text: string): boolean {
  return text === appI18n.t(PLACEHOLDER_KEY, { lng: 'pt' }) || text === appI18n.t(PLACEHOLDER_KEY, { lng: 'en' });
}

function notifyInvalidation(): void {
  invalidateEngineRoutes();
  for (const listener of [...invalidationListeners]) {
    listener();
  }
}

function watchProgress(engine: TranslationEngine): void {
  if (progressSubscriptions.has(engine)) {
    return;
  }
  const unsubscribeProgress = engine.onProgress((event: TranslationProgressEvent) => {
    if (event.loaded >= event.total) {
      notifyInvalidation();
    }
  });
  // A failed download is not retried in a loop; the engine says when the pair may be tried again.
  const unsubscribeRetry = engine.onRetryAvailable?.(notifyInvalidation);
  progressSubscriptions.set(engine, () => {
    unsubscribeProgress();
    unsubscribeRetry?.();
  });
}

function prepareOnce(engine: TranslationEngine, source: Language, target: Language): void {
  const key = `${engine.id}:${pairKey(source, target)}`;
  if (preparing.has(key)) {
    return;
  }
  const download = engine.prepare(source, target).then(
    () => {
      preparing.delete(key);
      notifyInvalidation();
    },
    () => {
      // A failed download is not retried in a loop; the next request after onRetryAvailable tries again.
      preparing.delete(key);
    },
  );
  preparing.set(key, download);
}

function remember(cacheKey: string, request: IncomingRequest, value: CachedTranslation): IncomingResult {
  writeTranslation(cacheKey, value);
  latestKeys.set(latestKeyOf(request.roomId, request.messageId, request.field, request.target), cacheKey);
  return value;
}

/** Writes only while the job is still live and nothing was cleared since it was queued. */
function rememberFor(job: Job, value: CachedTranslation): IncomingResult {
  if (job.finished || !isTranslationEpochCurrent(job.epoch)) {
    return NONE;
  }
  return remember(job.cacheKey, job.request, value);
}

async function run(job: Job): Promise<IncomingResult> {
  const { request } = job;
  const detected = await detectLanguage(request.text);
  if (!detected || detected.confidence < MIN_DETECTION_CONFIDENCE || detected.language === request.target) {
    return rememberFor(job, NONE);
  }
  const source = detected.language;
  const route = await resolveEngine(source, request.target);
  if (!route) {
    return NONE;
  }
  const { engine, support } = route;
  if (support === 'downloadable' || support === 'downloading') {
    watchProgress(engine);
    // Native needs a user gesture to download; armNativeOnFirstInteraction triggers it elsewhere.
    if (engine.id !== 'native') {
      prepareOnce(engine, source, request.target);
    }
    return { status: 'preparing', sourceLanguage: source };
  }
  if (support !== 'available') {
    return NONE;
  }
  try {
    const text = await translatePreservingSegments(request.text, (chunk) =>
      engine.translate(chunk, source, request.target, { priority: 1 }),
    );
    return rememberFor(job, { status: 'translated', text, sourceLanguage: source });
  } catch {
    return NONE;
  }
}

function runWithTimeout(job: Job): Promise<IncomingResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<IncomingResult>((resolve) => {
    timer = setTimeout(() => resolve(NONE), TRANSLATION_JOB_TIMEOUT_MS);
  });
  return Promise.race([run(job).catch(() => NONE), timeout]).finally(() => {
    job.finished = true;
    clearTimeout(timer);
  });
}

async function pump(): Promise<void> {
  if (running) {
    return;
  }
  running = true;
  try {
    // LIFO: the message most recently scrolled into view is the one the person is looking at.
    for (let job = pending.pop(); job; job = pending.pop()) {
      job.request.signal.removeEventListener('abort', job.onAbort);
      // Aborted (left the screen) or cleared (deleted, room removed, logout) while waiting: drop without translating.
      if (job.request.signal.aborted || !isTranslationEpochCurrent(job.epoch)) {
        job.resolve(NONE);
        continue;
      }
      const result = await runWithTimeout(job);
      // A clear during the job hides whatever it produced, cached or not.
      job.resolve(isTranslationEpochCurrent(job.epoch) ? result : NONE);
    }
  } finally {
    running = false;
  }
}

/** Cache hits and the undecryptable placeholder answer at once; everything else waits in a sequential LIFO queue. */
export function translateIncoming(request: IncomingRequest): Promise<IncomingResult> {
  if (isPlaceholder(request.text)) {
    return Promise.resolve(NONE);
  }
  const cacheKey = translationCacheKey({ ...request, sourceText: request.text });
  const cached = readTranslation(cacheKey);
  if (cached) {
    return Promise.resolve(cached);
  }
  if (!hasTranslatableText(request.text)) {
    return Promise.resolve(remember(cacheKey, request, NONE));
  }
  if (request.signal.aborted) {
    return Promise.resolve(NONE);
  }
  return new Promise<IncomingResult>((resolve) => {
    const job: Job = {
      request,
      cacheKey,
      epoch: captureTranslationEpoch(request.roomId, request.messageId),
      resolve,
      finished: false,
      onAbort: () => {
        const index = pending.indexOf(job);
        if (index !== -1) {
          pending.splice(index, 1);
          resolve(NONE);
        }
      },
    };
    request.signal.addEventListener('abort', job.onAbort, { once: true });
    pending.push(job);
    void pump();
  });
}

/** Synchronous memory read for the first render. Pass `text` to ignore an entry cached for an older version of the message. */
export function getCachedIncoming(
  roomId: string,
  messageId: string,
  field: Field,
  target: Language,
  text?: string,
): IncomingResult | undefined {
  const cacheKey =
    text === undefined
      ? latestKeys.get(latestKeyOf(roomId, messageId, field, target))
      : translationCacheKey({ roomId, messageId, field, target, sourceText: text });
  return cacheKey === undefined ? undefined : readTranslation(cacheKey);
}

/** Called when a model download finishes, so visible `preparing` messages can retry. */
export function subscribeIncomingInvalidation(listener: () => void): () => void {
  invalidationListeners.add(listener);
  return () => {
    invalidationListeners.delete(listener);
  };
}

export function resetIncomingForTests(): void {
  pending.length = 0;
  running = false;
  invalidationListeners.clear();
  for (const unsubscribe of progressSubscriptions.values()) {
    unsubscribe();
  }
  progressSubscriptions.clear();
  preparing.clear();
  latestKeys.clear();
}
