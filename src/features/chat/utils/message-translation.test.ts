import { describe, expect, it } from 'vitest';
import type { IncomingResult } from '@lib/translation/incoming';
import { resolveBadgeState, resolveDisplayText, selectCurrentResult, shouldRequestTranslation, shouldRetryOnInvalidation } from './message-translation';

const translated: IncomingResult = { status: 'translated', text: 'bom dia a todos', sourceLanguage: 'en' };
const preparing: IncomingResult = { status: 'preparing', sourceLanguage: 'en' };
const none: IncomingResult = { status: 'none' };

describe('shouldRequestTranslation', () => {
  const base = { enabled: true, isVisible: true, text: 'good morning everyone', current: undefined };

  it('requests a visible, enabled message with no known result', () => {
    expect(shouldRequestTranslation(base)).toBe(true);
  });

  it('does not request when the message is off screen', () => {
    expect(shouldRequestTranslation({ ...base, isVisible: false })).toBe(false);
  });

  it('does not request when auto-translate is disabled', () => {
    expect(shouldRequestTranslation({ ...base, enabled: false })).toBe(false);
  });

  it('does not request empty or whitespace-only text', () => {
    expect(shouldRequestTranslation({ ...base, text: '' })).toBe(false);
    expect(shouldRequestTranslation({ ...base, text: '   ' })).toBe(false);
    expect(shouldRequestTranslation({ ...base, text: null })).toBe(false);
    expect(shouldRequestTranslation({ ...base, text: undefined })).toBe(false);
  });

  it('does not request again once the result is final', () => {
    expect(shouldRequestTranslation({ ...base, current: translated })).toBe(false);
    expect(shouldRequestTranslation({ ...base, current: none })).toBe(false);
  });

  it('keeps requesting while the model is still preparing', () => {
    expect(shouldRequestTranslation({ ...base, current: preparing })).toBe(true);
  });
});

describe('selectCurrentResult', () => {
  it('returns undefined when translation is inactive', () => {
    expect(selectCurrentResult({ active: false, key: 'k', fetched: { key: 'k', result: translated }, cached: translated })).toBeUndefined();
  });

  it('prefers a fetched result for the same request key', () => {
    expect(selectCurrentResult({ active: true, key: 'k', fetched: { key: 'k', result: translated }, cached: undefined })).toBe(translated);
  });

  it('ignores a fetched result for a superseded request key and falls back to the cache', () => {
    expect(selectCurrentResult({ active: true, key: 'k2', fetched: { key: 'k1', result: translated }, cached: none })).toBe(none);
    expect(selectCurrentResult({ active: true, key: 'k2', fetched: { key: 'k1', result: translated }, cached: undefined })).toBeUndefined();
  });

  it('prefers a cached translation over a fetched none for the same request', () => {
    const cached = { status: 'translated', text: 'oi', sourceLanguage: 'en' } as const;
    expect(selectCurrentResult({ active: true, key: 'k', fetched: { key: 'k', result: { status: 'none' } }, cached })).toBe(cached);
  });

  it('uses the cache when nothing was fetched yet', () => {
    expect(selectCurrentResult({ active: true, key: 'k', fetched: null, cached: translated })).toBe(translated);
  });
});

describe('resolveDisplayText', () => {
  it('shows the translation when translated and not toggled', () => {
    expect(resolveDisplayText({ original: 'good morning everyone', result: translated, showingOriginal: false })).toBe('bom dia a todos');
  });

  it('shows the original when the person toggled to the original', () => {
    expect(resolveDisplayText({ original: 'good morning everyone', result: translated, showingOriginal: true })).toBe('good morning everyone');
  });

  it('shows the original while preparing or when there is nothing to translate', () => {
    expect(resolveDisplayText({ original: 'good morning everyone', result: preparing, showingOriginal: false })).toBe('good morning everyone');
    expect(resolveDisplayText({ original: 'ok', result: none, showingOriginal: false })).toBe('ok');
  });
});

describe('resolveBadgeState', () => {
  it('maps a translation to translated or original depending on the toggle', () => {
    expect(resolveBadgeState(translated, false)).toBe('translated');
    expect(resolveBadgeState(translated, true)).toBe('original');
  });

  it('shows translating while preparing, regardless of the toggle', () => {
    expect(resolveBadgeState(preparing, false)).toBe('preparing');
    expect(resolveBadgeState(preparing, true)).toBe('preparing');
  });

  it('shows nothing for none', () => {
    expect(resolveBadgeState(none, false)).toBe('none');
  });
});

describe('shouldRetryOnInvalidation', () => {
  it('retries while preparing', () => {
    expect(shouldRetryOnInvalidation({ current: { status: 'preparing', sourceLanguage: 'en' }, cached: undefined })).toBe(true);
  });

  it('retries an uncached none (timeout or transient failure)', () => {
    expect(shouldRetryOnInvalidation({ current: { status: 'none' }, cached: undefined })).toBe(true);
  });

  it('does not retry a definitive none from the cache', () => {
    expect(shouldRetryOnInvalidation({ current: { status: 'none' }, cached: { status: 'none' } })).toBe(false);
  });

  it('does not retry a translation or a message with no result yet', () => {
    expect(shouldRetryOnInvalidation({ current: { status: 'translated', text: 'oi', sourceLanguage: 'en' }, cached: undefined })).toBe(false);
    expect(shouldRetryOnInvalidation({ current: undefined, cached: undefined })).toBe(false);
  });
});
