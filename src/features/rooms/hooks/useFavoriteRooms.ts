import { useCallback, useEffect, useState } from 'react';

const FAVORITES_STORAGE_KEY = 'favoriteRooms';

function readStoredFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) {
      return new Set();
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((id): id is string => typeof id === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

export interface FavoriteRoomsControls {
  favoriteRoomIds: Set<string>;
  toggleFavorites: (roomIds: string[]) => void;
}

export function useFavoriteRooms(): FavoriteRoomsControls {
  const [favoriteRoomIds, setFavoriteRoomIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setFavoriteRoomIds(readStoredFavorites());
  }, []);

  const toggleFavorites = useCallback((roomIds: string[]) => {
    setFavoriteRoomIds((previous) => {
      const allFavorited = roomIds.every((roomId) => previous.has(roomId));
      const next = new Set(previous);

      for (const roomId of roomIds) {
        if (allFavorited) {
          next.delete(roomId);
        } else {
          next.add(roomId);
        }
      }

      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(Array.from(next)));
      return next;
    });
  }, []);

  return { favoriteRoomIds, toggleFavorites };
}
