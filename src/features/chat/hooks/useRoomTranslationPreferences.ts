import { useCallback, useEffect } from 'react';
import { usePersistedIdSet } from '@lib/storage';

const RETIRED_STORAGE_KEYS = ['sparkchat:auto-translate'];

export interface RoomTranslationPreferences {
  autoRoomIds: Set<string>;
  dismissedRoomIds: Set<string>;
  setAutoTranslate: (roomId: string, enabled: boolean) => void;
  dismissSuggestion: (roomId: string) => void;
}

export function useRoomTranslationPreferences(userId: string): RoomTranslationPreferences {
  const auto = usePersistedIdSet(`autoTranslateRooms:${userId}`);
  const dismissed = usePersistedIdSet(`translationBannerDismissed:${userId}`);
  const { ids: autoRoomIds, toggle: toggleAuto } = auto;
  const { ids: dismissedRoomIds, toggle: toggleDismissed } = dismissed;

  useEffect(() => {
    try {
      for (const key of [...RETIRED_STORAGE_KEYS, `outgoingTranslation:${userId}`]) {
        localStorage.removeItem(key);
      }
    } catch {
      return;
    }
  }, [userId]);

  const setAutoTranslate = useCallback(
    (roomId: string, enabled: boolean) => {
      if (autoRoomIds.has(roomId) !== enabled) {
        toggleAuto([roomId]);
      }
    },
    [autoRoomIds, toggleAuto],
  );

  const dismissSuggestion = useCallback(
    (roomId: string) => {
      if (!dismissedRoomIds.has(roomId)) {
        toggleDismissed([roomId]);
      }
    },
    [dismissedRoomIds, toggleDismissed],
  );

  return { autoRoomIds, dismissedRoomIds, setAutoTranslate, dismissSuggestion };
}
