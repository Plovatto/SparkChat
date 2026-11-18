import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { TranslationEngine, TranslationSupport } from './types';

type FakeEngine = {
  id: TranslationEngine['id'];
  support: Mock<TranslationEngine['support']>;
  prepare: Mock<TranslationEngine['prepare']>;
  translate: Mock<TranslationEngine['translate']>;
  onProgress: TranslationEngine['onProgress'];
};

function fakeEngine(id: 'native' | 'bergamot'): FakeEngine {
  return {
    id,
    support: vi.fn<TranslationEngine['support']>(() => Promise.resolve<TranslationSupport>('available')),
    prepare: vi.fn<TranslationEngine['prepare']>(() => Promise.resolve()),
    translate: vi.fn<TranslationEngine['translate']>((text) => Promise.resolve(text)),
    onProgress: () => () => undefined,
  };
}

const native = vi.hoisted(() => ({ engine: null as unknown as FakeEngine }));

vi.mock('./engines/native-engine', () => ({
  get nativeEngine() {
    return native.engine;
  },
}));

import { disposeTranslationEngines, invalidateEngineRoutes, registerFallbackEngine, resetRouterForTests, resolveEngine } from './router';

let bergamot: FakeEngine;
const bergamotLoader = { load: vi.fn<() => Promise<TranslationEngine>>() };

function installTranslatorApi(options: { availability: TranslationSupport }): void {
  (globalThis as Record<string, unknown>).Translator = {};
  native.engine.support.mockResolvedValue(options.availability);
}

beforeEach(() => {
  resetRouterForTests();
  native.engine = fakeEngine('native');
  bergamot = fakeEngine('bergamot');
  bergamotLoader.load.mockReset();
  bergamotLoader.load.mockResolvedValue(bergamot);
  registerFallbackEngine(() => bergamotLoader.load());
  delete (globalThis as Record<string, unknown>).Translator;
});

afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as Record<string, unknown>).Translator;
});

describe('resolveEngine', () => {
  it('uses native whenever the Translator API exists, even while its model downloads', async () => {
    installTranslatorApi({ availability: 'downloadable' });
    expect((await resolveEngine('en', 'pt'))?.engine.id).toBe('native');
    expect(bergamotLoader.load).not.toHaveBeenCalled();
  });

  it.each(['downloading', 'failed', 'available'] as const)('keeps native for %s and never loads the fallback', async (availability) => {
    installTranslatorApi({ availability });
    expect(await resolveEngine('en', 'pt')).toEqual({ engine: native.engine, support: availability });
    expect(bergamotLoader.load).not.toHaveBeenCalled();
  });

  it('falls back to bergamot only without the API or with an unavailable pair', async () => {
    expect((await resolveEngine('en', 'pt'))?.engine.id).toBe('bergamot');
    installTranslatorApi({ availability: 'unavailable' });
    expect((await resolveEngine('pt', 'en'))?.engine.id).toBe('bergamot');
  });

  it('returns the fallback support for the pair', async () => {
    bergamot.support.mockResolvedValue('downloadable');
    expect(await resolveEngine('en', 'pt')).toEqual({ engine: bergamot, support: 'downloadable' });
  });

  it('returns null when nothing can translate', async () => {
    resetRouterForTests();
    expect(await resolveEngine('en', 'pt')).toBeNull();
  });

  it('returns null when the fallback fails to load', async () => {
    bergamotLoader.load.mockRejectedValue(new Error('model-load-failed'));
    expect(await resolveEngine('en', 'pt')).toBeNull();
  });

  it('memoizes the route per pair for 30 seconds', async () => {
    vi.useFakeTimers();
    installTranslatorApi({ availability: 'available' });
    await resolveEngine('en', 'pt');
    await resolveEngine('en', 'pt');
    expect(native.engine.support).toHaveBeenCalledTimes(1);
    await resolveEngine('pt', 'en');
    expect(native.engine.support).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(30_001);
    await resolveEngine('en', 'pt');
    expect(native.engine.support).toHaveBeenCalledTimes(3);
  });

  it('re-resolves after the memo is invalidated', async () => {
    installTranslatorApi({ availability: 'failed' });
    expect((await resolveEngine('en', 'pt'))?.support).toBe('failed');
    native.engine.support.mockResolvedValue('available');
    expect((await resolveEngine('en', 'pt'))?.support).toBe('failed');
    invalidateEngineRoutes();
    expect((await resolveEngine('en', 'pt'))?.support).toBe('available');
  });

  it.each(['downloadable', 'downloading'] as const)('does not memoize the non-final %s state', async (availability) => {
    installTranslatorApi({ availability });
    expect((await resolveEngine('en', 'pt'))?.support).toBe(availability);
    native.engine.support.mockResolvedValue('available');
    expect((await resolveEngine('en', 'pt'))?.support).toBe('available');
    expect(native.engine.support).toHaveBeenCalledTimes(2);
  });

  it('does not memoize the fallback downloadable state either', async () => {
    bergamot.support.mockResolvedValue('downloadable');
    await resolveEngine('en', 'pt');
    await resolveEngine('en', 'pt');
    expect(bergamot.support).toHaveBeenCalledTimes(2);
    expect(bergamotLoader.load).toHaveBeenCalledTimes(1);
  });
});

describe('disposeTranslationEngines', () => {
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('disposes the fallback engine when it was loaded', async () => {
    const dispose = vi.fn();
    bergamotLoader.load.mockResolvedValue({ ...bergamot, dispose });
    await resolveEngine('en', 'pt');
    disposeTranslationEngines();
    await flush();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('never loads the fallback just to dispose it', async () => {
    disposeTranslationEngines();
    await flush();
    expect(bergamotLoader.load).not.toHaveBeenCalled();
  });
});
