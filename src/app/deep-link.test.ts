import { describe, expect, it } from 'vitest';
import { hasDeepLinkParams, MAX_DEEP_LINK_VALUE_LENGTH, readDeepLinkIntents } from './deep-link';

describe('readDeepLinkIntents', () => {
  it('returns nothing without deep link params', () => {
    expect(readDeepLinkIntents('', 'Ana')).toEqual([]);
    expect(readDeepLinkIntents('?foo=bar', 'Ana')).toEqual([]);
  });

  it('ignores legacy group code links, which no longer grant access', () => {
    expect(readDeepLinkIntents('?join=ab12cd34', 'Ana')).toEqual([]);
  });

  it('reads a nickname as a chat intent', () => {
    expect(readDeepLinkIntents('?startChat=Bob', 'Ana')).toEqual([{ kind: 'chat', nickname: 'Bob' }]);
    expect(readDeepLinkIntents('?startChat=Bob&join=xyz', 'Ana')).toEqual([{ kind: 'chat', nickname: 'Bob' }]);
  });

  it('ignores a chat link pointing to the current user', () => {
    expect(readDeepLinkIntents('?startChat=ana', 'Ana')).toEqual([]);
  });

  it('ignores blank and oversized values', () => {
    const huge = 'a'.repeat(MAX_DEEP_LINK_VALUE_LENGTH + 1);
    expect(readDeepLinkIntents(`?startChat=${huge}`, 'Ana')).toEqual([]);
    expect(readDeepLinkIntents('?startChat=%20%20', 'Ana')).toEqual([]);
  });
});

describe('hasDeepLinkParams', () => {
  it('detects any deep link param so legacy links are still stripped', () => {
    expect(hasDeepLinkParams('?startChat=Ana')).toBe(true);
    expect(hasDeepLinkParams('?join=')).toBe(true);
    expect(hasDeepLinkParams('?foo=1')).toBe(false);
  });
});
