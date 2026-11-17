import { describe, expect, it } from 'vitest';
import { hasTranslatableText, splitSegments, translatableText, translatePreservingSegments } from './segments';

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
  it.each(['ok', '👍👍', 'https://x.dev', '@Ana', 'kkkkk', 'hahaha', 'lol', '  '])('not translatable: %s', (t) => {
    expect(hasTranslatableText(t)).toBe(false);
  });
  it('translatable with enough letters outside mentions', () => {
    expect(hasTranslatableText('@Ana good morning')).toBe(true);
  });
});
