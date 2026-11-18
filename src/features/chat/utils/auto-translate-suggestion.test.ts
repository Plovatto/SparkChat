import { describe, expect, it } from 'vitest';
import { isSuggestionTriggered, shouldShowAutoTranslateBanner } from './auto-translate-suggestion';

describe('isSuggestionTriggered', () => {
  it('triggers after two manual translations in the conversation', () => {
    expect(isSuggestionTriggered({ manualCount: 1, assessments: [] })).toBe(false);
    expect(isSuggestionTriggered({ manualCount: 2, assessments: [] })).toBe(true);
  });

  it('triggers when at least three of the last received messages are confidently in the other language', () => {
    expect(isSuggestionTriggered({ manualCount: 0, assessments: ['other', 'unsure', 'other'] })).toBe(false);
    expect(isSuggestionTriggered({ manualCount: 0, assessments: ['other', 'unsure', 'other', 'other'] })).toBe(true);
  });

  it('only looks at the most recent received messages', () => {
    expect(isSuggestionTriggered({ manualCount: 0, assessments: ['other', 'other', 'other', 'target', 'target', 'target', 'unsure', 'target'] })).toBe(false);
    expect(isSuggestionTriggered({ manualCount: 0, assessments: ['target', 'target', 'other', 'unsure', 'other', 'target', 'other'] })).toBe(true);
  });
});

describe('shouldShowAutoTranslateBanner', () => {
  it('shows a triggered suggestion in on-demand mode', () => {
    expect(shouldShowAutoTranslateBanner({ mode: 'manual', dismissed: false, triggered: true })).toBe(true);
  });

  it('never shows when not triggered, dismissed, already automatic or translation is off', () => {
    expect(shouldShowAutoTranslateBanner({ mode: 'manual', dismissed: false, triggered: false })).toBe(false);
    expect(shouldShowAutoTranslateBanner({ mode: 'manual', dismissed: true, triggered: true })).toBe(false);
    expect(shouldShowAutoTranslateBanner({ mode: 'auto', dismissed: false, triggered: true })).toBe(false);
    expect(shouldShowAutoTranslateBanner({ mode: 'off', dismissed: false, triggered: true })).toBe(false);
  });
});
