import { useCallback, useEffect, useState } from 'react';
import { getItem, setItem } from '@lib/storage';
import { LOGIN_THEMES } from '../constants/login-themes';
import type { LoginThemePalette } from '../types';

const DARK_MODE_KEY = 'sparkchat:login-dark-mode';

export interface LoginThemeControls {
  darkMode: boolean;
  theme: LoginThemePalette;
  toggle: () => void;
}

export function useLoginTheme(): LoginThemeControls {
  const [darkMode, setDarkMode] = useState<boolean>(() => getItem<boolean>(DARK_MODE_KEY) ?? false);

  useEffect(() => {
    setItem(DARK_MODE_KEY, darkMode);
  }, [darkMode]);

  const toggle = useCallback(() => setDarkMode((previous) => !previous), []);

  return { darkMode, theme: darkMode ? LOGIN_THEMES.dark : LOGIN_THEMES.light, toggle };
}
