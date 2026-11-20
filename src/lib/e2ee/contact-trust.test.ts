import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContactPin } from './key-store';
import {
  acceptContactKeyChange,
  getContactTrust,
  isKeyUsable,
  observeContactKey,
  resetContactTrustState,
  setContactVerified,
  subscribeContactTrust,
} from './contact-trust';
import { generateIdentity } from './identity';
import { buildSigningProof } from './signing';

const store = vi.hoisted(() => new Map<string, unknown>());

vi.mock('./key-store', () => ({
  contactPinId: (ownerId: string, contactId: string) => `${ownerId}:${contactId}`,
  loadContactPin: (ownerId: string, contactId: string) => Promise.resolve(store.get(`${ownerId}:${contactId}`) ?? null),
  saveContactPin: (pin: { id: string }) => {
    store.set(pin.id, structuredClone(pin));
    return Promise.resolve();
  },
}));

const own = { userId: 'me', publicKey: 'my-public-key' };

async function signedEntry(userId: string) {
  const identity = await generateIdentity();
  const proof = await buildSigningProof(userId, identity.publicKey, identity.privateKey);
  return { userId, publicKey: identity.publicKey, ...proof };
}

describe('contact trust', () => {
  beforeEach(() => {
    store.clear();
    resetContactTrustState();
  });

  it('pins a signed key on first sight as unverified', async () => {
    const entry = await signedEntry('bob');

    const trust = await observeContactKey(own, entry);

    expect(trust.status).toBe('unverified');
    expect(isKeyUsable(trust.status)).toBe(true);
    expect((store.get('me:bob') as ContactPin).publicKey).toBe(entry.publicKey);
  });

  it('reports a peer without a signing key as not verifiable yet and still pins it', async () => {
    const trust = await observeContactKey(own, { userId: 'bob', publicKey: 'legacy-key' });

    expect(trust.status).toBe('unverifiable');
    expect(isKeyUsable(trust.status)).toBe(true);
    expect((store.get('me:bob') as ContactPin).signingPublicKey).toBeNull();
  });

  it('upgrades a legacy pin when the same key later arrives with a valid proof', async () => {
    const identity = await generateIdentity();
    await observeContactKey(own, { userId: 'bob', publicKey: identity.publicKey });
    const proof = await buildSigningProof('bob', identity.publicKey, identity.privateKey);

    const trust = await observeContactKey(own, { userId: 'bob', publicKey: identity.publicKey, ...proof });

    expect(trust.status).toBe('unverified');
    expect((store.get('me:bob') as ContactPin).signingPublicKey).toBe(proof.signingPublicKey);
  });

  it('flags a changed key, keeps the old pin and refuses to use the new key', async () => {
    const first = await signedEntry('bob');
    await observeContactKey(own, first);
    const second = await signedEntry('bob');

    const trust = await observeContactKey(own, second);

    expect(trust.status).toBe('changed');
    expect(isKeyUsable(trust.status)).toBe(false);
    const pin = store.get('me:bob') as ContactPin;
    expect(pin.publicKey).toBe(first.publicKey);
    expect(pin.pending?.publicKey).toBe(second.publicKey);
  });

  it('flags a changed key even when the new key has no signature', async () => {
    await observeContactKey(own, await signedEntry('bob'));

    const trust = await observeContactKey(own, { userId: 'bob', publicKey: 'downgraded-key' });

    expect(trust.status).toBe('changed');
  });

  it('flags a stripped signature on the same key as a change', async () => {
    const entry = await signedEntry('bob');
    await observeContactKey(own, entry);

    const trust = await observeContactKey(own, { userId: 'bob', publicKey: entry.publicKey });

    expect(trust.status).toBe('changed');
  });

  it('rejects an invalid signature, never pins it and refuses the key', async () => {
    const entry = await signedEntry('bob');

    const trust = await observeContactKey(own, { ...entry, publicKey: 'swapped-key' });

    expect(trust.status).toBe('invalid');
    expect(isKeyUsable(trust.status)).toBe(false);
    expect(store.get('me:bob')).toBeUndefined();
  });

  it('keeps the original pin when an invalid entry arrives later', async () => {
    const entry = await signedEntry('bob');
    await observeContactKey(own, entry);

    const trust = await observeContactKey(own, { ...entry, publicKey: 'swapped-key' });

    expect(trust.status).toBe('invalid');
    expect((store.get('me:bob') as ContactPin).publicKey).toBe(entry.publicKey);
  });

  it('clears the pending change when the original key comes back', async () => {
    const first = await signedEntry('bob');
    await observeContactKey(own, first);
    await observeContactKey(own, await signedEntry('bob'));

    const trust = await observeContactKey(own, first);

    expect(trust.status).toBe('unverified');
    expect((store.get('me:bob') as ContactPin).pending).toBeNull();
  });

  it('accepting a change pins the new key and drops the verified state', async () => {
    await observeContactKey(own, await signedEntry('bob'));
    await setContactVerified(own, 'bob', true);
    const second = await signedEntry('bob');
    const changed = await observeContactKey(own, second);
    expect(changed.status).toBe('changed');
    expect(changed.pin?.verified).toBe(true);

    const accepted = await acceptContactKeyChange(own, 'bob');

    expect(accepted?.status).toBe('unverified');
    const pin = store.get('me:bob') as ContactPin;
    expect(pin.publicKey).toBe(second.publicKey);
    expect(pin.verified).toBe(false);
  });

  it('only marks a contact verified while no change is pending', async () => {
    await observeContactKey(own, await signedEntry('bob'));
    expect((await setContactVerified(own, 'bob', true))?.status).toBe('verified');
    await observeContactKey(own, await signedEntry('bob'));

    const result = await setContactVerified(own, 'bob', false);

    expect(result?.status).toBe('changed');
    expect((store.get('me:bob') as ContactPin).verified).toBe(true);
  });

  it('drops the verified state when the own identity key changed', async () => {
    const entry = await signedEntry('bob');
    await observeContactKey(own, entry);
    await setContactVerified(own, 'bob', true);
    resetContactTrustState();

    const trust = await observeContactKey({ userId: 'me', publicKey: 'new-own-key' }, entry);

    expect(trust.status).toBe('unverified');
  });

  it('keeps pins of different owners apart', async () => {
    const entry = await signedEntry('bob');
    await observeContactKey(own, entry);

    const trust = await observeContactKey({ userId: 'someone', publicKey: 'k' }, { userId: 'bob', publicKey: 'other-key' });

    expect(trust.status).toBe('unverifiable');
    expect((store.get('me:bob') as ContactPin).publicKey).toBe(entry.publicKey);
  });

  it('notifies subscribers and exposes the latest state', async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeContactTrust(listener);

    await observeContactKey(own, await signedEntry('bob'));

    expect(listener).toHaveBeenCalled();
    expect(getContactTrust('bob')?.status).toBe('unverified');
    unsubscribe();
  });

  it('serializes concurrent observations of the same contact', async () => {
    const first = await signedEntry('bob');
    const second = await signedEntry('bob');

    const [a, b] = await Promise.all([observeContactKey(own, first), observeContactKey(own, second)]);

    expect(a.status).toBe('unverified');
    expect(b.status).toBe('changed');
    expect((store.get('me:bob') as ContactPin).publicKey).toBe(first.publicKey);
  });

  it('flags the same public key presented with a different valid signing key', async () => {
    const entry = await signedEntry('bob');
    await observeContactKey(own, entry);
    const other = await generateIdentity();
    const otherProof = await buildSigningProof('bob', entry.publicKey, other.privateKey);

    const trust = await observeContactKey(own, { userId: 'bob', publicKey: entry.publicKey, ...otherProof });

    expect(trust.status).toBe('changed');
  });

  it('treats a partial signing payload as invalid', async () => {
    const entry = await signedEntry('bob');

    const trust = await observeContactKey(own, { userId: 'bob', publicKey: entry.publicKey, signingPublicKey: entry.signingPublicKey });

    expect(trust.status).toBe('invalid');
  });

  it('removes the verified state and ignores accept when nothing is pending', async () => {
    await observeContactKey(own, await signedEntry('bob'));
    await setContactVerified(own, 'bob', true);

    expect((await acceptContactKeyChange(own, 'bob'))?.status).toBe('verified');
    expect((await setContactVerified(own, 'bob', false))?.status).toBe('unverified');
  });

  it('flags a self-signed signing key that arrives on a verified legacy pin and keeps the old pin', async () => {
    const identity = await generateIdentity();
    await observeContactKey(own, { userId: 'bob', publicKey: identity.publicKey });
    await setContactVerified(own, 'bob', true);
    const attacker = await generateIdentity();
    const forged = await buildSigningProof('bob', identity.publicKey, attacker.privateKey);

    const trust = await observeContactKey(own, { userId: 'bob', publicKey: identity.publicKey, ...forged });

    expect(trust.status).toBe('changed');
    expect(isKeyUsable(trust.status)).toBe(false);
    const pin = store.get('me:bob') as ContactPin;
    expect(pin.signingPublicKey).toBeNull();
    expect(pin.pending?.signingPublicKey).toBe(forged.signingPublicKey);
  });

  it('never silently replaces a pinned signing key with another one for the same box key', async () => {
    const identity = await generateIdentity();
    const real = await buildSigningProof('bob', identity.publicKey, identity.privateKey);
    await observeContactKey(own, { userId: 'bob', publicKey: identity.publicKey, ...real });
    await setContactVerified(own, 'bob', true);
    const attacker = await generateIdentity();
    const forged = await buildSigningProof('bob', identity.publicKey, attacker.privateKey);

    const trust = await observeContactKey(own, { userId: 'bob', publicKey: identity.publicKey, ...forged });

    expect(trust.status).toBe('changed');
    expect((store.get('me:bob') as ContactPin).signingPublicKey).toBe(real.signingPublicKey);
  });
});
