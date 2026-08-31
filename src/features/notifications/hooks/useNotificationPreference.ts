import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'chatNotificationsEnabled';

export interface NotificationPreference {
  isSupported: boolean;
  isEnabled: boolean;
  permission: NotificationPermission;
  enable: () => Promise<void>;
  disable: () => void;
}

function getIsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function useNotificationPreference(): NotificationPreference {
  const isSupported = getIsSupported();
  const [permission, setPermission] = useState<NotificationPermission>(isSupported ? Notification.permission : 'denied');
  const [isEnabled, setIsEnabled] = useState(
    () => isSupported && localStorage.getItem(STORAGE_KEY) === 'true' && Notification.permission === 'granted',
  );

  useEffect(() => {
    if (isSupported && permission === 'denied' && isEnabled) {
      setIsEnabled(false);
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [isSupported, permission, isEnabled]);

  const enable = useCallback(async () => {
    if (!isSupported) {
      return;
    }

    let currentPermission = Notification.permission;
    if (currentPermission === 'default') {
      currentPermission = await Notification.requestPermission();
      setPermission(currentPermission);
    }

    if (currentPermission === 'granted') {
      localStorage.setItem(STORAGE_KEY, 'true');
      setIsEnabled(true);
    }
  }, [isSupported]);

  const disable = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setIsEnabled(false);
  }, []);

  return { isSupported, isEnabled, permission, enable, disable };
}
