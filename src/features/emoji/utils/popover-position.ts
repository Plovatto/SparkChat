export interface AnchorRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export interface PopoverSize {
  width: number;
  height: number;
}

export interface PopoverPosition {
  left: number;
  top: number;
  width: number;
  height: number;
  placement: 'top' | 'bottom';
  originX: number;
}

export const POPOVER_GAP = 10;
export const POPOVER_MARGIN = 12;
const MIN_POPOVER_HEIGHT = 240;

export function computePopoverPosition(
  anchor: AnchorRect,
  viewport: ViewportSize,
  size: PopoverSize,
  preferred: 'top' | 'bottom' = 'top',
): PopoverPosition {
  const width = Math.max(0, Math.min(size.width, viewport.width - POPOVER_MARGIN * 2));
  const spaceAbove = anchor.top - POPOVER_GAP - POPOVER_MARGIN;
  const spaceBelow = viewport.height - anchor.bottom - POPOVER_GAP - POPOVER_MARGIN;
  const fitsPreferred = (preferred === 'top' ? spaceAbove : spaceBelow) >= Math.min(size.height, MIN_POPOVER_HEIGHT);
  const placement = fitsPreferred ? preferred : spaceAbove >= spaceBelow ? 'top' : 'bottom';
  const available = placement === 'top' ? spaceAbove : spaceBelow;
  const height = Math.max(0, Math.min(size.height, available));
  const top = placement === 'top' ? anchor.top - POPOVER_GAP - height : anchor.bottom + POPOVER_GAP;
  const maxLeft = Math.max(POPOVER_MARGIN, viewport.width - POPOVER_MARGIN - width);
  const left = Math.min(Math.max(anchor.left, POPOVER_MARGIN), maxLeft);
  const anchorCenter = (anchor.left + anchor.right) / 2;
  const originX = Math.min(Math.max(anchorCenter - left, 0), width);
  return { left, top, width, height, placement, originX };
}
