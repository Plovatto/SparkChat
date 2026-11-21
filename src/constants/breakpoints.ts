export const MEDIUM_SCREEN_MIN_WIDTH_PX = 480;
export const SPLIT_LAYOUT_MIN_WIDTH_PX = 870;
export const WIDE_GALLERY_MIN_WIDTH_PX = 900;
export const INFO_COLUMN_MIN_WIDTH_PX = SPLIT_LAYOUT_MIN_WIDTH_PX;
export const ROOM_HEADER_HEIGHT_PX = 77;

export function minWidthQuery(widthPx: number): string {
  return `(min-width: ${widthPx}px)`;
}
