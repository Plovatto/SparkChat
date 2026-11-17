import { createContext, useCallback, useState } from 'react';
import { AUTO_TRANSLATE_STORAGE_KEY } from '@constants/storage-keys';

export const AutoTranslateContext = createContext<boolean>(false);

export interface AutoTranslatePreference {
  isEnabled: boolean;
  toggle: () => void;
}

export function parseAutoTranslatePreference(stored: string | null): boolean {
  return stored !== 'false';
}

function readStoredPreference(): boolean {
  try {
    return parseAutoTranslatePreference(window.localStorage.getItem(AUTO_TRANSLATE_STORAGE_KEY));
  } catch {
    return true;
  }
}

function storePreference(value: boolean): void {
  try {
    window.localStorage.setItem(AUTO_TRANSLATE_STORAGE_KEY, String(value));
  } catch {
    return;
  }
}

export function useAutoTranslatePreference(): AutoTranslatePreference {
  const [isEnabled, setIsEnabled] = useState(readStoredPreference);

  const toggle = useCallback(() => {
    setIsEnabled((previous) => {
      const next = !previous;
      storePreference(next);
      return next;
    });
  }, []);

  return { isEnabled, toggle };
}
