import { createContext, use } from 'react';
import type { ChatAppearance, ChatSettings } from './constants/chat-appearance';
import type { ChatBackground } from './constants/chat-backgrounds';
import type { ColorThemeId } from './constants/color-themes';
import type { ThemeBaseId } from './constants/theme-bases';
import type { ThemePalette } from './types';

export interface ThemeContextValue {
  theme: ThemePalette;
  baseTheme: ThemeBaseId;
  colorTheme: ColorThemeId;
  changeBaseTheme: (baseId: ThemeBaseId) => void;
  changeColorTheme: (colorId: ColorThemeId) => void;
  changeTheme: (themeId: string) => void;
  getRoomWallpaper: (roomId: string) => ChatBackground | null;
  setRoomWallpaper: (roomId: string, backgroundId: string, applyToAll: boolean) => void;
  resetRoomWallpaper: (roomId: string, applyToAll: boolean) => void;
  hasRoomWallpaperOverride: (roomId: string) => boolean;
  getRoomAppearance: (roomId: string) => ChatAppearance;
  setRoomAppearance: (roomId: string, patch: Partial<ChatAppearance>, applyToAll: boolean) => void;
  resetRoomAppearance: (roomId: string, applyToAll: boolean) => void;
  hasRoomAppearanceOverride: (roomId: string) => boolean;
  chatSettings: ChatSettings;
  applyChatSettings: (settings: ChatSettings) => void;
}

export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function useTheme(): ThemeContextValue {
  const context = use(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
