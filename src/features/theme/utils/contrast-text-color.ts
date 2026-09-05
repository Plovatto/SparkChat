import { contrastRatio, toHex } from './color';

const LIGHT_TEXT = '#ffffff';
const DARK_TEXT = '#171a21';

function normalize(backgroundColor: string): string | null {
  if (backgroundColor.startsWith('#')) {
    return backgroundColor.length > 7 ? backgroundColor.slice(0, 7) : backgroundColor;
  }

  if (backgroundColor.startsWith('rgb')) {
    const [red, green, blue] = backgroundColor.match(/\d+/g)?.map(Number) ?? [];
    return toHex({ r: red ?? 0, g: green ?? 0, b: blue ?? 0 });
  }

  return null;
}

export function getContrastTextColor(backgroundColor: string): string {
  const hex = normalize(backgroundColor);
  if (!hex) {
    return LIGHT_TEXT;
  }

  const lightContrast = contrastRatio(LIGHT_TEXT, hex);
  const darkContrast = contrastRatio(DARK_TEXT, hex);
  return lightContrast >= 2.6 && lightContrast >= darkContrast * 0.6 ? LIGHT_TEXT : DARK_TEXT;
}
