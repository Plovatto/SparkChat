import { afterEach, describe, expect, it } from 'vitest';
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
