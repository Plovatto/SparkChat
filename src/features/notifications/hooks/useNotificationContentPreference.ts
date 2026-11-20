import { useCallback, useState } from 'react';

export const NOTIFICATION_HIDE_CONTENT_STORAGE_KEY = 'chatNotificationsHideContent';
export const LEGACY_NOTIFICATION_SHOW_CONTENT_STORAGE_KEY = 'chatNotificationsShowContent';

export interface NotificationContentPreference {
  isContentHidden: boolean;
  toggle: () => void;
}

export function readIsNotificationContentHidden(): boolean {
  try {
    if (localStorage.getItem(LEGACY_NOTIFICATION_SHOW_CONTENT_STORAGE_KEY) !== null) {
      localStorage.removeItem(LEGACY_NOTIFICATION_SHOW_CONTENT_STORAGE_KEY);
    }
    return localStorage.getItem(NOTIFICATION_HIDE_CONTENT_STORAGE_KEY) === 'true';
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
          localStorage.setItem(NOTIFICATION_HIDE_CONTENT_STORAGE_KEY, 'true');
        } else {
          localStorage.removeItem(NOTIFICATION_HIDE_CONTENT_STORAGE_KEY);
        }
      } catch (error) {
        console.error(error);
      }
      return next;
    });
  }, []);

  return { isContentHidden, toggle };
}
