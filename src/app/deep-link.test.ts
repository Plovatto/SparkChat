import { describe, expect, it } from 'vitest';
import { hasDeepLinkParams, isDeepLinkError, MAX_DEEP_LINK_VALUE_LENGTH, readDeepLinkIntents, withInviteIntent, withoutFirstIntent, type DeepLinkIntent } from './deep-link';

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

describe('invite intent secrets', () => {
  const invite = (fill: number) => ({ kind: 'invite' as const, roomId: 'room', secret: new Uint8Array(16).fill(fill) });

  it('zeroes the secret of an invite replaced by a newer link', () => {
    const older = invite(1);
    const newer = invite(2);
    const chat = { kind: 'chat' as const, nickname: 'Bob' };

    expect(withInviteIntent([chat, older], newer)).toEqual([chat, newer]);
    expect(older.secret.every((byte) => byte === 0)).toBe(true);
    expect(newer.secret.every((byte) => byte === 2)).toBe(true);
  });

  it('keeps the secret when the same invite is applied again', () => {
    const current = invite(3);
    expect(withInviteIntent([current], current)).toEqual([current]);
    expect(current.secret.every((byte) => byte === 3)).toBe(true);
  });

  it('zeroes the secret of a dismissed invite', () => {
    const dismissed = invite(4);
    const next = invite(5);
    expect(withoutFirstIntent([dismissed, next])).toEqual([next]);
    expect(dismissed.secret.every((byte) => byte === 0)).toBe(true);
    expect(next.secret.every((byte) => byte === 5)).toBe(true);
  });
});

describe('isDeepLinkError', () => {
  const invite: DeepLinkIntent = { kind: 'invite', roomId: 'g1', secret: new Uint8Array(32) };
  const chat: DeepLinkIntent = { kind: 'chat', nickname: 'ana' };

  it('shows untagged errors for any intent', () => {
    expect(isDeepLinkError({ code: 'room.notFound' }, chat)).toBe(true);
    expect(isDeepLinkError({ code: 'room.notFound' }, invite)).toBe(true);
  });

  it('shows the invite join error tagged with its event', () => {
    expect(isDeepLinkError({ code: 'room.removedFromGroup', event: 'room:join-by-invite' }, invite)).toBe(true);
  });

  it('ignores errors of other events and of pending messages', () => {
    expect(isDeepLinkError({ code: 'room.notFound', event: 'room:rename' }, invite)).toBe(false);
    expect(isDeepLinkError({ code: 'room.removedFromGroup', event: 'room:join-by-invite' }, chat)).toBe(false);
    expect(isDeepLinkError({ code: 'rateLimit.messages', clientTempId: 't1' }, invite)).toBe(false);
  });
});
