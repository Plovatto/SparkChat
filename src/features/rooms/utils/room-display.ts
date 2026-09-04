import type { RoomParticipant, RoomSummary } from '@lib/socket';

export function getOtherParticipant(room: RoomSummary, currentUserId: string | undefined): RoomParticipant | undefined {
  return room.participants.find((participant) => participant.id !== currentUserId);
}

export function getRoomDisplayName(room: RoomSummary, currentUserId: string | undefined): string {
  if (room.type === 'group') {
    return room.name ?? 'Grupo';
  }

  return getOtherParticipant(room, currentUserId)?.nickname ?? 'Usuário';
}
