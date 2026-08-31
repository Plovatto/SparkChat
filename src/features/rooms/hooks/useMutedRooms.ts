import { usePersistedIdSet } from '@lib/storage';

export interface MutedRoomsControls {
  mutedRoomIds: Set<string>;
  toggleMuted: (roomIds: string[]) => void;
}

export function useMutedRooms(): MutedRoomsControls {
  const { ids, toggle } = usePersistedIdSet('mutedRooms');
  return { mutedRoomIds: ids, toggleMuted: toggle };
}
