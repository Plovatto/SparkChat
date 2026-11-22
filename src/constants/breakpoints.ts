export const MEDIUM_SCREEN_MIN_WIDTH_PX = 480;
export const SPLIT_LAYOUT_MIN_WIDTH_PX = 870;
export const INFO_COLUMN_MIN_WIDTH_PX = SPLIT_LAYOUT_MIN_WIDTH_PX;

export function minWidthQuery(widthPx: number): string {
  return `(min-width: ${widthPx}px)`;
}
