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

function setDetectorAvailability(availability: string): void {
  (globalThis as unknown as { LanguageDetector: { availability?: () => Promise<string> } }).LanguageDetector.availability = () => Promise.resolve(availability);
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
    expect(await detectLanguage('oi gente')).toEqual({ language: 'pt', confidence: 1 });
  });

  it('scores a short phrase as pt against en only (other languages do not dilute it)', async () => {
    installFakeDetector([
      { detectedLanguage: 'gl', confidence: 0.6 },
      { detectedLanguage: 'pt', confidence: 0.3 },
      { detectedLanguage: 'en', confidence: 0.02 },
    ]);
    const result = await detectLanguage('achei bom');
    expect(result?.language).toBe('pt');
    expect(result?.confidence).toBeCloseTo(0.3 / 0.32);
  });

  it('does not trust a tiny pt share when the text is in a third language', async () => {
    installFakeDetector([
      { detectedLanguage: 'es', confidence: 0.95 },
      { detectedLanguage: 'pt', confidence: 0.03 },
      { detectedLanguage: 'en', confidence: 0.005 },
    ]);
    expect(await detectLanguage('hola amigos')).toBeNull();
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

describe('detectLanguage without downloading', () => {
  it('uses the heuristic when the detector cannot say it is available', async () => {
    installFakeDetector([{ detectedLanguage: 'pt', confidence: 0.9 }]);
    expect((await detectLanguage('good morning everyone', { allowDownload: false }))?.language).toBe('en');
    expect(fake.createCalls).toBe(0);
  });

  it('uses the heuristic while the detector model downloads in the background, then the native detector', async () => {
    installFakeDetector([{ detectedLanguage: 'pt', confidence: 0.9 }]);
    setDetectorAvailability('downloadable');
    expect((await detectLanguage('good morning everyone', { allowDownload: false }))?.language).toBe('en');
    expect(fake.createCalls).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await detectLanguage('good morning everyone', { allowDownload: false })).toEqual({ language: 'pt', confidence: 1 });
    expect(fake.createCalls).toBe(1);
  });

  it('starts the background detector download only once', async () => {
    installFakeDetector([{ detectedLanguage: 'pt', confidence: 0.9 }]);
    (globalThis as unknown as { LanguageDetector: { create: () => Promise<never> } }).LanguageDetector.create = () => {
      fake.createCalls += 1;
      return new Promise<never>(() => undefined);
    };
    setDetectorAvailability('downloadable');
    await detectLanguage('good morning', { allowDownload: false });
    await detectLanguage('good evening', { allowDownload: false });
    expect(fake.createCalls).toBe(1);
  });

  it('collapses stretched letters before detecting', async () => {
    installFakeDetector([{ detectedLanguage: 'pt', confidence: 0.9 }]);
    await detectLanguage('siiiim, booom demaaais');
    expect(fake.detectCalls).toEqual(['sim, bom demais']);
  });

  it('uses the native detector when its model is already available', async () => {
    installFakeDetector([{ detectedLanguage: 'pt', confidence: 0.9 }]);
    setDetectorAvailability('available');
    expect(await detectLanguage('good morning everyone', { allowDownload: false })).toEqual({ language: 'pt', confidence: 1 });
    expect(fake.createCalls).toBe(1);
  });

  it('reuses a detector that already exists', async () => {
    installFakeDetector([{ detectedLanguage: 'pt', confidence: 0.9 }]);
    await detectLanguage('oi gente');
    expect(await detectLanguage('good morning everyone', { allowDownload: false })).toEqual({ language: 'pt', confidence: 1 });
    expect(fake.createCalls).toBe(1);
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
