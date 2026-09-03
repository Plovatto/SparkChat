export function clampAspectRatio(width: number, height: number, minRatio: number, maxRatio: number): number {
  if (width <= 0 || height <= 0) {
    return 1;
  }

  return Math.min(maxRatio, Math.max(minRatio, width / height));
}
