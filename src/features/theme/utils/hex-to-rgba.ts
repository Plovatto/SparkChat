export function toSixDigitHex(color: string): string {
  if (!color.startsWith('#')) {
    return '#000000';
  }
  return color.slice(0, 7);
}

export function hexToRgba(hex: string, opacityPercent: number): string {
  let normalized = hex.startsWith('#') ? hex.slice(1) : hex;
  if (normalized.length === 3) {
    normalized = normalized
      .split('')
      .map((char) => char + char)
      .join('');
  }

  const r = parseInt(normalized.substring(0, 2), 16) || 0;
  const g = parseInt(normalized.substring(2, 4), 16) || 0;
  const b = parseInt(normalized.substring(4, 6), 16) || 0;
  const alpha = Math.min(100, Math.max(0, opacityPercent)) / 100;

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
