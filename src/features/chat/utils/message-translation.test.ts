import { describe, expect, it } from 'vitest';
import type { IncomingResult } from '@lib/translation/incoming';
import {
  shouldAnnounceTranslation,
  resolveDisplayText,
  resolveRevealAction,
  resolveTranslationControl,
  resolveVisibleResult,
  selectCurrentResult,
  shouldRequestTranslation,
  shouldEndExplicitRequest,
  shouldRetryOnInvalidation,
} from './message-translation';

const translated: IncomingResult = { status: 'translated', text: 'bom dia a todos', sourceLanguage: 'en' };
const preparing: IncomingResult = { status: 'preparing', sourceLanguage: 'en' };
const none: IncomingResult = { status: 'none' };

describe('shouldRequestTranslation', () => {
  const base = { mode: 'manual', requested: false, isVisible: true, text: 'good morning everyone', current: undefined, assessment: 'other' } as const;

  it('never requests on its own in on-demand mode', () => {
    expect(shouldRequestTranslation(base)).toBe(false);
  });

  it('requests once the person asked for it', () => {
    expect(shouldRequestTranslation({ ...base, requested: true })).toBe(true);
    expect(shouldRequestTranslation({ ...base, requested: true, assessment: null })).toBe(true);
  });

  it('requests a visible message in automatic mode only when it is confidently in another language', () => {
    expect(shouldRequestTranslation({ ...base, mode: 'auto' })).toBe(true);
    expect(shouldRequestTranslation({ ...base, mode: 'auto', assessment: 'unsure' })).toBe(false);
    expect(shouldRequestTranslation({ ...base, mode: 'auto', assessment: 'target' })).toBe(false);
    expect(shouldRequestTranslation({ ...base, mode: 'auto', assessment: 'skip' })).toBe(false);
    expect(shouldRequestTranslation({ ...base, mode: 'auto', assessment: null })).toBe(false);
    expect(shouldRequestTranslation({ ...base, mode: 'auto', isVisible: false })).toBe(false);
  });

  it('does not request when translation is off', () => {
    expect(shouldRequestTranslation({ ...base, mode: 'off', requested: true })).toBe(false);
  });

  it('does not request empty or whitespace-only text', () => {
    for (const text of ['', '   ', null, undefined]) {
      expect(shouldRequestTranslation({ ...base, requested: true, text })).toBe(false);
    }
  });

  it('does not request again once the result is final', () => {
    expect(shouldRequestTranslation({ ...base, requested: true, current: translated })).toBe(false);
    expect(shouldRequestTranslation({ ...base, requested: true, current: none })).toBe(false);
  });

  it('keeps requesting while the model is still preparing', () => {
    expect(shouldRequestTranslation({ ...base, requested: true, current: preparing })).toBe(true);
    expect(shouldRequestTranslation({ ...base, mode: 'auto', current: preparing })).toBe(true);
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

describe('resolveTranslationControl', () => {
  const base = { current: undefined, cached: undefined, requested: false, autoPending: false, assessment: 'other', showingOriginal: false } as const;

  it('offers the link only when the message is confidently in another language', () => {
    expect(resolveTranslationControl(base)).toBe('offer');
    expect(resolveTranslationControl({ ...base, assessment: 'unsure' })).toBe('none');
  });

  it('offers nothing when the message is in the interface language, untranslatable or not assessed yet', () => {
    expect(resolveTranslationControl({ ...base, assessment: 'target' })).toBe('none');
    expect(resolveTranslationControl({ ...base, assessment: 'skip' })).toBe('none');
    expect(resolveTranslationControl({ ...base, assessment: null })).toBe('none');
  });

  it('shows translating right after the click and while the model is preparing', () => {
    expect(resolveTranslationControl({ ...base, requested: true })).toBe('preparing');
    expect(resolveTranslationControl({ ...base, current: preparing })).toBe('preparing');
  });

  it('maps a translation to translated or original depending on the toggle', () => {
    expect(resolveTranslationControl({ ...base, current: translated })).toBe('translated');
    expect(resolveTranslationControl({ ...base, current: translated, showingOriginal: true })).toBe('original');
  });

  it('hides the link for good when the message turned out to be in the interface language', () => {
    expect(resolveTranslationControl({ ...base, requested: true, current: none, cached: none })).toBe('none');
  });

  it('brings the link back after a failed translation', () => {
    expect(resolveTranslationControl({ ...base, requested: true, current: none, cached: undefined })).toBe('offer');
  });

  it('stays quiet while an automatic translation is on its way', () => {
    expect(resolveTranslationControl({ ...base, autoPending: true })).toBe('none');
    expect(resolveTranslationControl({ ...base, autoPending: true, current: none })).toBe('offer');
  });
});

describe('resolveVisibleResult', () => {
  const explicitTranslation: IncomingResult = { status: 'translated', text: 'bom dia a todos', sourceLanguage: 'en', explicit: true };

  it('shows every translation while automatic translation is on', () => {
    expect(resolveVisibleResult({ mode: 'auto', current: translated })).toBe(translated);
    expect(resolveVisibleResult({ mode: 'auto', current: explicitTranslation })).toBe(explicitTranslation);
  });

  it('hides automatic translations once automatic translation is off, so the link comes back', () => {
    expect(resolveVisibleResult({ mode: 'manual', current: translated })).toBeUndefined();
    expect(resolveVisibleResult({ mode: 'off', current: translated })).toBeUndefined();
  });

  it('keeps translations the person asked for', () => {
    expect(resolveVisibleResult({ mode: 'manual', current: explicitTranslation })).toBe(explicitTranslation);
  });

  it('leaves other results untouched', () => {
    expect(resolveVisibleResult({ mode: 'manual', current: none })).toBe(none);
    expect(resolveVisibleResult({ mode: 'manual', current: preparing })).toBe(preparing);
    expect(resolveVisibleResult({ mode: 'manual', current: undefined })).toBeUndefined();
  });

  it('lets a click on a hidden automatic translation ask for it again', () => {
    const visible = resolveVisibleResult({ mode: 'manual', current: translated });
    expect(shouldRequestTranslation({ mode: 'manual', requested: true, isVisible: true, text: 'good morning', current: visible, assessment: 'other' })).toBe(true);
    expect(resolveTranslationControl({ current: visible, cached: translated, requested: false, autoPending: false, assessment: 'other', showingOriginal: false })).toBe('offer');
  });
});

describe('resolveRevealAction', () => {
  const base = { becameVisible: true, requested: false, needsRequest: false, retryOnInvalidation: false };

  it('does nothing unless the message just came back on screen', () => {
    expect(resolveRevealAction({ ...base, becameVisible: false, requested: true, needsRequest: true })).toBe('none');
  });

  it('asks again for a clicked message that was still waiting while off screen', () => {
    expect(resolveRevealAction({ ...base, requested: true, needsRequest: true })).toBe('refetch');
  });

  it('leaves automatic requests to the normal request flow', () => {
    expect(resolveRevealAction({ ...base, needsRequest: true, retryOnInvalidation: true })).toBe('none');
  });

  it('forgets a retryable result so it is asked again', () => {
    expect(resolveRevealAction({ ...base, retryOnInvalidation: true })).toBe('clear');
    expect(resolveRevealAction(base)).toBe('none');
  });
});

describe('shouldEndExplicitRequest', () => {
  it('ends the click once nothing came back, so the link stays put', () => {
    expect(shouldEndExplicitRequest(none)).toBe(true);
  });

  it('keeps the click while preparing or once translated', () => {
    expect(shouldEndExplicitRequest(preparing)).toBe(false);
    expect(shouldEndExplicitRequest(translated)).toBe(false);
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

describe('shouldAnnounceTranslation', () => {
  it('announces a translation the user asked for', () => {
    expect(shouldAnnounceTranslation({ control: 'translated', result: { status: 'translated', text: 'oi', sourceLanguage: 'en', explicit: true } })).toBe(true);
  });

  it('stays silent for automatic translations, progress and other states', () => {
    expect(shouldAnnounceTranslation({ control: 'translated', result: { status: 'translated', text: 'oi', sourceLanguage: 'en' } })).toBe(false);
    expect(shouldAnnounceTranslation({ control: 'preparing', result: { status: 'preparing', sourceLanguage: 'en' } })).toBe(false);
    expect(shouldAnnounceTranslation({ control: 'original', result: { status: 'translated', text: 'oi', sourceLanguage: 'en', explicit: true } })).toBe(false);
    expect(shouldAnnounceTranslation({ control: 'offer', result: { status: 'none' } })).toBe(false);
  });
});
