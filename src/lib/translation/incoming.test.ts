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
type DetectMock = Mock<(text: string) => Promise<DetectedLanguage | null>>;

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

const mocks = vi.hoisted(() => ({ native: null as unknown as FakeEngine, detect: null as unknown as DetectMock }));

vi.mock('./engines/native-engine', () => ({
  get nativeEngine() {
    return mocks.native;
  },
}));

vi.mock('./detection', () => ({
  detectLanguage: (text: string) => mocks.detect(text),
}));

import {
  getCachedIncoming,
  resetIncomingForTests,
  subscribeIncomingInvalidation,
  translateIncoming,
  type IncomingRequest,
} from './incoming';
import { registerFallbackEngine, resetRouterForTests } from './router';
import { clearTranslationCache, forgetTranslation } from './translation-cache';

let native: FakeEngine;
let bergamot: FakeEngine;
let detect: DetectMock;
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
  bergamotLoader.load.mockReset();
  bergamotLoader.load.mockResolvedValue(bergamot);
  registerFallbackEngine(() => bergamotLoader.load());
  (globalThis as Record<string, unknown>).Translator = {};
});

afterEach(() => {
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
    expect(getCachedIncoming('r1', 'm1', 'content', 'pt')).toEqual({
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
    expect(getCachedIncoming('r1', 'm2', 'content', 'pt')).toBeUndefined();
  });

  it('returns none for text without enough letters and caches it', async () => {
    expect(await translateIncoming(req('m0', 'kkkk 😂', 'pt'))).toEqual({ status: 'none' });
    expect(detect).not.toHaveBeenCalled();
    expect(getCachedIncoming('r1', 'm0', 'content', 'pt')).toEqual({ status: 'none' });
  });

  it('returns preparing and starts the download while the model is missing', async () => {
    native.support.mockResolvedValue('unavailable');
    bergamot.support.mockResolvedValue('downloadable');
    detect.mockResolvedValue({ language: 'en', confidence: 0.9 });
    expect(await translateIncoming(req('m3', 'see you later', 'pt'))).toEqual({ status: 'preparing', sourceLanguage: 'en' });
    expect(bergamot.prepare).toHaveBeenCalledWith('en', 'pt');
    expect(getCachedIncoming('r1', 'm3', 'content', 'pt')).toBeUndefined();
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
    // the router memo was invalidated, so the retry translates instead of preparing again
    expect(await translateIncoming(req('m3', 'see you later', 'pt'))).toEqual({
      status: 'translated',
      text: 'PT:see you later',
      sourceLanguage: 'en',
    });
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

  it('returns preparing for a native model that is not downloaded, without calling prepare', async () => {
    for (const availability of ['downloadable', 'downloading'] as const) {
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
    expect(getCachedIncoming('r1', 'f1', 'content', 'pt')).toBeUndefined();
    expect(bergamotLoader.load).not.toHaveBeenCalled();
  });

  it('returns none without caching when the engine throws', async () => {
    native.translate.mockRejectedValue(new Error('translate-failed'));
    expect(await translateIncoming(req('e1', 'see you later', 'pt'))).toEqual({ status: 'none' });
    expect(getCachedIncoming('r1', 'e1', 'content', 'pt')).toBeUndefined();
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
    // dropped requests resolve to an uncached none
    expect(await second).toEqual({ status: 'none' });
    expect(getCachedIncoming('r1', 'b', 'content', 'pt')).toBeUndefined();
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

  it('returns none for same language or low confidence', async () => {
    detect.mockResolvedValue({ language: 'pt', confidence: 0.95 });
    expect(await translateIncoming(req('p1', 'bom dia equipe', 'pt'))).toEqual({ status: 'none' });
    detect.mockResolvedValue({ language: 'en', confidence: 0.5 });
    expect(await translateIncoming(req('p2', 'good morning team', 'pt'))).toEqual({ status: 'none' });
    detect.mockResolvedValue(null);
    expect(await translateIncoming(req('p3', 'good evening team', 'pt'))).toEqual({ status: 'none' });
    expect(native.translate).not.toHaveBeenCalled();
    expect(getCachedIncoming('r1', 'p2', 'content', 'pt')).toEqual({ status: 'none' });
  });
});

describe('getCachedIncoming', () => {
  it('returns undefined before anything is translated', () => {
    expect(getCachedIncoming('r1', 'nothing', 'content', 'pt')).toBeUndefined();
  });

  it('ignores a cached entry for a different source text when the text is given', async () => {
    await translateIncoming(req('m5', 'see you later', 'pt'));
    expect(getCachedIncoming('r1', 'm5', 'content', 'pt', 'see you later')?.status).toBe('translated');
    expect(getCachedIncoming('r1', 'm5', 'content', 'pt', 'edited text here')).toBeUndefined();
  });

  it('follows the cache cleanup', async () => {
    await translateIncoming(req('m6', 'see you later', 'pt'));
    forgetTranslation('r1', 'm6');
    expect(getCachedIncoming('r1', 'm6', 'content', 'pt')).toBeUndefined();
  });
});
