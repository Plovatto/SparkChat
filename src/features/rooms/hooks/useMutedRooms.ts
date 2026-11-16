import { usePersistedIdSet } from '@lib/storage';

export interface MutedRoomsControls {
  mutedRoomIds: Set<string>;
  toggleMuted: (roomIds: string[]) => void;
}

export function useMutedRooms(userId: string): MutedRoomsControls {
  const { ids, toggle } = usePersistedIdSet(`mutedRooms:${userId}`, 'mutedRooms');
  return { mutedRoomIds: ids, toggleMuted: toggle };
}
