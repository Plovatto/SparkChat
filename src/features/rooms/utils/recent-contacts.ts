import type { RoomParticipant, RoomSummary } from '@lib/socket';
import { isAssistantRoom } from '@features/chat/utils/assistant';
import { getOtherParticipant } from './room-display';

function lastActivity(room: RoomSummary): number {
  const stamp = room.lastMessage?.timestamp;
  return stamp ? Date.parse(stamp) || 0 : 0;
}

export function recentContacts(rooms: readonly RoomSummary[], currentUserId: string | undefined, limit = 4): RoomParticipant[] {
  const seen = new Set<string>();
  const contacts: RoomParticipant[] = [];
  const privateRooms = rooms.filter((room) => room.type === 'private' && !isAssistantRoom(room)).sort((a, b) => lastActivity(b) - lastActivity(a));

  for (const room of privateRooms) {
    const other = getOtherParticipant(room, currentUserId);
    if (!other || seen.has(other.id)) {
      continue;
    }
    seen.add(other.id);
    contacts.push(other);
    if (contacts.length >= limit) {
      break;
    }
  }

  return contacts;
}
