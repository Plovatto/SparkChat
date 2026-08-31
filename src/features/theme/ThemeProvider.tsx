import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CHAT_BACKGROUNDS, type ChatBackground } from './constants/chat-backgrounds';
import { COLOR_THEMES, type ColorThemeId } from './constants/color-themes';
import { THEME_BASES, type ThemeBaseId } from './constants/theme-bases';
import { mergeTheme } from './merge-theme';
import { ThemeContext, type ThemeContextValue } from './theme-context';

const BASE_STORAGE_KEY = 'chatBaseTheme';
const COLOR_STORAGE_KEY = 'chatColorTheme';
const WALLPAPER_STORAGE_KEY = 'chatRoomWallpapers';
const DEFAULT_BASE: ThemeBaseId = 'dark';
const DEFAULT_COLOR: ColorThemeId = 'standard';

function readStoredWallpapers(): Record<string, string> {
  try {
    const raw = localStorage.getItem(WALLPAPER_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function isThemeBaseId(value: string): value is ThemeBaseId {
  return value in THEME_BASES;
}

function isColorThemeId(value: string): value is ColorThemeId {
  return value in COLOR_THEMES;
}

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [baseTheme, setBaseTheme] = useState<ThemeBaseId>(DEFAULT_BASE);
  const [colorTheme, setColorTheme] = useState<ColorThemeId>(DEFAULT_COLOR);
  const [roomWallpapers, setRoomWallpapers] = useState<Record<string, string>>({});

  useEffect(() => {
    const savedBase = localStorage.getItem(BASE_STORAGE_KEY);
    if (savedBase && isThemeBaseId(savedBase)) {
      setBaseTheme(savedBase);
    }

    const savedColor = localStorage.getItem(COLOR_STORAGE_KEY);
    if (savedColor && isColorThemeId(savedColor)) {
      setColorTheme(savedColor);
    }

    setRoomWallpapers(readStoredWallpapers());
  }, []);

  const changeBaseTheme = useCallback((baseId: ThemeBaseId) => {
    setBaseTheme(baseId);
    localStorage.setItem(BASE_STORAGE_KEY, baseId);
  }, []);

  const changeColorTheme = useCallback((colorId: ColorThemeId) => {
    setColorTheme(colorId);
    localStorage.setItem(COLOR_STORAGE_KEY, colorId);
  }, []);

  const changeTheme = useCallback(
    (themeId: string) => {
      const parts = themeId.split('-');
      const [baseCandidate, colorCandidate] = parts;

      if (parts.length === 2 && baseCandidate && colorCandidate && isThemeBaseId(baseCandidate) && isColorThemeId(colorCandidate)) {
        changeBaseTheme(baseCandidate);
        changeColorTheme(colorCandidate);
        return;
      }

      if (isThemeBaseId(themeId)) {
        changeBaseTheme(themeId);
        return;
      }

      if (isColorThemeId(themeId)) {
        changeColorTheme(themeId);
      }
    },
    [changeBaseTheme, changeColorTheme],
  );

  const setRoomWallpaper = useCallback((roomId: string, backgroundId: string) => {
    setRoomWallpapers((previous) => {
      const next = { ...previous, [roomId]: backgroundId };
      localStorage.setItem(WALLPAPER_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const getRoomWallpaper = useCallback(
    (roomId: string): ChatBackground | null => {
      const backgroundId = roomWallpapers[roomId];
      if (!backgroundId) {
        return null;
      }
      return CHAT_BACKGROUNDS.find((background) => background.id === backgroundId) ?? null;
    },
    [roomWallpapers],
  );

  const theme = useMemo(() => mergeTheme(baseTheme, colorTheme).colors, [baseTheme, colorTheme]);

  const value: ThemeContextValue = useMemo(
    () => ({
      theme,
      baseTheme,
      colorTheme,
      changeBaseTheme,
      changeColorTheme,
      changeTheme,
      getRoomWallpaper,
      setRoomWallpaper,
    }),
    [theme, baseTheme, colorTheme, changeBaseTheme, changeColorTheme, changeTheme, getRoomWallpaper, setRoomWallpaper],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
