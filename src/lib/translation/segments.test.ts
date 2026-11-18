import { describe, expect, it, vi } from 'vitest';
import { hasTranslatableText, MIN_TRANSLATABLE_LETTERS, splitSegments, translatableText, translatePreservingSegments } from './segments';

describe('segments', () => {
  it('splits mentions and urls into protected segments', () => {
    expect(splitSegments('hey @Ana look https://x.dev/a now')).toEqual([
      { kind: 'text', value: 'hey ' },
      { kind: 'protected', value: '@Ana' },
      { kind: 'text', value: ' look ' },
      { kind: 'protected', value: 'https://x.dev/a' },
      { kind: 'text', value: ' now' },
    ]);
  });
  it('translatableText keeps only text segments', () => {
    expect(translatableText('@Ana good https://x.dev')).toBe(' good ');
  });
  it('keeps mentions and urls untouched', async () => {
    expect(await translatePreservingSegments('hey @Ana look https://x.dev/a now', (c) => Promise.resolve(c.toUpperCase())))
      .toBe('HEY @Ana LOOK https://x.dev/a NOW');
  });
  it('preserves surrounding whitespace', async () => {
    expect(await translatePreservingSegments('@Bob  hi there', (c) => Promise.resolve(`[${c}]`))).toBe('@Bob  [hi there]');
  });
  it('translates paragraph by paragraph and keeps the exact line breaks', async () => {
    const translate = vi.fn((chunk: string) => Promise.resolve(`[${chunk}]`));
    expect(await translatePreservingSegments('hello there\n\nsee @Ana\r\n  bye now  ', translate)).toBe('[hello there]\n\n[see] @Ana\r\n  [bye now]  ');
    expect(translate.mock.calls.map(([chunk]) => chunk)).toEqual(['hello there', 'see', 'bye now']);
  });
  it('uses a minimum of two letters', () => {
    expect(MIN_TRANSLATABLE_LETTERS).toBe(2);
  });
  it.each(['👍👍', 'https://x.dev', '@Ana', 'kk', 'kkkkk', 'hahaha', 'rsrs', 'lol', 'x', '  ', '😂 kkk'])('not translatable: %s', (t) => {
    expect(hasTranslatableText(t)).toBe(false);
  });
  it.each(['oi', 'hi', 'ok', 'no', 'vlw', 'blz', 'thx', 'sim', 'não', 'n', 's'])('translatable short chat message: %s', (t) => {
    expect(hasTranslatableText(t)).toBe(true);
  });
  it('translatable with enough letters outside mentions', () => {
    expect(hasTranslatableText('@Ana good morning')).toBe(true);
  });
});
