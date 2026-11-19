export interface MasonryPlacement {
  index: number;
  column: number;
  top: number;
  height: number;
}

export interface MasonryLayout {
  columns: number[][];
  placements: MasonryPlacement[];
}

export interface MasonrySize {
  width: number;
  height: number;
}

const MIN_RATIO = 0.4;
const MAX_RATIO = 2.5;

export function tileAspectRatio({ width, height }: MasonrySize): number {
  const ratio = width > 0 && height > 0 ? height / width : 1;
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio));
}

export function layoutMasonry(sizes: MasonrySize[], columnCount: number): MasonryLayout {
  const count = Math.max(1, Math.floor(columnCount));
  const columns: number[][] = Array.from({ length: count }, () => []);
  const heights: number[] = Array.from({ length: count }, () => 0);
  const placements: MasonryPlacement[] = sizes.map((size, index) => {
    let column = 0;
    for (let candidate = 1; candidate < count; candidate += 1) {
      if ((heights[candidate] ?? 0) < (heights[column] ?? 0)) {
        column = candidate;
      }
    }
    const height = tileAspectRatio(size);
    const top = heights[column] ?? 0;
    heights[column] = top + height;
    columns[column]?.push(index);
    return { index, column, top, height };
  });
  return { columns, placements };
}

export type GridKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End';

export function isGridKey(key: string): key is GridKey {
  return ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key);
}

export function moveInMasonry(layout: MasonryLayout, currentIndex: number, key: GridKey): number | null {
  const { placements, columns } = layout;
  if (key === 'Home') {
    return placements.length > 0 ? 0 : null;
  }
  if (key === 'End') {
    return placements.length > 0 ? placements.length - 1 : null;
  }
  const current = placements[currentIndex];
  if (!current) {
    return null;
  }
  const column = columns[current.column] ?? [];
  const position = column.indexOf(currentIndex);
  if (key === 'ArrowDown') {
    return column[position + 1] ?? null;
  }
  if (key === 'ArrowUp') {
    return position > 0 ? (column[position - 1] ?? null) : null;
  }
  const targetColumn = columns[current.column + (key === 'ArrowRight' ? 1 : -1)];
  if (!targetColumn || targetColumn.length === 0) {
    return null;
  }
  const center = current.top + current.height / 2;
  let best: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const index of targetColumn) {
    const placement = placements[index];
    if (!placement) {
      continue;
    }
    const distance = Math.abs(placement.top + placement.height / 2 - center);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }
  return best;
}

const MIN_COLUMNS = 2;
const MAX_COLUMNS = 5;
const TARGET_COLUMN_WIDTH_PX = 150;

export function gifColumnCount(width: number): number {
  if (!Number.isFinite(width) || width <= 0) {
    return MIN_COLUMNS;
  }
  return Math.min(MAX_COLUMNS, Math.max(MIN_COLUMNS, Math.floor(width / TARGET_COLUMN_WIDTH_PX)));
}
