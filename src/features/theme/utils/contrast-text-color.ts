export function getContrastTextColor(backgroundColor: string): string {
  let r: number;
  let g: number;
  let b: number;

  if (backgroundColor.startsWith('#')) {
    let hex = backgroundColor.slice(1);
    if (hex.length === 3) {
      hex = hex
        .split('')
        .map((char) => char + char)
        .join('');
    }

    r = parseInt(hex.substring(0, 2), 16);
    g = parseInt(hex.substring(2, 4), 16);
    b = parseInt(hex.substring(4, 6), 16);
  } else if (backgroundColor.startsWith('rgb')) {
    const [red, green, blue] = backgroundColor.match(/\d+/g)?.map(Number) ?? [0, 0, 0];
    r = red ?? 0;
    g = green ?? 0;
    b = blue ?? 0;
  } else {
    return '#ffffff';
  }

  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#000000' : '#ffffff';
}
