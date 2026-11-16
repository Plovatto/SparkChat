import { runInNewContext } from 'node:vm';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { languageFromPath, pathForLanguage, resolvePreferredLanguage } from './language';

describe('resolvePreferredLanguage', () => {
  it('prefers the stored choice over the system languages', () => {
    expect(resolvePreferredLanguage('pt', ['en-US'])).toBe('pt');
    expect(resolvePreferredLanguage('en', ['pt-BR'])).toBe('en');
  });

  it('ignores stored values that are not a supported language', () => {
    expect(resolvePreferredLanguage('es', ['pt-BR'])).toBe('pt');
    expect(resolvePreferredLanguage('', ['pt-BR'])).toBe('pt');
  });

  it('takes the first supported system language in order', () => {
    expect(resolvePreferredLanguage(null, ['pt-PT'])).toBe('pt');
    expect(resolvePreferredLanguage(null, ['fr-FR', 'en-GB', 'pt-BR'])).toBe('en');
    expect(resolvePreferredLanguage(null, ['de', 'PT-br'])).toBe('pt');
  });

  it('falls back to English when no system language is supported', () => {
    expect(resolvePreferredLanguage(null, ['fr'])).toBe('en');
    expect(resolvePreferredLanguage(null, [])).toBe('en');
  });

  it('always returns a supported language', () => {
    fc.assert(
      fc.property(fc.option(fc.string(), { nil: null }), fc.array(fc.string()), (stored, system) => {
        expect(['pt', 'en']).toContain(resolvePreferredLanguage(stored, system));
      }),
    );
  });

  it('keeps working when serialized into an inline script', () => {
    const revived = runInNewContext(`(${resolvePreferredLanguage.toString()})`) as typeof resolvePreferredLanguage;
    expect(revived(null, ['pt-BR'])).toBe('pt');
    expect(revived(null, ['ja'])).toBe('en');
  });
});

describe('languageFromPath', () => {
  it('detects the English prefix', () => {
    expect(languageFromPath('/en')).toBe('en');
    expect(languageFromPath('/en/')).toBe('en');
    expect(languageFromPath('/en/index.html')).toBe('en');
  });

  it('treats everything else as Portuguese', () => {
    expect(languageFromPath('/')).toBe('pt');
    expect(languageFromPath('/english')).toBe('pt');
    expect(languageFromPath('/app/')).toBe('pt');
  });

  it('round-trips with pathForLanguage', () => {
    expect(languageFromPath(pathForLanguage('pt'))).toBe('pt');
    expect(languageFromPath(pathForLanguage('en'))).toBe('en');
  });
});
