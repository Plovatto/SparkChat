import { describe, expect, it } from 'vitest';
import { generateIdentity, privateKeyMatchesPublicKey } from './identity';

describe('privateKeyMatchesPublicKey', () => {
  it('accepts a private key whose base point multiple is the public key', async () => {
    const identity = await generateIdentity();
    await expect(privateKeyMatchesPublicKey(identity.privateKey, identity.publicKey)).resolves.toBe(true);
  });

  it('rejects a private key from another identity', async () => {
    const [mine, other] = await Promise.all([generateIdentity(), generateIdentity()]);
    await expect(privateKeyMatchesPublicKey(other.privateKey, mine.publicKey)).resolves.toBe(false);
  });

  it('rejects malformed keys', async () => {
    const identity = await generateIdentity();
    await expect(privateKeyMatchesPublicKey(identity.privateKey.slice(0, 16), identity.publicKey)).resolves.toBe(false);
    await expect(privateKeyMatchesPublicKey(identity.privateKey, '***')).resolves.toBe(false);
    await expect(privateKeyMatchesPublicKey(identity.privateKey, 'AAAA')).resolves.toBe(false);
  });
});
