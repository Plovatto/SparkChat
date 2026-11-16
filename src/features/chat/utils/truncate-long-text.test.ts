import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { truncateLongText } from './truncate-long-text';

const words = (count: number) => Array.from({ length: count }, (_, index) => `palavra${index}`).join(' ');

describe('truncateLongText', () => {
  it('keeps ordinary messages whole', () => {
    expect(truncateLongText('Oi, tudo bem?')).toBeNull();
    expect(truncateLongText('a'.repeat(400))).toBeNull();
  });

  it('does not hide just a few words past the limit', () => {
    expect(truncateLongText(`${'a '.repeat(350)}fim`, 700)).toBeNull();
  });

  it('cuts long messages at a word boundary', () => {
    const text = words(200);
    const preview = truncateLongText(text);
    expect(preview).not.toBeNull();
    expect(preview!.length).toBeLessThanOrEqual(700);
    expect(text.startsWith(preview!)).toBe(true);
    expect(text.charAt(preview!.length)).toBe(' ');
  });

  it('cuts by line count when a message has many short lines', () => {
    const text = Array.from({ length: 30 }, (_, index) => `linha ${index}`).join('\n');
    const preview = truncateLongText(text, 700, 14);
    expect(preview?.split('\n')).toHaveLength(14);
  });

  it('never splits an emoji in half', () => {
    const text = '😀'.repeat(500);
    const preview = truncateLongText(text, 701);
    expect(preview).not.toBeNull();
    expect(preview!.length % 2).toBe(0);
  });

  it('never splits a flag or a family emoji', () => {
    const flags = truncateLongText('🇧🇷'.repeat(400), 701);
    expect(flags).not.toBeNull();
    expect(flags!.length % 4).toBe(0);
    const family = '👨‍👩‍👧'.repeat(200);
    const preview = truncateLongText(family, 701);
    expect(family.startsWith(preview!)).toBe(true);
    expect(preview!.length % '👨‍👩‍👧'.length).toBe(0);
  });

  it('always returns a prefix of the original text', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 2000 }), (text) => {
        const preview = truncateLongText(text);
        if (preview !== null) {
          expect(text.startsWith(preview)).toBe(true);
          expect(preview.length).toBeLessThan(text.length);
        }
      }),
    );
  });
});
