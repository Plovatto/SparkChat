import { appI18n } from '@lib/i18n/app-i18n';
import type { Language } from '@lib/i18n/language';
import { detectLanguage } from './detection';
import { nativeEngine } from './engines/native-engine';
import { invalidateEngineRoutes, resolveEngine, type EngineRoute } from './router';
import { hasTranslatableText, translatePreservingSegments } from './segments';
import {
  captureTranslationEpoch,
  isTranslationEpochCurrent,
  readTranslation,
  translationCacheKey,
  writeTranslation,
  type CachedTranslation,
  type TranslationEpoch,
} from './translation-cache';
import { pairKey, type TranslationEngine, type TranslationProgressEvent, type TranslationSupport } from './types';

export const MIN_DETECTION_CONFIDENCE = 0.7;
/** A job that takes longer than this (wedged worker, hung engine) resolves to an uncached none and frees the queue. */
export const TRANSLATION_JOB_TIMEOUT_MS = 20_000;
/**
 * How often a native pair that is downloadable or downloading is asked again while messages wait for it: a download
 * started elsewhere (another tab, the browser itself) sends no progress event here. Each check is bounded by
 * NATIVE_API_TIMEOUT_MS inside the native engine.
 */
export const NATIVE_AVAILABILITY_POLL_MS = 10_000;

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
type NativePoll = { timer: ReturnType<typeof setTimeout> | undefined };
const nativePolls = new Map<string, NativePoll>();

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
    (error: unknown) => {
      preparing.delete(key);
      // Waiting messages check again and see the new support (failed, or downloadable again under a cooldown).
      // During a cooldown prepare() rejects at once without downloading: notifying then would loop, so it does not;
      // onRetryAvailable says when the pair may be tried again.
      if (!(error instanceof Error && error.message === 'download-cooldown')) {
        notifyInvalidation();
      }
    },
  );
  preparing.set(key, download);
}

function isFinalSupport(support: TranslationSupport): boolean {
  return support === 'available' || support === 'unavailable' || support === 'failed';
}

/** Asks a not-yet-ready native pair again until it settles, and only while some message waits (listeners exist). */
function pollNativeAvailability(engine: TranslationEngine, source: Language, target: Language): void {
  const key = pairKey(source, target);
  if (nativePolls.has(key) || invalidationListeners.size === 0) {
    return;
  }
  const poll: NativePoll = { timer: undefined };
  const isCurrent = () => nativePolls.get(key) === poll;
  const stop = () => {
    if (isCurrent()) {
      nativePolls.delete(key);
    }
  };
  const schedule = () => {
    poll.timer = setTimeout(() => {
      poll.timer = undefined;
      if (!isCurrent()) {
        return;
      }
      if (invalidationListeners.size === 0) {
        stop();
        return;
      }
      void engine.support(source, target).then((support) => {
        if (!isCurrent()) {
          return;
        }
        if (isFinalSupport(support)) {
          stop();
          notifyInvalidation();
        } else {
          schedule();
        }
      }, stop);
    }, NATIVE_AVAILABILITY_POLL_MS);
  };
  nativePolls.set(key, poll);
  schedule();
}

function remember(cacheKey: string, value: CachedTranslation): IncomingResult {
  writeTranslation(cacheKey, value);
  return value;
}

/** Writes only while the job is still live and nothing was cleared since it was queued. */
function rememberFor(job: Job, value: CachedTranslation): IncomingResult {
  if (job.finished || !isTranslationEpochCurrent(job.epoch)) {
    return NONE;
  }
  return remember(job.cacheKey, value);
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
  const result = await runOnRoute(job, source, route);
  if (result !== FAILED) {
    return result;
  }
  // A failure can be the engine giving the pair up (a native download that stalled, Chrome refusing one more
  // translator): ask again, and if another engine took over, use it now. An uncached none would leave the message
  // untranslated, since it stops listening for invalidations.
  if (job.finished) {
    // Timed out meanwhile: the queue moved on and a result would be thrown away.
    return NONE;
  }
  invalidateEngineRoutes();
  const next = await resolveEngine(source, request.target);
  if (!next || next.engine === route.engine) {
    return NONE;
  }
  const retried = await runOnRoute(job, source, next);
  return retried === FAILED ? NONE : retried;
}

/** Marks a translate call that threw, so run() can retry on another engine. */
const FAILED = { status: 'none' } as const satisfies IncomingResult;

async function runOnRoute(job: Job, source: Language, route: EngineRoute): Promise<IncomingResult> {
  const { request } = job;
  const { engine, support } = route;
  if (support === 'downloadable' || support === 'downloading') {
    watchProgress(engine);
    // Native needs a user gesture to download; armNativeOnFirstInteraction triggers it elsewhere.
    if (engine.id === 'native') {
      pollNativeAvailability(engine, source, request.target);
    } else {
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
    return FAILED;
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
    return Promise.resolve(remember(cacheKey, NONE));
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

/** Synchronous memory read for the first render; an entry cached for another version of the text never matches. */
export function getCachedIncoming(roomId: string, messageId: string, field: Field, target: Language, text: string): IncomingResult | undefined {
  return readTranslation(translationCacheKey({ roomId, messageId, field, target, sourceText: text }));
}

/**
 * Called when a model download finishes, fails or may be retried, and when a native pair becomes usable again,
 * so visible `preparing` messages can retry.
 */
export function subscribeIncomingInvalidation(listener: () => void): () => void {
  // Native download progress and recovery (a late availability answer) are watched as soon as anyone listens.
  watchProgress(nativeEngine);
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
  for (const poll of nativePolls.values()) {
    clearTimeout(poll.timer);
  }
  nativePolls.clear();
}
