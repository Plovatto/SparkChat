import { describe, expect, it } from 'vitest';
import { generateIdentity } from './identity';
import { buildSigningProof, verifyKeyBinding } from './signing';

describe('signing proof', () => {
  it('matches the fixed known-answer vector shared with the API', async () => {
    const proof = await buildSigningProof('user-1', 'pub-key-1', new Uint8Array(32).fill(7));

    expect(proof).toEqual({
      signingPublicKey: 'WxVi_oq1Q_DMJpBSIrYGqIMN84-KfUWmwVnqbavaJHA',
      keySignature: 'Xcv5CvLuYmXUiiHaceCx47Z3ZiK_Hocigs6Nx-j8YLVUwR8mw5slD-DRyEt8osJflasWLbD2cXV10ub8FzF_Dw',
    });
  });

  it('is deterministic for the same identity and verifies', async () => {
    const identity = await generateIdentity();

    const first = await buildSigningProof('user-1', identity.publicKey, identity.privateKey);
    const second = await buildSigningProof('user-1', identity.publicKey, identity.privateKey);

    expect(first).toEqual(second);
    expect(first.signingPublicKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.keySignature).toMatch(/^[A-Za-z0-9_-]{86}$/);
    expect(await verifyKeyBinding({ userId: 'user-1', publicKey: identity.publicKey, ...first })).toBe(true);
  });

  it('does not verify for another user id or another public key', async () => {
    const identity = await generateIdentity();
    const other = await generateIdentity();
    const proof = await buildSigningProof('user-1', identity.publicKey, identity.privateKey);

    expect(await verifyKeyBinding({ userId: 'user-2', publicKey: identity.publicKey, ...proof })).toBe(false);
    expect(await verifyKeyBinding({ userId: 'user-1', publicKey: other.publicKey, ...proof })).toBe(false);
  });

  it('does not verify a signature made with another identity', async () => {
    const identity = await generateIdentity();
    const attacker = await generateIdentity();
    const forged = await buildSigningProof('user-1', identity.publicKey, attacker.privateKey);
    const real = await buildSigningProof('user-1', identity.publicKey, identity.privateKey);

    expect(forged.signingPublicKey).not.toBe(real.signingPublicKey);
    expect(
      await verifyKeyBinding({ userId: 'user-1', publicKey: identity.publicKey, signingPublicKey: real.signingPublicKey, keySignature: forged.keySignature }),
    ).toBe(false);
  });

  it('rejects missing and malformed fields without throwing', async () => {
    const identity = await generateIdentity();

    expect(await verifyKeyBinding({ userId: 'u', publicKey: identity.publicKey })).toBe(false);
    expect(await verifyKeyBinding({ userId: 'u', publicKey: identity.publicKey, signingPublicKey: 'x', keySignature: 'y' })).toBe(false);
    expect(await verifyKeyBinding({ userId: 'u', publicKey: identity.publicKey, signingPublicKey: '!!!', keySignature: '???' })).toBe(false);
  });
});
