import { LANDING_THEME_STORAGE_KEY } from '@constants/storage-keys';
import { COLOR_THEMES, type ColorThemeId } from '@features/theme/constants/color-themes';
import { THEME_BASES, type ThemeBaseId } from '@features/theme/constants/theme-bases';
import type { ThemeKind } from '@features/theme/types';

export const LANDING_THEME_KEY = LANDING_THEME_STORAGE_KEY;
export const LOGIN_DARK_MODE_KEY = 'sparkchat:login-dark-mode';

export interface LandingThemeChoice {
  base: ThemeBaseId;
  color: ColorThemeId;
  wallpaper: string;
}

export interface StoredLandingTheme extends LandingThemeChoice {
  kind: ThemeKind;
  vars: Record<string, string>;
}

export const DEFAULT_LANDING_THEME: LandingThemeChoice = {
  base: 'dark',
  color: 'standard',
  wallpaper: 'unsplash11',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function parseLandingTheme(raw: string | null, wallpaperIds: readonly string[]): LandingThemeChoice | null {
  if (!raw) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) {
    return null;
  }

  const { base, color, wallpaper } = parsed;
  if (typeof base !== 'string' || !(base in THEME_BASES)) {
    return null;
  }
  if (typeof color !== 'string' || !(color in COLOR_THEMES)) {
    return null;
  }

  return {
    base: base as ThemeBaseId,
    color: color as ColorThemeId,
    wallpaper: typeof wallpaper === 'string' && wallpaperIds.includes(wallpaper) ? wallpaper : DEFAULT_LANDING_THEME.wallpaper,
  };
}

export function readLandingTheme(storage: Storage, wallpaperIds: readonly string[]): LandingThemeChoice | null {
  try {
    return parseLandingTheme(storage.getItem(LANDING_THEME_KEY), wallpaperIds);
  } catch {
    return null;
  }
}

export function writeLandingTheme(storage: Storage, theme: StoredLandingTheme): void {
  try {
    storage.setItem(LANDING_THEME_KEY, JSON.stringify(theme));
    storage.setItem(LOGIN_DARK_MODE_KEY, JSON.stringify(theme.kind === 'dark'));
  } catch {
    return;
  }
}
