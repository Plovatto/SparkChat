import { lookupContactKey } from '@lib/e2ee';
import { isAssistantRoom } from '@features/chat/utils/assistant';
import type { AppSocket, RoomSummary } from '@lib/socket';
import type { ResolvedPeer } from './call-controller';

export function isPrivateRoomWith(rooms: RoomSummary[], roomId: string, selfId: string, peerId: string): boolean {
  const room = rooms.find((candidate) => candidate.id === roomId);
  if (!room || room.type !== 'private' || isAssistantRoom(room) || room.participants.length !== 2) {
    return false;
  }
  const ids = room.participants.map((participant) => participant.id);
  return ids.includes(selfId) && ids.includes(peerId) && selfId !== peerId;
}

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
