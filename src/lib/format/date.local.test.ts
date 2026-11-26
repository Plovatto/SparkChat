import { beforeEach, describe, expect, it, vi } from 'vitest';

const language = vi.hoisted(() => ({ current: 'pt' }));

vi.mock('@lib/i18n/app-i18n', () => ({
  currentLanguage: () => language.current,
  translate: (key: string) => key,
}));

const { formatLocalDateTime } = await import('./date');

describe('formatLocalDateTime', () => {
  beforeEach(() => {
    language.current = 'pt';
  });

  it('formats in Portuguese', () => {
    expect(formatLocalDateTime('2026-11-27T09:00')).toBe('sex, 27/11 às 09:00');
  });

  it('formats in English', () => {
    language.current = 'en';
    expect(formatLocalDateTime('2026-11-27T09:00')).toBe('Fri, Nov 27 at 9:00 AM');
  });

  it('returns the raw value when it is not a date', () => {
    expect(formatLocalDateTime('whenever')).toBe('whenever');
  });
});
