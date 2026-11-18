import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { appI18n, translate } from '@lib/i18n/app-i18n';
import type { Language } from '@lib/i18n/language';
import type { DetectedLanguage } from './heuristic-detector';
import type { TranslationEngine, TranslationProgressEvent, TranslationSupport } from './types';

type FakeEngine = {
  id: TranslationEngine['id'];
  support: Mock<TranslationEngine['support']>;
  prepare: Mock<TranslationEngine['prepare']>;
  translate: Mock<TranslationEngine['translate']>;
  onProgress: TranslationEngine['onProgress'];
  emitProgress: (event: TranslationProgressEvent) => void;
};
type DetectMock = Mock<(text: string, options?: { allowDownload?: boolean }) => Promise<DetectedLanguage | null>>;
type GestureMock = Mock<(source: Language, target: Language) => Promise<void>>;

function fakeEngine(id: 'native' | 'bergamot'): FakeEngine {
  const listeners = new Set<(event: TranslationProgressEvent) => void>();
  return {
    id,
    support: vi.fn<TranslationEngine['support']>(() => Promise.resolve<TranslationSupport>('available')),
    prepare: vi.fn<TranslationEngine['prepare']>(() => Promise.resolve()),
    translate: vi.fn<TranslationEngine['translate']>((text, _source, target) => Promise.resolve(`${target.toUpperCase()}:${text}`)),
    onProgress: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emitProgress: (event) => {
      for (const listener of listeners) listener(event);
    },
  };
}

const mocks = vi.hoisted(() => ({ native: null as unknown as FakeEngine, detect: null as unknown as DetectMock, gesture: null as unknown as GestureMock }));

vi.mock('./engines/native-engine', () => ({
  get nativeEngine() {
    return mocks.native;
  },
  prepareNativeFromGesture: (source: Language, target: Language) => mocks.gesture(source, target),
}));

vi.mock('./detection', () => ({
  detectLanguage: (text: string, options?: { allowDownload?: boolean }) => mocks.detect(text, options),
}));

import {
  assessIncoming,
  getCachedIncoming,
  NATIVE_AVAILABILITY_POLL_MS,
  prepareTranslationOnGesture,
  resetIncomingForTests,
  subscribeIncomingInvalidation,
  translateIncoming,
  TRANSLATION_JOB_TIMEOUT_MS,
  type IncomingRequest,
} from './incoming';
import { registerFallbackEngine, resetRouterForTests } from './router';
import { clearTranslationCache, clearTranslationsForRoom, forgetTranslation } from './translation-cache';

let native: FakeEngine;
let bergamot: FakeEngine;
let detect: DetectMock;
let gesture: GestureMock;
const bergamotLoader = { load: vi.fn<() => Promise<TranslationEngine>>() };

function req(messageId: string, text: string, target: Language): IncomingRequest {
  return { roomId: 'r1', messageId, field: 'content', text, target, signal: new AbortController().signal };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  clearTranslationCache();
  resetRouterForTests();
  resetIncomingForTests();
  native = fakeEngine('native');
  bergamot = fakeEngine('bergamot');
  mocks.native = native;
  detect = vi.fn<(text: string) => Promise<DetectedLanguage | null>>(() => Promise.resolve({ language: 'en', confidence: 0.9 }));
  mocks.detect = detect;
  gesture = vi.fn<(source: Language, target: Language) => Promise<void>>(() => Promise.resolve());
  mocks.gesture = gesture;
  bergamotLoader.load.mockReset();
  bergamotLoader.load.mockResolvedValue(bergamot);
  registerFallbackEngine(() => bergamotLoader.load());
  (globalThis as Record<string, unknown>).Translator = {};
});

afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as Record<string, unknown>).Translator;
});

describe('translateIncoming', () => {
  it('translates english to portuguese when confident and caches in memory', async () => {
    detect.mockResolvedValue({ language: 'en', confidence: 0.92 });
    expect(await translateIncoming(req('m1', 'good morning team', 'pt'))).toEqual({
      status: 'translated',
      text: 'PT:good morning team',
      sourceLanguage: 'en',
    });
    await translateIncoming(req('m1', 'good morning team', 'pt'));
    expect(native.translate).toHaveBeenCalledTimes(1);
    expect(native.translate).toHaveBeenCalledWith('good morning team', 'en', 'pt', { priority: 1 });
    expect(getCachedIncoming('r1', 'm1', 'content', 'pt', 'good morning team')).toEqual({
      status: 'translated',
      text: 'PT:good morning team',
      sourceLanguage: 'en',
    });
  });

  it('keeps mentions and links out of the engine', async () => {
    expect(await translateIncoming(req('m1', 'hello @ana see https://x.dev/a now', 'pt'))).toEqual({
      status: 'translated',
      text: 'PT:hello @ana PT:see https://x.dev/a PT:now',
      sourceLanguage: 'en',
    });
  });

  it('never translates the undecryptable placeholder', async () => {
    expect(await translateIncoming(req('m2', translate('chat.message.encryptedUnavailable'), 'pt'))).toEqual({ status: 'none' });
    for (const lng of ['pt', 'en']) {
      const placeholder = appI18n.t('chat.message.encryptedUnavailable', { lng });
      expect(await translateIncoming(req(`m2-${lng}`, placeholder, 'pt'))).toEqual({ status: 'none' });
    }
    expect(detect).not.toHaveBeenCalled();
    expect(getCachedIncoming('r1', 'm2', 'content', 'pt', translate('chat.message.encryptedUnavailable'))).toBeUndefined();
  });

  it('returns none for text without enough letters and caches it', async () => {
    expect(await translateIncoming(req('m0', 'kkkk 😂', 'pt'))).toEqual({ status: 'none' });
    expect(detect).not.toHaveBeenCalled();
    expect(getCachedIncoming('r1', 'm0', 'content', 'pt', 'kkkk 😂')).toEqual({ status: 'none' });
  });

  it('returns preparing and starts the download while the model is missing', async () => {
    native.support.mockResolvedValue('unavailable');
    bergamot.support.mockResolvedValue('downloadable');
    detect.mockResolvedValue({ language: 'en', confidence: 0.9 });
    expect(await translateIncoming(req('m3', 'see you later', 'pt'))).toEqual({ status: 'preparing', sourceLanguage: 'en' });
    expect(bergamot.prepare).toHaveBeenCalledWith('en', 'pt');
    expect(getCachedIncoming('r1', 'm3', 'content', 'pt', 'see you later')).toBeUndefined();
  });

  it('starts a single fallback download per pair', async () => {
    native.support.mockResolvedValue('unavailable');
    bergamot.support.mockResolvedValue('downloadable');
    const download = deferred<void>();
    bergamot.prepare.mockReturnValue(download.promise);
    await translateIncoming(req('m3', 'see you later', 'pt'));
    await translateIncoming(req('m4', 'good night everyone', 'pt'));
    expect(bergamot.prepare).toHaveBeenCalledTimes(1);
    download.resolve();
  });

  it('notifies invalidation when the download finishes', async () => {
    native.support.mockResolvedValue('unavailable');
    bergamot.support.mockResolvedValue('downloadable');
    const download = deferred<void>();
    bergamot.prepare.mockReturnValue(download.promise);
    const listener = vi.fn();
    subscribeIncomingInvalidation(listener);
    await translateIncoming(req('m3', 'see you later', 'pt'));
    expect(listener).not.toHaveBeenCalled();
    bergamot.support.mockResolvedValue('available');
    download.resolve();
    await flush();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(await translateIncoming(req('m3', 'see you later', 'pt'))).toEqual({
      status: 'translated',
      text: 'PT:see you later',
      sourceLanguage: 'en',
    });
  });

  it('notifies invalidation when a failed download may be retried', async () => {
    native.support.mockResolvedValue('unavailable');
    bergamot.support.mockResolvedValue('downloadable');
    bergamot.prepare.mockRejectedValue(new Error('download-failed'));
    const retryListeners = new Set<() => void>();
    const withRetry: TranslationEngine = {
      ...bergamot,
      onRetryAvailable: (listener) => {
        retryListeners.add(listener);
        return () => {
          retryListeners.delete(listener);
        };
      },
    };
    bergamotLoader.load.mockResolvedValue(withRetry);
    const listener = vi.fn();
    subscribeIncomingInvalidation(listener);
    expect(await translateIncoming(req('m3', 'see you later', 'pt'))).toEqual({ status: 'preparing', sourceLanguage: 'en' });
    await flush();
    expect(listener).toHaveBeenCalledTimes(1);
    bergamot.prepare.mockRejectedValue(new Error('download-cooldown'));
    expect(await translateIncoming(req('m3', 'see you later', 'pt'))).toEqual({ status: 'preparing', sourceLanguage: 'en' });
    await flush();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(retryListeners.size).toBe(1);
    for (const retry of retryListeners) retry();
    expect(listener).toHaveBeenCalledTimes(2);
    resetIncomingForTests();
    expect(retryListeners.size).toBe(0);
  });

  it('a pair that fails its integrity check notifies, so waiting messages stop preparing', async () => {
    native.support.mockResolvedValue('unavailable');
    bergamot.support.mockResolvedValue('downloadable');
    const download = deferred<void>();
    bergamot.prepare.mockReturnValue(download.promise.then(() => Promise.reject(new Error('model-load-failed'))));
    const listener = vi.fn();
    subscribeIncomingInvalidation(listener);
    expect((await translateIncoming(req('i1', 'see you later', 'pt'))).status).toBe('preparing');
    bergamot.support.mockResolvedValue('failed');
    download.resolve();
    await flush();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(await translateIncoming(req('i1', 'see you later', 'pt'))).toEqual({ status: 'none' });
  });

  it('polls a native pair downloading elsewhere while messages wait, and notifies once it is ready', async () => {
    vi.useFakeTimers();
    native.support.mockResolvedValue('downloading');
    const listener = vi.fn();
    const unsubscribe = subscribeIncomingInvalidation(listener);
    expect((await translateIncoming(req('p1', 'see you later', 'pt'))).status).toBe('preparing');
    expect((await translateIncoming(req('p2', 'good night everyone', 'pt'))).status).toBe('preparing');
    native.support.mockClear();
    await vi.advanceTimersByTimeAsync(NATIVE_AVAILABILITY_POLL_MS);
    expect(native.support).toHaveBeenCalledTimes(1);
    expect(listener).not.toHaveBeenCalled();
    native.support.mockResolvedValue('available');
    await vi.advanceTimersByTimeAsync(NATIVE_AVAILABILITY_POLL_MS);
    expect(native.support).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(NATIVE_AVAILABILITY_POLL_MS * 3);
    expect(native.support).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('stops polling native availability when nothing waits any more', async () => {
    vi.useFakeTimers();
    native.support.mockResolvedValue('downloading');
    const unsubscribe = subscribeIncomingInvalidation(vi.fn());
    expect((await translateIncoming(req('p3', 'see you later', 'pt'))).status).toBe('preparing');
    unsubscribe();
    native.support.mockClear();
    await vi.advanceTimersByTimeAsync(NATIVE_AVAILABILITY_POLL_MS * 3);
    expect(native.support).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not poll native availability when nobody listens', async () => {
    vi.useFakeTimers();
    native.support.mockResolvedValue('downloading');
    expect((await translateIncoming(req('p4', 'see you later', 'pt'))).status).toBe('preparing');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('notifies when the native engine says a pair became usable again', () => {
    const retryListeners = new Set<() => void>();
    mocks.native = {
      ...native,
      onRetryAvailable: (listener: () => void) => {
        retryListeners.add(listener);
        return () => {
          retryListeners.delete(listener);
        };
      },
    } as FakeEngine;
    const listener = vi.fn();
    subscribeIncomingInvalidation(listener);
    expect(retryListeners.size).toBe(1);
    for (const retry of retryListeners) retry();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('stops notifying after unsubscribe', async () => {
    native.support.mockResolvedValue('unavailable');
    bergamot.support.mockResolvedValue('downloadable');
    const listener = vi.fn();
    subscribeIncomingInvalidation(listener)();
    await translateIncoming(req('m3', 'see you later', 'pt'));
    await flush();
    expect(listener).not.toHaveBeenCalled();
  });

  it('returns preparing for a native model that is downloading, without calling prepare', async () => {
    for (const availability of ['downloading'] as const) {
      native.support.mockResolvedValue(availability);
      resetRouterForTests();
      registerFallbackEngine(() => bergamotLoader.load());
      expect(await translateIncoming(req(`n-${availability}`, 'see you later', 'pt'))).toEqual({
        status: 'preparing',
        sourceLanguage: 'en',
      });
    }
    expect(native.prepare).not.toHaveBeenCalled();
    expect(bergamotLoader.load).not.toHaveBeenCalled();
    expect(native.translate).not.toHaveBeenCalled();
  });

  it('notifies invalidation when native download progress completes', async () => {
    native.support.mockResolvedValue('downloading');
    const listener = vi.fn();
    subscribeIncomingInvalidation(listener);
    await translateIncoming(req('n1', 'see you later', 'pt'));
    native.emitProgress({ engine: 'native', pair: 'en-pt', loaded: 0.5, total: 1 });
    expect(listener).not.toHaveBeenCalled();
    native.support.mockResolvedValue('available');
    native.emitProgress({ engine: 'native', pair: 'en-pt', loaded: 1, total: 1 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect((await translateIncoming(req('n1', 'see you later', 'pt'))).status).toBe('translated');
  });

  it('returns none without caching when native reports failed', async () => {
    native.support.mockResolvedValue('failed');
    expect(await translateIncoming(req('f1', 'see you later', 'pt'))).toEqual({ status: 'none' });
    expect(getCachedIncoming('r1', 'f1', 'content', 'pt', 'see you later')).toBeUndefined();
    expect(bergamotLoader.load).not.toHaveBeenCalled();
  });

  it('returns none without caching when the engine throws', async () => {
    native.translate.mockRejectedValue(new Error('translate-failed'));
    expect(await translateIncoming(req('e1', 'see you later', 'pt'))).toEqual({ status: 'none' });
    expect(getCachedIncoming('r1', 'e1', 'content', 'pt', 'see you later')).toBeUndefined();
  });

  it('a native failure that hands the pair to the fallback is retried on the fallback at once', async () => {
    native.translate.mockImplementation(() => {
      native.support.mockResolvedValue('unavailable');
      return Promise.reject(new Error('translate-failed'));
    });
    expect(await translateIncoming(req('h1', 'see you later', 'pt'))).toEqual({ status: 'translated', text: 'PT:see you later', sourceLanguage: 'en' });
    expect(bergamot.translate).toHaveBeenCalledTimes(1);
  });

  it('a native failure that leaves native in charge is not retried', async () => {
    native.translate.mockRejectedValue(new Error('translate-failed'));
    expect(await translateIncoming(req('h2', 'see you later', 'pt'))).toEqual({ status: 'none' });
    expect(native.translate).toHaveBeenCalledTimes(1);
    expect(bergamotLoader.load).not.toHaveBeenCalled();
  });

  it('a queued request for a message already translated meanwhile reads the cache instead of translating again', async () => {
    const first = translateIncoming(req('d1', 'see you later', 'pt'));
    const second = translateIncoming(req('d1', 'see you later', 'pt'));
    expect(await first).toEqual({ status: 'translated', text: 'PT:see you later', sourceLanguage: 'en' });
    expect(await second).toEqual({ status: 'translated', text: 'PT:see you later', sourceLanguage: 'en' });
    expect(native.translate).toHaveBeenCalledTimes(1);
  });

  it('returns none when no engine is available', async () => {
    delete (globalThis as Record<string, unknown>).Translator;
    resetRouterForTests();
    expect(await translateIncoming(req('x1', 'see you later', 'pt'))).toEqual({ status: 'none' });
  });

  it('skips requests aborted before they start', async () => {
    const first = translateIncoming(req('a', 'first message here', 'pt'));
    const controller = new AbortController();
    const second = translateIncoming({ ...req('b', 'second message here', 'pt'), signal: controller.signal });
    controller.abort();
    await Promise.all([first, second.catch(() => null)]);
    expect(native.translate).toHaveBeenCalledTimes(1);
    expect(await second).toEqual({ status: 'none' });
    expect(getCachedIncoming('r1', 'b', 'content', 'pt', 'second message here')).toBeUndefined();
  });

  it('does not detect or translate a request whose signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await translateIncoming({ ...req('c', 'third message here', 'pt'), signal: controller.signal })).toEqual({ status: 'none' });
    expect(detect).not.toHaveBeenCalled();
    expect(native.translate).not.toHaveBeenCalled();
  });

  it('translates the most recently requested visible message first', async () => {
    const gate = deferred<string>();
    const order: string[] = [];
    native.translate.mockImplementation((text) => {
      order.push(text);
      return order.length === 1 ? gate.promise : Promise.resolve(`PT:${text}`);
    });
    const first = translateIncoming(req('q1', 'first message', 'pt'));
    await flush();
    const second = translateIncoming(req('q2', 'second message', 'pt'));
    const third = translateIncoming(req('q3', 'third message', 'pt'));
    gate.resolve('PT:first message');
    await Promise.all([first, second, third]);
    expect(order).toEqual(['first message', 'third message', 'second message']);
  });

  it('runs one translation at a time', async () => {
    let active = 0;
    let peak = 0;
    native.translate.mockImplementation(async (text) => {
      active += 1;
      peak = Math.max(peak, active);
      await flush();
      active -= 1;
      return `PT:${text}`;
    });
    await Promise.all(['one message', 'two message', 'three message'].map((text, i) => translateIncoming(req(`s${i}`, text, 'pt'))));
    expect(peak).toBe(1);
  });

  it('caches per target language and retranslates after a language switch', async () => {
    detect.mockResolvedValue({ language: 'en', confidence: 0.9 });
    await translateIncoming(req('m4', 'see you later', 'pt'));
    await translateIncoming(req('m4', 'see you later', 'pt'));
    expect(native.translate).toHaveBeenCalledTimes(1);
    expect(await translateIncoming(req('m4', 'see you later', 'en'))).toEqual({ status: 'none' });
  });

  it('returns none for a message confidently in the target language, without translating', async () => {
    detect.mockResolvedValue({ language: 'pt', confidence: 0.95 });
    expect(await translateIncoming(req('p1', 'bom dia equipe', 'pt'))).toEqual({ status: 'none' });
    expect(native.translate).not.toHaveBeenCalled();
  });

  it('translates from the other language when detection is unsure (short messages)', async () => {
    detect.mockResolvedValue(null);
    expect(await translateIncoming(req('p2', 'achei bom', 'en'))).toEqual({ status: 'translated', text: 'EN:achei bom', sourceLanguage: 'pt' });
    detect.mockResolvedValue({ language: 'en', confidence: 0.5 });
    expect(await translateIncoming(req('p3', 'nice one', 'pt'))).toEqual({ status: 'translated', text: 'PT:nice one', sourceLanguage: 'en' });
    expect(native.translate).toHaveBeenCalledWith('achei bom', 'pt', 'en', { priority: 1 });
  });

  it('an unsure guess never shows preparing nor downloads a model', async () => {
    detect.mockResolvedValue(null);
    native.support.mockResolvedValue('downloadable');
    expect(await translateIncoming(req('p5', 'achei bom', 'pt'))).toEqual({ status: 'none' });
    expect(getCachedIncoming('r1', 'p5', 'content', 'pt', 'achei bom')).toBeUndefined();
    delete (globalThis as Record<string, unknown>).Translator;
    resetRouterForTests();
    registerFallbackEngine(() => bergamotLoader.load());
    bergamot.support.mockResolvedValue('downloadable');
    expect(await translateIncoming(req('p6', 'achei bom', 'pt'))).toEqual({ status: 'none' });
    expect(bergamot.prepare).not.toHaveBeenCalled();
  });

  it('an unsure guess that translates to the same text was already in the target language: none, cached', async () => {
    detect.mockResolvedValue(null);
    native.translate.mockImplementation((text) => Promise.resolve(` ${text.toUpperCase()} `));
    expect(await translateIncoming(req('p4', 'Hello Team', 'en'))).toEqual({ status: 'none' });
    expect(getCachedIncoming('r1', 'p4', 'content', 'en', 'Hello Team')).toEqual({ status: 'none' });
  });

  it('a confident translation that comes back equal to the original is none, cached', async () => {
    detect.mockResolvedValue({ language: 'en', confidence: 0.9 });
    native.translate.mockImplementation((text) => Promise.resolve(`${text}.`));
    expect(await translateIncoming(req('p7', 'Ok Google', 'pt'))).toEqual({ status: 'none' });
    expect(getCachedIncoming('r1', 'p7', 'content', 'pt', 'Ok Google')).toEqual({ status: 'none' });
  });

  it('translates very short chat messages', async () => {
    detect.mockResolvedValue(null);
    expect(await translateIncoming(req('a1', 'oi', 'en'))).toEqual({ status: 'translated', text: 'EN:oi', sourceLanguage: 'pt' });
  });

  it('expands chat abbreviations only in the text sent to the engine', async () => {
    detect.mockResolvedValue(null);
    expect(await translateIncoming(req('a2', 'vlw', 'en'))).toEqual({ status: 'translated', text: 'EN:obrigado', sourceLanguage: 'pt' });
    expect(native.translate).toHaveBeenCalledWith('obrigado', 'pt', 'en', { priority: 1 });
    expect(getCachedIncoming('r1', 'a2', 'content', 'en', 'vlw')?.status).toBe('translated');
  });

  it('uses the abbreviations of the source language', async () => {
    detect.mockResolvedValue({ language: 'en', confidence: 0.9 });
    await translateIncoming(req('a3', 'thx u', 'pt'));
    expect(native.translate).toHaveBeenCalledWith('thanks you', 'en', 'pt', { priority: 1 });
  });

  it('translates a multi-line message paragraph by paragraph', async () => {
    expect(await translateIncoming(req('a4', 'good morning\n\nsee you soon', 'pt'))).toEqual({
      status: 'translated',
      text: 'PT:good morning\n\nPT:see you soon',
      sourceLanguage: 'en',
    });
    expect(native.translate).toHaveBeenCalledTimes(2);
  });
});

describe('explicit requests', () => {
  function explicit(messageId: string, text: string, target: Language): IncomingRequest {
    return { ...req(messageId, text, target), explicit: true };
  }

  it('an explicit request with an unsure guess may download the fallback model', async () => {
    delete (globalThis as Record<string, unknown>).Translator;
    detect.mockResolvedValue(null);
    bergamot.support.mockResolvedValue('downloadable');
    expect(await translateIncoming(explicit('e1', 'achei bom', 'en'))).toEqual({ status: 'preparing', sourceLanguage: 'pt' });
    expect(bergamot.prepare).toHaveBeenCalledWith('pt', 'en');
  });

  it('lets detection download its model only for an explicit request', async () => {
    await translateIncoming(explicit('e2', 'see you later', 'pt'));
    expect(detect).toHaveBeenLastCalledWith('see you later', { allowDownload: true });
    await translateIncoming(req('e3', 'see you later', 'pt'));
    expect(detect).toHaveBeenLastCalledWith('see you later', { allowDownload: false });
  });

  it('a downloadable native pair without a gesture is a retryable none, never preparing', async () => {
    native.support.mockResolvedValue('downloadable');
    expect(await translateIncoming(explicit('e4', 'see you later', 'pt'))).toEqual({ status: 'none' });
    expect(await translateIncoming(req('e5', 'see you later', 'pt'))).toEqual({ status: 'none' });
    expect(getCachedIncoming('r1', 'e4', 'content', 'pt', 'see you later')).toBeUndefined();
    expect(native.prepare).not.toHaveBeenCalled();
  });

  it('a gesture starts the native download of the other language into the interface language', async () => {
    const download = deferred<void>();
    gesture.mockReturnValue(download.promise);
    native.support.mockResolvedValue('downloadable');
    const listener = vi.fn();
    subscribeIncomingInvalidation(listener);
    prepareTranslationOnGesture('pt');
    prepareTranslationOnGesture('pt');
    expect(gesture).toHaveBeenCalledTimes(1);
    expect(gesture).toHaveBeenCalledWith('en', 'pt');
    expect(await translateIncoming(explicit('e6', 'see you later', 'pt'))).toEqual({ status: 'preparing', sourceLanguage: 'en' });
    download.resolve();
    await flush();
    expect(listener).toHaveBeenCalled();
    native.support.mockResolvedValue('available');
    expect((await translateIncoming(explicit('e6', 'see you later', 'pt'))).status).toBe('translated');
  });

  it('a gesture whose download fails still notifies so the request can be retried', async () => {
    gesture.mockRejectedValue(new Error('model-load-failed'));
    const listener = vi.fn();
    subscribeIncomingInvalidation(listener);
    prepareTranslationOnGesture('en');
    await flush();
    expect(gesture).toHaveBeenCalledWith('pt', 'en');
    expect(listener).toHaveBeenCalled();
    prepareTranslationOnGesture('en');
    expect(gesture).toHaveBeenCalledTimes(2);
  });

  it('a gesture does nothing without the native API', () => {
    delete (globalThis as Record<string, unknown>).Translator;
    prepareTranslationOnGesture('pt');
    expect(gesture).not.toHaveBeenCalled();
  });

  it('detection confidently in the interface language never vetoes an explicit request', async () => {
    detect.mockResolvedValue({ language: 'en', confidence: 0.95 });
    expect(await translateIncoming(explicit('v1', 'vlw', 'en'))).toEqual({
      status: 'translated',
      text: 'EN:obrigado',
      sourceLanguage: 'pt',
    });
    expect(native.translate).toHaveBeenCalledWith('obrigado', 'pt', 'en', { priority: 1 });
  });

  it('detection confidently in the other language is used as the source of an explicit request', async () => {
    detect.mockResolvedValue({ language: 'en', confidence: 0.95 });
    expect((await translateIncoming(explicit('v2', 'see you later', 'pt'))).status).toBe('translated');
    expect(native.translate).toHaveBeenCalledWith('see you later', 'en', 'pt', { priority: 1 });
  });

  it('an explicit request whose translation equals the original caches none', async () => {
    detect.mockResolvedValue({ language: 'en', confidence: 0.95 });
    native.translate.mockImplementation((text) => Promise.resolve(text));
    expect(await translateIncoming(explicit('v3', 'hello team', 'en'))).toEqual({ status: 'none' });
    expect(getCachedIncoming('r1', 'v3', 'content', 'en', 'hello team')).toEqual({ status: 'none' });
  });

  it('an automatic request confidently in the interface language still caches none without translating', async () => {
    detect.mockResolvedValue({ language: 'en', confidence: 0.95 });
    expect(await translateIncoming(req('v4', 'vlw', 'en'))).toEqual({ status: 'none' });
    expect(native.translate).not.toHaveBeenCalled();
    expect(getCachedIncoming('r1', 'v4', 'content', 'en', 'vlw')).toEqual({ status: 'none' });
  });

});

describe('assessIncoming', () => {
  it('skips text that is not translatable or is the undecryptable placeholder', async () => {
    expect(await assessIncoming('kkkk 😂', 'pt')).toBe('skip');
    expect(await assessIncoming(translate('chat.message.encryptedUnavailable'), 'pt')).toBe('skip');
    expect(detect).not.toHaveBeenCalled();
  });

  it('classifies the detection against the interface language without downloading', async () => {
    detect.mockResolvedValue({ language: 'pt', confidence: 0.9 });
    expect(await assessIncoming('bom dia equipe', 'pt')).toBe('target');
    expect(detect).toHaveBeenCalledWith('bom dia equipe', { allowDownload: false });
    expect(await assessIncoming('bom dia equipe', 'en')).toBe('other');
    detect.mockResolvedValue({ language: 'pt', confidence: 0.5 });
    expect(await assessIncoming('bom dia', 'pt')).toBe('unsure');
    detect.mockResolvedValue(null);
    expect(await assessIncoming('oi', 'pt')).toBe('unsure');
  });

  it('is unsure when detection fails', async () => {
    detect.mockRejectedValue(new Error('boom'));
    expect(await assessIncoming('good morning', 'pt')).toBe('unsure');
  });
});

describe('clearing while translating (security rule 6)', () => {
  const clears: Array<[string, () => void]> = [
    ['message deleted for everyone', () => forgetTranslation('r1', 'c1')],
    ['room key removed', () => clearTranslationsForRoom('r1')],
    ['logout', () => clearTranslationCache()],
  ];

  it.each(clears)('does not write back an in-flight result after %s', async (_name, clear) => {
    const gate = deferred<string>();
    native.translate.mockReturnValue(gate.promise);
    const job = translateIncoming(req('c1', 'see you later', 'pt'));
    await flush();
    expect(native.translate).toHaveBeenCalledTimes(1);
    clear();
    gate.resolve('PT:see you later');
    expect(await job).toEqual({ status: 'none' });
    expect(getCachedIncoming('r1', 'c1', 'content', 'pt', 'see you later')).toBeUndefined();
  });

  it('does not cache a definitive none after a clear during detection', async () => {
    const detection = deferred<DetectedLanguage | null>();
    detect.mockReturnValue(detection.promise);
    const job = translateIncoming(req('c1', 'bom dia equipe', 'pt'));
    await flush();
    forgetTranslation('r1', 'c1');
    detection.resolve({ language: 'pt', confidence: 0.95 });
    expect(await job).toEqual({ status: 'none' });
    expect(getCachedIncoming('r1', 'c1', 'content', 'pt', 'bom dia equipe')).toBeUndefined();
  });

  it('drops a pending job for a cleared room without detecting or translating it', async () => {
    const gate = deferred<string>();
    native.translate.mockReturnValueOnce(gate.promise);
    const first = translateIncoming(req('q1', 'first message', 'pt'));
    await flush();
    const other = translateIncoming({ ...req('q2', 'second message', 'pt'), roomId: 'r2' });
    clearTranslationsForRoom('r2');
    gate.resolve('PT:first message');
    expect(await first).toEqual({ status: 'translated', text: 'PT:first message', sourceLanguage: 'en' });
    expect(await other).toEqual({ status: 'none' });
    expect(native.translate).toHaveBeenCalledTimes(1);
    expect(detect).toHaveBeenCalledTimes(1);
  });

  it('drops every pending job on logout', async () => {
    const gate = deferred<string>();
    native.translate.mockReturnValueOnce(gate.promise);
    const first = translateIncoming(req('q1', 'first message', 'pt'));
    await flush();
    const pendingJobs = [translateIncoming(req('q2', 'second message', 'pt')), translateIncoming(req('q3', 'third message', 'pt'))];
    clearTranslationCache();
    gate.resolve('PT:first message');
    expect(await Promise.all([first, ...pendingJobs])).toEqual([{ status: 'none' }, { status: 'none' }, { status: 'none' }]);
    expect(native.translate).toHaveBeenCalledTimes(1);
  });

  it('still translates requests queued after the clear', async () => {
    forgetTranslation('r1', 'c1');
    expect((await translateIncoming(req('c1', 'see you later', 'pt'))).status).toBe('translated');
    expect(getCachedIncoming('r1', 'c1', 'content', 'pt', 'see you later')?.status).toBe('translated');
  });
});

describe('hung engine', () => {
  it('times out a hung translate, frees the queue and never caches the late result', async () => {
    vi.useFakeTimers();
    const late = deferred<string>();
    native.translate.mockReturnValueOnce(late.promise);
    let settled = false;
    const hung = translateIncoming(req('h1', 'first message', 'pt')).finally(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    const next = translateIncoming(req('h2', 'second message', 'pt'));
    await vi.advanceTimersByTimeAsync(TRANSLATION_JOB_TIMEOUT_MS - 1);
    expect(settled).toBe(false);
    expect(native.translate).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await hung).toEqual({ status: 'none' });
    expect(await next).toEqual({ status: 'translated', text: 'PT:second message', sourceLanguage: 'en' });
    late.resolve('PT:first message');
    await vi.advanceTimersByTimeAsync(0);
    expect(getCachedIncoming('r1', 'h1', 'content', 'pt', 'first message')).toBeUndefined();
  });

  it('times out a hung detection too', async () => {
    vi.useFakeTimers();
    detect.mockReturnValueOnce(new Promise(() => undefined));
    const hung = translateIncoming(req('h3', 'first message', 'pt'));
    await vi.advanceTimersByTimeAsync(TRANSLATION_JOB_TIMEOUT_MS);
    expect(await hung).toEqual({ status: 'none' });
    expect((await translateIncoming(req('h4', 'second message', 'pt'))).status).toBe('translated');
  });

  it('uses a 20 second job timeout', () => {
    expect(TRANSLATION_JOB_TIMEOUT_MS).toBe(20_000);
  });
});

describe('abort listener', () => {
  it('is removed once the job leaves the queue', async () => {
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    await translateIncoming({ ...req('l1', 'see you later', 'pt'), signal: controller.signal });
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });
});

describe('getCachedIncoming', () => {
  it('returns undefined before anything is translated', () => {
    expect(getCachedIncoming('r1', 'nothing', 'content', 'pt', 'anything at all')).toBeUndefined();
  });

  it('ignores a cached entry for a different source text when the text is given', async () => {
    await translateIncoming(req('m5', 'see you later', 'pt'));
    expect(getCachedIncoming('r1', 'm5', 'content', 'pt', 'see you later')?.status).toBe('translated');
    expect(getCachedIncoming('r1', 'm5', 'content', 'pt', 'edited text here')).toBeUndefined();
  });

  it('follows the cache cleanup', async () => {
    await translateIncoming(req('m6', 'see you later', 'pt'));
    forgetTranslation('r1', 'm6');
    expect(getCachedIncoming('r1', 'm6', 'content', 'pt', 'see you later')).toBeUndefined();
  });
});
