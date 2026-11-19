import { getSodium } from './sodium';

const SEED_CONTEXT = 'sparkchat:signing-seed:v1';
const BINDING_PREFIX = 'sparkchat:identity-binding:v1:';

export interface SigningProof {
  signingPublicKey: string;
  keySignature: string;
}

export interface PublishedKeyEntry {
  userId: string;
  publicKey: string;
  signingPublicKey?: string | undefined;
  keySignature?: string | undefined;
}

function bindingMessage(userId: string, publicKey: string): Uint8Array {
  return new TextEncoder().encode(`${BINDING_PREFIX}${userId}:${publicKey}`);
}

export async function buildSigningProof(userId: string, publicKey: string, privateKey: Uint8Array): Promise<SigningProof> {
  const sodium = await getSodium();
  const seed = sodium.crypto_generichash(sodium.crypto_sign_SEEDBYTES, privateKey, sodium.from_string(SEED_CONTEXT));
  const pair = sodium.crypto_sign_seed_keypair(seed);
  const signature = sodium.crypto_sign_detached(bindingMessage(userId, publicKey), pair.privateKey);
  const proof = { signingPublicKey: sodium.to_base64(pair.publicKey), keySignature: sodium.to_base64(signature) };
  seed.fill(0);
  pair.privateKey.fill(0);
  return proof;
}

export async function verifyKeyBinding(entry: PublishedKeyEntry): Promise<boolean> {
  if (!entry.signingPublicKey || !entry.keySignature) {
    return false;
  }

  try {
    const sodium = await getSodium();
    const signingPublicKey = sodium.from_base64(entry.signingPublicKey);
    const signature = sodium.from_base64(entry.keySignature);
    if (signingPublicKey.length !== sodium.crypto_sign_PUBLICKEYBYTES || signature.length !== sodium.crypto_sign_BYTES) {
      return false;
    }
    return sodium.crypto_sign_verify_detached(signature, bindingMessage(entry.userId, entry.publicKey), signingPublicKey);
  } catch {
    return false;
  }
}
