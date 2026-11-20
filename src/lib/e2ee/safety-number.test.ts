import { describe, expect, it } from 'vitest';
import { computeSafetyNumber } from './safety-number';

const alice = { userId: 'alice-id', publicKey: 'alice-public-key' };
const bob = { userId: 'bob-id', publicKey: 'bob-public-key' };

describe('computeSafetyNumber', () => {
  it('matches the fixed known-answer vector', async () => {
    expect((await computeSafetyNumber(alice, bob)).digits).toBe('665535403539316587285870533195614534870175141770266264007173');
  });

  it('produces 60 digits in 12 groups of 5', async () => {
    const result = await computeSafetyNumber(alice, bob);

    expect(result.digits).toMatch(/^\d{60}$/);
    expect(result.groups).toHaveLength(12);
    expect(result.groups.every((group) => /^\d{5}$/.test(group))).toBe(true);
    expect(result.qrPayload).toBe(`sparkchat-verify:1:${result.digits}`);
  });

  it('is the same for both sides of the conversation', async () => {
    expect((await computeSafetyNumber(alice, bob)).digits).toBe((await computeSafetyNumber(bob, alice)).digits);
  });

  it('changes when either key or either id changes', async () => {
    const base = (await computeSafetyNumber(alice, bob)).digits;

    expect((await computeSafetyNumber(alice, { ...bob, publicKey: 'other' })).digits).not.toBe(base);
    expect((await computeSafetyNumber({ ...alice, publicKey: 'other' }, bob)).digits).not.toBe(base);
    expect((await computeSafetyNumber(alice, { ...bob, userId: 'other-id' })).digits).not.toBe(base);
  });

  it('does not let field boundaries be shifted between ids and keys', async () => {
    const one = await computeSafetyNumber({ userId: 'a', publicKey: 'bc' }, { userId: 'd', publicKey: 'e' });
    const two = await computeSafetyNumber({ userId: 'ab', publicKey: 'c' }, { userId: 'd', publicKey: 'e' });

    expect(one.digits).not.toBe(two.digits);
  });

  it('uses version 1 when a signing key is missing and keeps existing numbers', async () => {
    const result = await computeSafetyNumber({ ...alice, signingPublicKey: 'a-sign' }, bob);

    expect(result.version).toBe(1);
    expect(result.digits).toBe('665535403539316587285870533195614534870175141770266264007173');
  });

  it('covers both signing keys in version 2 and changes when either changes', async () => {
    const a = { ...alice, signingPublicKey: 'a-sign' };
    const b = { ...bob, signingPublicKey: 'b-sign' };
    const base = await computeSafetyNumber(a, b);

    expect(base.version).toBe(2);
    expect(base.qrPayload).toBe(`sparkchat-verify:2:${base.digits}`);
    expect(base.digits).not.toBe('665535403539316587285870533195614534870175141770266264007173');
    expect((await computeSafetyNumber(b, a)).digits).toBe(base.digits);
    expect((await computeSafetyNumber(a, { ...b, signingPublicKey: 'forged' })).digits).not.toBe(base.digits);
    expect((await computeSafetyNumber({ ...a, signingPublicKey: 'forged' }, b)).digits).not.toBe(base.digits);
  });
});
