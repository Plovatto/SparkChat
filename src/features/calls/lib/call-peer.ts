import { lookupContactKey } from '@lib/e2ee';
import type { AppSocket } from '@lib/socket';
import type { ResolvedPeer } from './call-controller';

export async function resolvePinnedPeer(socket: AppSocket, userId: string): Promise<ResolvedPeer> {
  const trust = await lookupContactKey(socket, userId);
  if (!trust) {
    return { error: 'unverifiable' };
  }
  if (trust.status === 'changed') {
    return { error: 'key-changed' };
  }
  const pin = trust.pin;
  if (trust.status === 'invalid' || !pin?.signingPublicKey) {
    return { error: 'unverifiable' };
  }
  return { peer: { publicKey: pin.publicKey, signingPublicKey: pin.signingPublicKey } };
}
