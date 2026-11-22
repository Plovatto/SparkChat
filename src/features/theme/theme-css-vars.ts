import type { ThemeTokens } from './types';

const CSS_VAR_PREFIX = '--sc-';

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}

const THEME_COLOR_STORAGE_KEY = 'sc-theme-color';
const FIRST_COLOR_PATTERN = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/i;

export function gradientStartColor(gradient: string, fallback: string): string {
  return FIRST_COLOR_PATTERN.exec(gradient)?.[0] ?? fallback;
}

function writeThemeColorMeta(color: string): void {
  const stale = document.querySelectorAll('meta[name="theme-color"]');
  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  meta.content = color;
  stale.forEach((element) => element.remove());
  document.head.appendChild(meta);
}

function syncThemeColorMeta(color: string): void {
  writeThemeColorMeta(color);
  try {
    localStorage.setItem(THEME_COLOR_STORAGE_KEY, color);
  } catch {
    return;
  }
}

export function restoreThemeColorMeta(): void {
  try {
    const stored = localStorage.getItem(THEME_COLOR_STORAGE_KEY);
    if (stored) {
      writeThemeColorMeta(stored);
    }
  } catch {
    return;
  }
}

export function applyThemeCssVars(tokens: ThemeTokens): void {
  const root = document.documentElement;
  const entries = Object.entries(tokens) as [string, string][];

  for (const [key, value] of entries) {
    root.style.setProperty(`${CSS_VAR_PREFIX}${toKebabCase(key)}`, value);
  }

  root.style.colorScheme = tokens.kind;
  root.dataset.theme = tokens.kind;
  syncThemeColorMeta(gradientStartColor(tokens.gradient, tokens.accent));
}

export function themeTokensToCssVars(tokens: ThemeTokens): Record<string, string> {
  const entries = Object.entries(tokens) as [string, string][];
  const vars: Record<string, string> = {};

  for (const [key, value] of entries) {
    vars[`${CSS_VAR_PREFIX}${toKebabCase(key)}`] = value;
  }

  return vars;
}
