import type { AppSocket } from '@lib/socket';
import { getCurrentIdentity } from './current-identity';
import { lookupContactKey } from './room-keys';
import { deriveSigningKeyPair } from './signing';
import { getSodium } from './sodium';

const ownSigningPublicKeys = new WeakMap<Uint8Array, Uint8Array>();

async function resolveOwnSigningPublicKey(privateKey: Uint8Array): Promise<Uint8Array> {
  const cached = ownSigningPublicKeys.get(privateKey);
  if (cached) {
    return cached;
  }
  const pair = await deriveSigningKeyPair(privateKey);
  pair.privateKey.fill(0);
  ownSigningPublicKeys.set(privateKey, pair.publicKey);
  return pair.publicKey;
}

export async function resolveSenderSigningKey(socket: AppSocket, senderId: string): Promise<Uint8Array | null> {
  const sodium = await getSodium();
  const identity = getCurrentIdentity();
  if (identity && identity.userId === senderId) {
    return resolveOwnSigningPublicKey(identity.privateKey);
  }
  const trust = await lookupContactKey(socket, senderId);
  const signingPublicKey = trust?.pin?.signingPublicKey;
  return signingPublicKey ? sodium.from_base64(signingPublicKey) : null;
}
