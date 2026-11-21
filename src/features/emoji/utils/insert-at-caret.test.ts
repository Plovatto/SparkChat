import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { insertAtCaret } from './insert-at-caret';

const GRIN = '\u{1F600}';
const WAVE = '\u{1F44B}';
const HEART = '\u{2764}\u{FE0F}';

describe('insertAtCaret', () => {
  it('inserts at the caret and moves the caret after the inserted emoji', () => {
    expect(insertAtCaret('oi tudo', GRIN, 2, 2)).toEqual({ value: `oi${GRIN} tudo`, caret: 2 + GRIN.length });
  });

  it('replaces the selected text', () => {
    expect(insertAtCaret('hello world', WAVE, 6, 11)).toEqual({ value: `hello ${WAVE}`, caret: 6 + WAVE.length });
  });

  it('appends when the caret position is unknown', () => {
    expect(insertAtCaret('abc', HEART, null, null)).toEqual({ value: `abc${HEART}`, caret: 5 });
    expect(insertAtCaret('abc', 'x', undefined, undefined)).toEqual({ value: 'abcx', caret: 4 });
  });

  it('clamps out of range and inverted selections', () => {
    expect(insertAtCaret('abc', 'x', 99, 120)).toEqual({ value: 'abcx', caret: 4 });
    expect(insertAtCaret('abc', 'x', -4, -1)).toEqual({ value: 'xabc', caret: 1 });
    expect(insertAtCaret('abcdef', 'x', 4, 1)).toEqual({ value: 'abcdxef', caret: 5 });
  });

  it('refuses insertions that would exceed the max length', () => {
    expect(insertAtCaret('abcd', GRIN, 4, 4, 5)).toBeNull();
    expect(insertAtCaret('abc', GRIN, 3, 3, 5)).toEqual({ value: `abc${GRIN}`, caret: 5 });
  });

  it('always keeps the text around the selection intact', () => {
    fc.assert(
      fc.property(fc.string(), fc.string({ minLength: 1 }), fc.nat(), fc.nat(), (value, insertion, a, b) => {
        const start = Math.min(a, value.length);
        const end = Math.max(start, Math.min(b, value.length));
        const result = insertAtCaret(value, insertion, start, end);
        expect(result).not.toBeNull();
        expect(result?.value).toBe(value.slice(0, start) + insertion + value.slice(end));
        expect(result?.value.slice(0, result.caret)).toBe(value.slice(0, start) + insertion);
      }),
    );
  });
});
