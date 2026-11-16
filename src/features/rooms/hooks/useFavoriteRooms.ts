import { usePersistedIdSet } from '@lib/storage';

export interface FavoriteRoomsControls {
  favoriteRoomIds: Set<string>;
  toggleFavorites: (roomIds: string[]) => void;
}

export function useFavoriteRooms(userId: string): FavoriteRoomsControls {
  const { ids, toggle } = usePersistedIdSet(`favoriteRooms:${userId}`, 'favoriteRooms');
  return { favoriteRoomIds: ids, toggleFavorites: toggle };
}
