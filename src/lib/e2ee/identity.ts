import { getSodium } from './sodium';

export interface Identity {
  publicKey: string;
  privateKey: Uint8Array;
}

export async function generateIdentity(): Promise<Identity> {
  const sodium = await getSodium();
  const keyPair = sodium.crypto_box_keypair();

  return {
    publicKey: sodium.to_base64(keyPair.publicKey),
    privateKey: keyPair.privateKey,
  };
}

export class IdentityKeyMismatchError extends Error {
  constructor() {
    super('The unwrapped private key does not match the published public key.');
    this.name = 'IdentityKeyMismatchError';
  }
}

export async function privateKeyMatchesPublicKey(privateKey: Uint8Array, publicKey: string): Promise<boolean> {
  const sodium = await getSodium();
  if (privateKey.length !== sodium.crypto_scalarmult_SCALARBYTES) {
    return false;
  }
  let expected: Uint8Array;
  try {
    expected = sodium.from_base64(publicKey);
  } catch {
    return false;
  }
  const derived = sodium.crypto_scalarmult_base(privateKey);
  return expected.length === derived.length && sodium.memcmp(derived, expected);
}
