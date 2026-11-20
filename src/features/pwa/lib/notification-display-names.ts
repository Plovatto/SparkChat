import type { RoomSummary } from '@lib/socket';
import type { NotificationDisplayNames } from './notification-mirror';

export function buildNotificationDisplayNames(rooms: readonly RoomSummary[], currentUserId: string): NotificationDisplayNames {
  const users: Record<string, string> = {};
  const groups: Record<string, string> = {};
  for (const room of rooms) {
    for (const participant of room.participants) {
      if (participant.id !== currentUserId && participant.nickname) {
        users[participant.id] = participant.nickname;
      }
    }
    if (room.type === 'group' && room.name) {
      groups[room.id] = room.name;
    }
  }
  return { users, groups };
}
