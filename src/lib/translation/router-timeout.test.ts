import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetNativeEngineForTests } from './engines/native-engine';
import { NATIVE_API_TIMEOUT_MS } from './native-timeout';
import { registerFallbackEngine, resetRouterForTests, resolveEngine } from './router';
import type { TranslationEngine } from './types';

const fallback: TranslationEngine = {
  id: 'bergamot',
  support: () => Promise.resolve('available'),
  prepare: () => Promise.resolve(),
  translate: (text) => Promise.resolve(text),
  onProgress: () => () => undefined,
};

beforeEach(() => {
  vi.useFakeTimers();
  resetRouterForTests();
  resetNativeEngineForTests();
  registerFallbackEngine(() => Promise.resolve(fallback));
});

afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as Record<string, unknown>).Translator;
});

describe('resolveEngine with a hanging native availability', () => {
  it('falls back to the fallback engine after the timeout', async () => {
    (globalThis as Record<string, unknown>).Translator = { availability: () => new Promise<never>(() => undefined) };
    const pending = resolveEngine('en', 'pt');
    await vi.advanceTimersByTimeAsync(NATIVE_API_TIMEOUT_MS);
    expect(await pending).toEqual({ engine: fallback, support: 'available' });
  });
});
