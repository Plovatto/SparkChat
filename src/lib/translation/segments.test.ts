import { describe, expect, it, vi } from 'vitest';
import { collapseStretchedLetters, hasTranslatableText, isUppercaseWord, MAX_ANALYSED_TEXT_LENGTH, MAX_ANALYSED_TOKEN_LENGTH, MIN_TRANSLATABLE_LETTERS, splitSegments, translatableText, translatePreservingSegments } from './segments';

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

describe('stretched letters and fillers', () => {
  it.each(['Baaaaaa', 'Hmmmm', 'Aaaaaaa', 'Ahhhh', 'Oooooh'])('treats "%s" as nothing to translate', (text) => {
    expect(hasTranslatableText(text)).toBe(false);
  });

  it.each(['Siiiim', 'Nãooooo', 'Booom dia', 'oi'])('still translates "%s"', (text) => {
    expect(hasTranslatableText(text)).toBe(true);
  });

  it('collapses stretched letters to one', () => {
    expect(collapseStretchedLetters('Siiiim, booom demaaais!!!')).toBe('Sim, bom demais!!!');
    expect(collapseStretchedLetters('cool week')).toBe('cool week');
  });
});

describe('collapseStretchedLetters leaves non-words alone', () => {
  it.each(['www.google.com', 'Henry VIII', 'AAA batteries', 'aaa@x.com', 'kkkkk', 'HMMMM'])('keeps "%s"', (text) => {
    expect(collapseStretchedLetters(text)).toBe(text);
  });
});

describe('collapseStretchedLetters with trailing punctuation', () => {
  it('collapses words followed by punctuation', () => {
    expect(collapseStretchedLetters('sooo... simmm.')).toBe('so... sim.');
  });
});

describe('isUppercaseWord', () => {
  it.each([['HMMMM', true], ['AAA', true], ['VIII', true], ['A1B', true], ['Ab', false], ['A', false], ['A1', false], ['ÉÇ', true], ['', false]])(
    '"%s" -> %s',
    (word, expected) => {
      expect(isUppercaseWord(word)).toBe(expected);
    },
  );
});

describe('peer text cannot trigger catastrophic backtracking', () => {
  const BUDGET_MS = 250;

  function elapsed(run: () => unknown): number {
    const start = performance.now();
    run();
    return performance.now() - start;
  }

  it('checks a huge run of capitals ending in a lowercase letter in linear time', () => {
    const word = `${'A'.repeat(200_000)}a`;
    expect(elapsed(() => isUppercaseWord(word))).toBeLessThan(BUDGET_MS);
    expect(isUppercaseWord(word)).toBe(false);
  });

  it('collapses a long uppercase token without hanging', () => {
    const text = `${'A'.repeat(MAX_ANALYSED_TOKEN_LENGTH - 1)}a ${'A'.repeat(1_500)}a`;
    expect(elapsed(() => collapseStretchedLetters(text))).toBeLessThan(BUDGET_MS);
  });

  it('strips a long run of trailing punctuation candidates in linear time', () => {
    const text = `${'.'.repeat(60_000)}a ${'!'.repeat(60_000)}`;
    expect(elapsed(() => collapseStretchedLetters(text))).toBeLessThan(BUDGET_MS);
    expect(elapsed(() => hasTranslatableText(text))).toBeLessThan(BUDGET_MS);
  });

  it('keeps surrounding whitespace for a segment with a huge inner gap in linear time', async () => {
    const text = `a${' '.repeat(60_000)}b`;
    const translate = vi.fn((chunk: string) => Promise.resolve(chunk));
    const start = performance.now();
    expect(await translatePreservingSegments(` ${text}  `, translate)).toBe(` ${text}  `);
    expect(performance.now() - start).toBeLessThan(BUDGET_MS);
    expect(translate).toHaveBeenCalledWith(text);
  });

  it('caps the text analysed for translatability', () => {
    expect(hasTranslatableText(`${'😂 '.repeat(MAX_ANALYSED_TEXT_LENGTH)}good morning`)).toBe(false);
  });
});
