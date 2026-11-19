import { useCallback, useState } from 'react';

export const NOTIFICATION_CONTENT_STORAGE_KEY = 'chatNotificationsShowContent';

export interface NotificationContentPreference {
  isContentHidden: boolean;
  toggle: () => void;
}

export function readIsNotificationContentHidden(): boolean {
  try {
    return localStorage.getItem(NOTIFICATION_CONTENT_STORAGE_KEY) !== 'true';
  } catch {
    return true;
  }
}

export function useNotificationContentPreference(): NotificationContentPreference {
  const [isContentHidden, setIsContentHidden] = useState(readIsNotificationContentHidden);

  const toggle = useCallback(() => {
    setIsContentHidden((previous) => {
      const next = !previous;
      try {
        if (next) {
          localStorage.removeItem(NOTIFICATION_CONTENT_STORAGE_KEY);
        } else {
          localStorage.setItem(NOTIFICATION_CONTENT_STORAGE_KEY, 'true');
        }
      } catch (error) {
        console.error(error);
      }
      return next;
    });
  }, []);

  return { isContentHidden, toggle };
}
