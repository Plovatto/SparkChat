import { usePersistedIdSet } from '@lib/storage';

export interface FavoriteRoomsControls {
  favoriteRoomIds: Set<string>;
  toggleFavorites: (roomIds: string[]) => void;
}

export function useFavoriteRooms(): FavoriteRoomsControls {
  const { ids, toggle } = usePersistedIdSet('favoriteRooms');
  return { favoriteRoomIds: ids, toggleFavorites: toggle };
}
