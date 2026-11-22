import { clamp } from '@lib/math/clamp';

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Hsv {
  h: number;
  s: number;
  v: number;
}

const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export const COLOR_PRESETS: readonly string[] = [
  '#4a4fc9',
  '#7e39a8',
  '#e2506c',
  '#f58a42',
  '#3dd68c',
  '#3b82f6',
  '#ffffff',
  '#1f1b2e',
];

export function normalizeHex(input: string): string | null {
  const match = HEX_PATTERN.exec(input.trim());
  if (!match) {
    return null;
  }
  const digits = (match[1] ?? '').toLowerCase();
  const full = digits.length === 3 ? digits.replace(/./g, (char) => char + char) : digits;
  return `#${full}`;
}

export function hexToRgb(hex: string): Rgb {
  const normalized = normalizeHex(hex) ?? '#000000';
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const part = (value: number) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

export function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;

  if (delta !== 0) {
    if (max === red) {
      hue = ((green - blue) / delta) % 6;
    } else if (max === green) {
      hue = (blue - red) / delta + 2;
    } else {
      hue = (red - green) / delta + 4;
    }
    hue *= 60;
    if (hue < 0) {
      hue += 360;
    }
  }

  return { h: hue, s: max === 0 ? 0 : delta / max, v: max };
}

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const chroma = v * s;
  const sector = (((h % 360) + 360) % 360) / 60;
  const x = chroma * (1 - Math.abs((sector % 2) - 1));
  const offset = v - chroma;
  const [red, green, blue] =
    sector < 1 ? [chroma, x, 0] : sector < 2 ? [x, chroma, 0] : sector < 3 ? [0, chroma, x] : sector < 4 ? [0, x, chroma] : sector < 5 ? [x, 0, chroma] : [chroma, 0, x];

  return { r: (red + offset) * 255, g: (green + offset) * 255, b: (blue + offset) * 255 };
}

export function hsvToHex(hsv: Hsv): string {
  return rgbToHex(hsvToRgb(hsv));
}

export function hexToHsv(hex: string): Hsv {
  return rgbToHsv(hexToRgb(hex));
}

export function hueToHex(hue: number): string {
  return hsvToHex({ h: hue, s: 1, v: 1 });
}

export function moveInArea(area: { left: number; top: number; width: number; height: number }, clientX: number, clientY: number): { s: number; v: number } {
  const x = clamp((clientX - area.left) / Math.max(1, area.width), 0, 1);
  const y = clamp((clientY - area.top) / Math.max(1, area.height), 0, 1);
  return { s: x, v: 1 - y };
}

export function nudgeArea(current: { s: number; v: number }, key: string, step: number): { s: number; v: number } | null {
  switch (key) {
    case 'ArrowLeft':
      return { s: clamp(current.s - step, 0, 1), v: current.v };
    case 'ArrowRight':
      return { s: clamp(current.s + step, 0, 1), v: current.v };
    case 'ArrowUp':
      return { s: current.s, v: clamp(current.v + step, 0, 1) };
    case 'ArrowDown':
      return { s: current.s, v: clamp(current.v - step, 0, 1) };
    default:
      return null;
  }
}

export interface PopoverPlacement {
  top: number;
  left: number;
  origin: string;
}

export function placePopover(
  trigger: { left: number; top: number; right: number; bottom: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  margin = 12,
  gap = 8,
): PopoverPlacement {
  const spaceBelow = viewport.height - trigger.bottom - margin;
  const spaceAbove = trigger.top - margin;
  const placeAbove = spaceBelow < size.height && spaceAbove > spaceBelow;
  const top = placeAbove ? Math.max(margin, trigger.top - gap - size.height) : Math.min(trigger.bottom + gap, Math.max(margin, viewport.height - margin - size.height));
  const left = clamp(trigger.left, margin, Math.max(margin, viewport.width - margin - size.width));
  return { top, left, origin: `${placeAbove ? 'bottom' : 'top'} left` };
}
