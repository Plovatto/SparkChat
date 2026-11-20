import type { RoomSummary } from '@lib/socket';
import { getRoomDisplayName } from './room-display';

export const ROOM_FILTERS = ['all', 'unread', 'groups'] as const;

export type RoomFilter = (typeof ROOM_FILTERS)[number];

export function normalizeSearchText(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

export function hasUnread(room: RoomSummary): boolean {
  return room.unreadCount > 0 || room.mentionCount > 0;
}

export function countUnreadRooms(rooms: readonly RoomSummary[]): number {
  return rooms.filter(hasUnread).length;
}

function matchesFilter(room: RoomSummary, filter: RoomFilter): boolean {
  if (filter === 'unread') {
    return hasUnread(room);
  }
  if (filter === 'groups') {
    return room.type === 'group';
  }
  return true;
}

export function filterRooms<T extends RoomSummary>(rooms: readonly T[], filter: RoomFilter, query: string, currentUserId: string | undefined): T[] {
  const needle = normalizeSearchText(query);
  return rooms.filter(
    (room) => matchesFilter(room, filter) && (needle === '' || normalizeSearchText(getRoomDisplayName(room, currentUserId)).includes(needle)),
  );
}
