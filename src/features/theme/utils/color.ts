export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function channelToHex(value: number): string {
  return clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0');
}

export function parseHex(color: string): Rgb {
  const match = HEX_PATTERN.exec(color.trim());
  if (!match || !match[1]) {
    return { r: 0, g: 0, b: 0 };
  }

  let hex = match[1];
  if (hex.length === 3 || hex.length === 4) {
    hex = hex
      .slice(0, 3)
      .split('')
      .map((char) => char + char)
      .join('');
  }

  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

export function toHex({ r, g, b }: Rgb): string {
  return `#${channelToHex(r)}${channelToHex(g)}${channelToHex(b)}`;
}

export function withAlpha(color: string, alpha: number): string {
  const { r, g, b } = parseHex(color);
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
}

export function mix(base: string, target: string, amount: number): string {
  const a = parseHex(base);
  const b = parseHex(target);
  const t = clamp(amount, 0, 1);

  return toHex({
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  });
}

export function toHsl(color: string): Hsl {
  const { r, g, b } = parseHex(color);
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const l = (max + min) / 2;

  if (delta === 0) {
    return { h: 0, s: 0, l: l * 100 };
  }

  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let h = 0;
  if (max === red) {
    h = ((green - blue) / delta + (green < blue ? 6 : 0)) * 60;
  } else if (max === green) {
    h = ((blue - red) / delta + 2) * 60;
  } else {
    h = ((red - green) / delta + 4) * 60;
  }

  return { h, s: s * 100, l: l * 100 };
}

export function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp(s, 0, 100) / 100;
  const light = clamp(l, 0, 100) / 100;
  const chroma = (1 - Math.abs(2 * light - 1)) * sat;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - chroma / 2;

  let rgb: [number, number, number];
  if (hue < 60) {
    rgb = [chroma, x, 0];
  } else if (hue < 120) {
    rgb = [x, chroma, 0];
  } else if (hue < 180) {
    rgb = [0, chroma, x];
  } else if (hue < 240) {
    rgb = [0, x, chroma];
  } else if (hue < 300) {
    rgb = [x, 0, chroma];
  } else {
    rgb = [chroma, 0, x];
  }

  return toHex({ r: (rgb[0] + m) * 255, g: (rgb[1] + m) * 255, b: (rgb[2] + m) * 255 });
}

export function shiftLightness(color: string, delta: number): string {
  const { h, s, l } = toHsl(color);
  return hslToHex(h, s, l + delta);
}

function linearChannel(value: number): number {
  const channel = value / 255;
  return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(color: string): number {
  const { r, g, b } = parseHex(color);
  return 0.2126 * linearChannel(r) + 0.7152 * linearChannel(g) + 0.0722 * linearChannel(b);
}

export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

export function isLight(color: string): boolean {
  return relativeLuminance(color) > 0.4;
}

export function ensureContrast(foreground: string, background: string, minimum: number, direction: 'lighter' | 'darker'): string {
  let candidate = foreground;
  const step = direction === 'lighter' ? 3 : -3;

  for (let iteration = 0; iteration < 30; iteration++) {
    if (contrastRatio(candidate, background) >= minimum) {
      return candidate;
    }
    const { l } = toHsl(candidate);
    if ((direction === 'lighter' && l >= 97) || (direction === 'darker' && l <= 4)) {
      return candidate;
    }
    candidate = shiftLightness(candidate, step);
  }

  return candidate;
}

export function pickReadableText(background: string, light: string, dark: string, threshold = 2.6): string {
  return contrastRatio(light, background) >= threshold ? light : dark;
}
