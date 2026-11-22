import { describe, expect, it } from 'vitest';
import { DEFAULT_COLOR_THEME } from '@features/theme/constants/color-themes';
import {
  DEFAULT_LANDING_THEME,
  LANDING_THEME_KEY,
  LOGIN_DARK_MODE_KEY,
  parseLandingTheme,
  readLandingTheme,
  writeLandingTheme,
} from './landing-theme-storage';

const WALLPAPERS = ['default', 'gradient1'];

function createStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  };
}

describe('parseLandingTheme', () => {
  it('opens with the same default color theme as the app', () => {
    expect(DEFAULT_LANDING_THEME.color).toBe(DEFAULT_COLOR_THEME);
    expect(DEFAULT_LANDING_THEME.color).toBe('duskViolet');
  });

  it('returns null for empty or malformed values', () => {
    expect(parseLandingTheme(null, WALLPAPERS)).toBeNull();
    expect(parseLandingTheme('not json', WALLPAPERS)).toBeNull();
    expect(parseLandingTheme('42', WALLPAPERS)).toBeNull();
  });

  it('rejects unknown modes and colors', () => {
    expect(parseLandingTheme(JSON.stringify({ base: 'neon', color: 'standard' }), WALLPAPERS)).toBeNull();
    expect(parseLandingTheme(JSON.stringify({ base: 'dark', color: 'nope' }), WALLPAPERS)).toBeNull();
  });

  it('falls back to the default wallpaper when it is unknown', () => {
    const theme = parseLandingTheme(JSON.stringify({ base: 'light', color: 'forest', wallpaper: 'gone' }), WALLPAPERS);
    expect(theme).toEqual({ base: 'light', color: 'forest', wallpaper: DEFAULT_LANDING_THEME.wallpaper });
  });
});

describe('landing theme storage', () => {
  it('round-trips the choice and mirrors the mode for the login screen', () => {
    const storage = createStorage();
    writeLandingTheme(storage, { base: 'midnight', color: 'sunset', wallpaper: 'gradient1', kind: 'dark', vars: { '--sc-accent': '#000' } });

    expect(readLandingTheme(storage, WALLPAPERS)).toEqual({ base: 'midnight', color: 'sunset', wallpaper: 'gradient1' });
    expect(storage.getItem(LOGIN_DARK_MODE_KEY)).toBe('true');
    const stored = JSON.parse(storage.getItem(LANDING_THEME_KEY) ?? '{}') as { vars?: Record<string, string> };
    expect(stored.vars).toEqual({ '--sc-accent': '#000' });
  });

  it('stores a light mode as not dark', () => {
    const storage = createStorage();
    writeLandingTheme(storage, { base: 'light', color: 'standard', wallpaper: 'default', kind: 'light', vars: {} });
    expect(storage.getItem(LOGIN_DARK_MODE_KEY)).toBe('false');
  });
});
