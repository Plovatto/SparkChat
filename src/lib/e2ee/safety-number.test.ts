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
});
