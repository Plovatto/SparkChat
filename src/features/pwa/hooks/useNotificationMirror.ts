import { useEffect, useMemo } from 'react';
import type { RoomSummary } from '@lib/socket';
import { buildNotificationDisplayNames } from '../lib/notification-display-names';
import { writeNotificationMirror } from '../lib/notification-mirror';

export const NOTIFICATION_MIRROR_DEBOUNCE_MS = 400;

export interface NotificationMirrorInput {
  userId: string;
  rooms: readonly RoomSummary[];
  hideContent: boolean;
  language: 'pt' | 'en';
}

export function useNotificationMirror({ userId, rooms, hideContent, language }: NotificationMirrorInput): void {
  const namesKey = useMemo(() => JSON.stringify(buildNotificationDisplayNames(rooms, userId)), [rooms, userId]);

  useEffect(() => {
    if (typeof indexedDB === 'undefined') {
      return;
    }
    const timer = window.setTimeout(() => {
      const names = JSON.parse(namesKey) as ReturnType<typeof buildNotificationDisplayNames>;
      void writeNotificationMirror({ ownerId: userId, hideContent, language, names }).catch(() => undefined);
    }, NOTIFICATION_MIRROR_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [userId, namesKey, hideContent, language]);
}
