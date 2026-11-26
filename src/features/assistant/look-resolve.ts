import {
  CHAT_BACKGROUNDS,
  COLOR_THEMES,
  DEFAULT_CHAT_APPEARANCE,
  THEME_BASES,
  buildTheme,
  type ColorThemeId,
  type ThemeBaseId,
  type ThemePalette,
} from '@features/theme';
import type { ChatAppearance, ChatSettings } from '@features/theme/constants/chat-appearance';
import type { ChatBackground } from '@features/theme/constants/chat-backgrounds';
import type { AssistantLook } from '@lib/assistant/assistant-card';

export interface CurrentLook {
  baseTheme: ThemeBaseId;
  colorTheme: ColorThemeId;
  chatSettings: ChatSettings;
}

export interface ResolvedLook {
  baseTheme: ThemeBaseId;
  colorTheme: ColorThemeId;
  theme: ThemePalette;
  wallpaperId: string | null;
  wallpaper: ChatBackground | null;
  appearance: ChatAppearance;
  changesBase: boolean;
  changesColor: boolean;
  changesWallpaper: boolean;
}

function findWallpaper(id: string | null | undefined): ChatBackground | undefined {
  return id ? CHAT_BACKGROUNDS.find((background) => background.id === id) : undefined;
}

export function resolveLook(look: AssistantLook, current: CurrentLook): ResolvedLook {
  const knownBase = look.baseTheme !== undefined && look.baseTheme in THEME_BASES;
  const knownColor = look.colorTheme !== undefined && look.colorTheme in COLOR_THEMES;
  const baseTheme = knownBase ? (look.baseTheme as ThemeBaseId) : current.baseTheme;
  const colorTheme = knownColor ? (look.colorTheme as ColorThemeId) : current.colorTheme;
  const chosenWallpaper = findWallpaper(look.wallpaper);
  const currentWallpaper = findWallpaper(current.chatSettings.globalWallpaper);
  const wallpaper = chosenWallpaper ?? currentWallpaper ?? null;
  return {
    baseTheme,
    colorTheme,
    theme: buildTheme(baseTheme, colorTheme).tokens,
    wallpaperId: wallpaper?.id ?? null,
    wallpaper,
    appearance: { ...DEFAULT_CHAT_APPEARANCE, ...(current.chatSettings.globalAppearance ?? {}), ...look.appearance },
    changesBase: knownBase,
    changesColor: knownColor,
    changesWallpaper: chosenWallpaper !== undefined,
  };
}
