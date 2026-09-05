import type { ThemeTokens } from './types';

const CSS_VAR_PREFIX = '--sc-';

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}

export function cssVar(token: keyof ThemeTokens): string {
  return `var(${CSS_VAR_PREFIX}${toKebabCase(token)})`;
}

function syncThemeColorMeta(color: string): void {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = color;
}

export function applyThemeCssVars(tokens: ThemeTokens): void {
  const root = document.documentElement;
  const entries = Object.entries(tokens) as [string, string][];

  for (const [key, value] of entries) {
    root.style.setProperty(`${CSS_VAR_PREFIX}${toKebabCase(key)}`, value);
  }

  root.style.colorScheme = tokens.kind;
  root.dataset.theme = tokens.kind;
  syncThemeColorMeta(tokens.accent);
}

export function themeTokensToCssVars(tokens: ThemeTokens): Record<string, string> {
  const entries = Object.entries(tokens) as [string, string][];
  const vars: Record<string, string> = {};

  for (const [key, value] of entries) {
    vars[`${CSS_VAR_PREFIX}${toKebabCase(key)}`] = value;
  }

  return vars;
}
