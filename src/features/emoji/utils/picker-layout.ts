export const EMOJI_SHEET_QUERY = '(max-width: 768px)';
export const EMOJI_POPOVER_WIDTH = 360;
export const EMOJI_POPOVER_HEIGHT = 420;
export const EMOJI_SHEET_MAX_WIDTH = 640;
export const EMOJI_SHEET_MAX_HEIGHT = 440;
export const EMOJI_SHEET_TOP_CLEARANCE = 72;
export const EMOJI_PANEL_PADDING = 12;
export const EMOJI_CELL_DESKTOP = 40;
export const EMOJI_CELL_TOUCH = 46;
const MIN_COLUMNS = 6;
const MAX_COLUMNS = 14;

export function emojiColumnsFor(panelWidth: number, isTouchLayout: boolean): number {
  const cell = isTouchLayout ? EMOJI_CELL_TOUCH : EMOJI_CELL_DESKTOP;
  const usable = Math.max(0, panelWidth - EMOJI_PANEL_PADDING * 2);
  return Math.min(MAX_COLUMNS, Math.max(MIN_COLUMNS, Math.floor(usable / cell)));
}

export function emojiSheetWidth(viewportWidth: number): number {
  return Math.min(viewportWidth, EMOJI_SHEET_MAX_WIDTH);
}

export function emojiSheetHeight(viewportHeight: number): number {
  return Math.max(0, Math.min(EMOJI_SHEET_MAX_HEIGHT, viewportHeight - EMOJI_SHEET_TOP_CLEARANCE));
}

export const SHEET_DISMISS_DISTANCE = 96;
export const SHEET_DISMISS_VELOCITY = 0.6;

export function shouldDismissSheet(distance: number, velocity: number): boolean {
  return distance >= SHEET_DISMISS_DISTANCE || (distance > 24 && velocity >= SHEET_DISMISS_VELOCITY);
}
