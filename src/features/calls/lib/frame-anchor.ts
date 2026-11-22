export interface FrameEdges {
  right: number;
  bottom: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface FrameInsets {
  right: number;
  bottom: number;
}

export const FRAME_SELECTOR = '.chat-shell-card';
export const FRAME_GAP_PX = 16;

export function frameInsets(frame: FrameEdges, viewport: Viewport, gap: number): FrameInsets | null {
  if (frame.right <= 0 || frame.bottom <= 0) {
    return null;
  }
  const right = viewport.width - frame.right;
  const bottom = viewport.height - frame.bottom;
  if (right < 1 && bottom < 1) {
    return null;
  }
  return { right: Math.round(Math.max(0, right) + gap), bottom: Math.round(Math.max(0, bottom) + gap) };
}
