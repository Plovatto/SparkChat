import { describe, expect, it } from 'vitest';
import { parseAutoTranslatePreference } from './useAutoTranslatePreference';

describe('parseAutoTranslatePreference', () => {
  it('defaults to enabled when nothing is stored', () => {
    expect(parseAutoTranslatePreference(null)).toBe(true);
  });

  it('reads stored values', () => {
    expect(parseAutoTranslatePreference('true')).toBe(true);
    expect(parseAutoTranslatePreference('false')).toBe(false);
  });

  it('treats unknown values as enabled', () => {
    expect(parseAutoTranslatePreference('garbage')).toBe(true);
  });
});
