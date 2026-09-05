import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MOTION_DURATION_MS } from '@features/motion';
import { buildTheme } from './build-theme';
import { DEFAULT_CHAT_APPEARANCE, type ChatAppearance } from './constants/chat-appearance';
import { CHAT_BACKGROUNDS, type ChatBackground } from './constants/chat-backgrounds';
import type { ColorThemeId } from './constants/color-themes';
import type { ThemeBaseId } from './constants/theme-bases';
import { ThemeContext, type ThemeContextValue } from './theme-context';
import { applyThemeCssVars } from './theme-css-vars';
import { isColorThemeId, isThemeBaseId } from './theme-guards';

export const BASE_STORAGE_KEY = 'chatBaseTheme';
export const COLOR_STORAGE_KEY = 'chatColorTheme';
const WALLPAPER_STORAGE_KEY = 'chatRoomWallpapers';
const GLOBAL_WALLPAPER_STORAGE_KEY = 'chatGlobalWallpaper';
const APPEARANCE_STORAGE_KEY = 'chatRoomAppearance';
const GLOBAL_APPEARANCE_STORAGE_KEY = 'chatGlobalAppearance';
const DEFAULT_BASE: ThemeBaseId = 'dark';
const DEFAULT_COLOR: ColorThemeId = 'standard';
const THEME_TRANSITION_CLASS = 'sc-theme-transition';

function readStoredJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as T) : null;
  } catch {
    return null;
  }
}

function readStoredBase(): ThemeBaseId {
  const saved = localStorage.getItem(BASE_STORAGE_KEY);
  return saved && isThemeBaseId(saved) ? saved : DEFAULT_BASE;
}

function readStoredColor(): ColorThemeId {
  const saved = localStorage.getItem(COLOR_STORAGE_KEY);
  return saved && isColorThemeId(saved) ? saved : DEFAULT_COLOR;
}

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [baseTheme, setBaseTheme] = useState<ThemeBaseId>(readStoredBase);
  const [colorTheme, setColorTheme] = useState<ColorThemeId>(readStoredColor);
  const [roomWallpapers, setRoomWallpapers] = useState<Record<string, string>>(() => readStoredJson<Record<string, string>>(WALLPAPER_STORAGE_KEY) ?? {});
  const [globalWallpaper, setGlobalWallpaperState] = useState<string | null>(() => localStorage.getItem(GLOBAL_WALLPAPER_STORAGE_KEY));
  const [roomAppearance, setRoomAppearanceState] = useState<Record<string, ChatAppearance>>(
    () => readStoredJson<Record<string, ChatAppearance>>(APPEARANCE_STORAGE_KEY) ?? {},
  );
  const [globalAppearance, setGlobalAppearanceState] = useState<ChatAppearance | null>(() => readStoredJson<ChatAppearance>(GLOBAL_APPEARANCE_STORAGE_KEY));

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

  const setRoomWallpaper = useCallback((roomId: string, backgroundId: string, applyToAll: boolean) => {
    if (applyToAll) {
      setGlobalWallpaperState(backgroundId);
      localStorage.setItem(GLOBAL_WALLPAPER_STORAGE_KEY, backgroundId);
      return;
    }

    setRoomWallpapers((previous) => {
      const next = { ...previous, [roomId]: backgroundId };
      localStorage.setItem(WALLPAPER_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const resetRoomWallpaper = useCallback((roomId: string, applyToAll: boolean) => {
    if (applyToAll) {
      setGlobalWallpaperState(null);
      localStorage.removeItem(GLOBAL_WALLPAPER_STORAGE_KEY);
      return;
    }

    setRoomWallpapers((previous) => {
      const next = { ...previous };
      delete next[roomId];
      localStorage.setItem(WALLPAPER_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const hasRoomWallpaperOverride = useCallback((roomId: string) => roomId in roomWallpapers, [roomWallpapers]);

  const getRoomWallpaper = useCallback(
    (roomId: string): ChatBackground | null => {
      const backgroundId = roomWallpapers[roomId] ?? globalWallpaper;
      if (!backgroundId) {
        return null;
      }
      return CHAT_BACKGROUNDS.find((background) => background.id === backgroundId) ?? null;
    },
    [roomWallpapers, globalWallpaper],
  );

  const getRoomAppearance = useCallback(
    (roomId: string): ChatAppearance => {
      return { ...DEFAULT_CHAT_APPEARANCE, ...(roomAppearance[roomId] ?? globalAppearance ?? {}) };
    },
    [roomAppearance, globalAppearance],
  );

  const setRoomAppearance = useCallback(
    (roomId: string, patch: Partial<ChatAppearance>, applyToAll: boolean) => {
      if (applyToAll) {
        setGlobalAppearanceState((previous) => {
          const next = { ...DEFAULT_CHAT_APPEARANCE, ...(previous ?? {}), ...patch };
          localStorage.setItem(GLOBAL_APPEARANCE_STORAGE_KEY, JSON.stringify(next));
          return next;
        });
        return;
      }

      setRoomAppearanceState((previous) => {
        const base = { ...DEFAULT_CHAT_APPEARANCE, ...(previous[roomId] ?? globalAppearance ?? {}) };
        const next = { ...previous, [roomId]: { ...base, ...patch } };
        localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    },
    [globalAppearance],
  );

  const resetRoomAppearance = useCallback((roomId: string, applyToAll: boolean) => {
    if (applyToAll) {
      setGlobalAppearanceState(null);
      localStorage.removeItem(GLOBAL_APPEARANCE_STORAGE_KEY);
      return;
    }

    setRoomAppearanceState((previous) => {
      const next = { ...previous };
      delete next[roomId];
      localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const hasRoomAppearanceOverride = useCallback((roomId: string) => roomId in roomAppearance, [roomAppearance]);

  const theme = useMemo(() => buildTheme(baseTheme, colorTheme).tokens, [baseTheme, colorTheme]);

  useEffect(() => {
    applyThemeCssVars(theme);
  }, [theme]);

  const hasAppliedInitialThemeRef = useRef(false);

  useEffect(() => {
    if (!hasAppliedInitialThemeRef.current) {
      hasAppliedInitialThemeRef.current = true;
      return;
    }

    const root = document.documentElement;
    root.classList.add(THEME_TRANSITION_CLASS);
    const timeout = window.setTimeout(() => root.classList.remove(THEME_TRANSITION_CLASS), MOTION_DURATION_MS.normal + 60);

    return () => {
      window.clearTimeout(timeout);
      root.classList.remove(THEME_TRANSITION_CLASS);
    };
  }, [baseTheme, colorTheme]);

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
      resetRoomWallpaper,
      hasRoomWallpaperOverride,
      getRoomAppearance,
      setRoomAppearance,
      resetRoomAppearance,
      hasRoomAppearanceOverride,
    }),
    [
      theme,
      baseTheme,
      colorTheme,
      changeBaseTheme,
      changeColorTheme,
      changeTheme,
      getRoomWallpaper,
      setRoomWallpaper,
      resetRoomWallpaper,
      hasRoomWallpaperOverride,
      getRoomAppearance,
      setRoomAppearance,
      resetRoomAppearance,
      hasRoomAppearanceOverride,
    ],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
