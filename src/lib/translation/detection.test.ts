import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NATIVE_API_TIMEOUT_MS } from './native-timeout';
import { detectLanguage, resetDetectorForTests } from './detection';

interface FakeResult {
  detectedLanguage: string;
  confidence: number;
}

const fake = { createCalls: 0, detectCalls: [] as string[] };

function installFakeDetector(results: FakeResult[], options: { failDetect?: boolean } = {}): void {
  fake.createCalls = 0;
  fake.detectCalls = [];
  (globalThis as Record<string, unknown>).LanguageDetector = {
    create: (createOptions: { expectedInputLanguages?: string[] }) => {
      fake.createCalls += 1;
      expect(createOptions.expectedInputLanguages).toEqual(['pt', 'en']);
      return Promise.resolve({
        detect: (text: string) => {
          fake.detectCalls.push(text);
          return options.failDetect ? Promise.reject(new Error('boom')) : Promise.resolve(results);
        },
      });
    },
  };
}

afterEach(() => {
  delete (globalThis as Record<string, unknown>).LanguageDetector;
  resetDetectorForTests();
});

describe('detectLanguage', () => {
  it('uses the native detector when present and ignores other languages', async () => {
    installFakeDetector([{ detectedLanguage: 'es', confidence: 0.95 }]);
    expect(await detectLanguage('hola amigos')).toBeNull();
  });

  it('normalizes pt-BR to pt', async () => {
    installFakeDetector([{ detectedLanguage: 'pt-BR', confidence: 0.9 }]);
    expect(await detectLanguage('oi gente')).toEqual({ language: 'pt', confidence: 0.9 });
  });

  it('reuses a single detector instance', async () => {
    installFakeDetector([{ detectedLanguage: 'en', confidence: 0.9 }]);
    await detectLanguage('hello there');
    await detectLanguage('hello again');
    expect(fake.createCalls).toBe(1);
  });

  it('runs detection only on the translatable text', async () => {
    installFakeDetector([{ detectedLanguage: 'en', confidence: 0.9 }]);
    await detectLanguage('hello @maria https://x.com/a');
    expect(fake.detectCalls).toEqual(['hello  ']);
  });

  it('falls back to the heuristic without LanguageDetector', async () => {
    expect((await detectLanguage('good morning everyone'))?.language).toBe('en');
  });

  it('falls back to the heuristic when detect throws', async () => {
    installFakeDetector([], { failDetect: true });
    expect((await detectLanguage('good morning everyone'))?.language).toBe('en');
  });
});

describe('detectLanguage native timeouts', () => {
  beforeEach(() => {
    resetDetectorForTests();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as Record<string, unknown>).LanguageDetector;
    resetDetectorForTests();
  });

  it('falls back to the heuristic when create never settles and stops retrying', async () => {
    const create = vi.fn(() => new Promise<never>(() => undefined));
    (globalThis as Record<string, unknown>).LanguageDetector = { create };
    const pending = detectLanguage('good morning everyone');
    await vi.advanceTimersByTimeAsync(NATIVE_API_TIMEOUT_MS);
    expect((await pending)?.language).toBe('en');
    expect((await detectLanguage('good morning everyone'))?.language).toBe('en');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('falls back to the heuristic when detect never settles', async () => {
    const detect = vi.fn(() => new Promise<never>(() => undefined));
    (globalThis as Record<string, unknown>).LanguageDetector = { create: () => Promise.resolve({ detect }) };
    const pending = detectLanguage('good morning everyone');
    await vi.advanceTimersByTimeAsync(NATIVE_API_TIMEOUT_MS);
    expect((await pending)?.language).toBe('en');
    expect(detect).toHaveBeenCalledTimes(1);
  });
});
