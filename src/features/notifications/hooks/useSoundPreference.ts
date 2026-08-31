import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'chatNotificationSoundEnabled';

export interface SoundPreference {
  isEnabled: boolean;
  toggle: () => void;
}

export function useSoundPreference(): SoundPreference {
  const [isEnabled, setIsEnabled] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      setIsEnabled(stored === 'true');
    }
  }, []);

  const toggle = useCallback(() => {
    setIsEnabled((previous) => {
      const next = !previous;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  return { isEnabled, toggle };
}
