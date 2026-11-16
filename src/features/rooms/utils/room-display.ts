import { translate } from '@lib/i18n/app-i18n';
import type { RoomParticipant, RoomSummary } from '@lib/socket';

export function getOtherParticipant(room: RoomSummary, currentUserId: string | undefined): RoomParticipant | undefined {
  return room.participants.find((participant) => participant.id !== currentUserId);
}

export function getRoomDisplayName(room: RoomSummary, currentUserId: string | undefined): string {
  if (room.type === 'group') {
    return room.name ?? translate('common.group');
  }

  return getOtherParticipant(room, currentUserId)?.nickname ?? translate('common.user');
}
