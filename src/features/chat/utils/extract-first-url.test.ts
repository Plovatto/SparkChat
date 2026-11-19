import { describe, expect, it } from 'vitest';
import { extractFirstUrl, removeFirstUrl } from './extract-first-url';

describe('extractFirstUrl', () => {
  it('drops trailing punctuation from the url', () => {
    expect(extractFirstUrl('olha isso (https://site.test/a?b=1).')).toBe('https://site.test/a?b=1');
    expect(extractFirstUrl('veja https://site.test!!')).toBe('https://site.test');
  });

  it('returns null without a url', () => {
    expect(extractFirstUrl('sem link aqui')).toBeNull();
  });

  it('stays fast on long runs of punctuation', () => {
    const text = `https://site.test/${')'.repeat(50000)}x${'.'.repeat(50000)}`;
    const startedAt = performance.now();
    extractFirstUrl(text);
    removeFirstUrl(text);
    expect(performance.now() - startedAt).toBeLessThan(200);
  });
});
