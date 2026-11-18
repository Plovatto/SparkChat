import { describe, expect, it } from 'vitest';
import { hasDeepLinkParams, MAX_DEEP_LINK_VALUE_LENGTH, readDeepLinkIntents } from './deep-link';

describe('readDeepLinkIntents', () => {
  it('returns nothing without deep link params', () => {
    expect(readDeepLinkIntents('', 'Ana')).toEqual([]);
    expect(readDeepLinkIntents('?foo=bar', 'Ana')).toEqual([]);
  });

  it('reads a group code as an upper-cased join intent', () => {
    expect(readDeepLinkIntents('?join=ab12cd34', 'Ana')).toEqual([{ kind: 'join', code: 'AB12CD34' }]);
  });

  it('reads a nickname as a chat intent', () => {
    expect(readDeepLinkIntents('?startChat=Bob', 'Ana')).toEqual([{ kind: 'chat', nickname: 'Bob' }]);
  });

  it('ignores a chat link pointing to the current user', () => {
    expect(readDeepLinkIntents('?startChat=ana', 'Ana')).toEqual([]);
  });

  it('keeps both intents so each one is confirmed separately', () => {
    expect(readDeepLinkIntents('?startChat=Bob&join=xyz', 'Ana')).toEqual([
      { kind: 'chat', nickname: 'Bob' },
      { kind: 'join', code: 'XYZ' },
    ]);
  });

  it('ignores blank and oversized values', () => {
    const huge = 'a'.repeat(MAX_DEEP_LINK_VALUE_LENGTH + 1);
    expect(readDeepLinkIntents(`?join=%20%20&startChat=${huge}`, 'Ana')).toEqual([]);
  });
});

describe('hasDeepLinkParams', () => {
  it('detects any deep link param, even ones that produce no intent', () => {
    expect(hasDeepLinkParams('?startChat=Ana')).toBe(true);
    expect(hasDeepLinkParams('?join=')).toBe(true);
    expect(hasDeepLinkParams('?foo=1')).toBe(false);
  });
});
