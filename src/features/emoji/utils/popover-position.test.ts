import { describe, expect, it } from 'vitest';
import { POPOVER_GAP, POPOVER_MARGIN, computePopoverPosition } from './popover-position';

const VIEWPORT = { width: 1280, height: 800 };
const SIZE = { width: 360, height: 420 };

describe('computePopoverPosition', () => {
  it('opens above the anchor, aligned to its left edge', () => {
    const position = computePopoverPosition({ top: 700, bottom: 748, left: 400, right: 900 }, VIEWPORT, SIZE, 'top');
    expect(position).toMatchObject({ placement: 'top', left: 400, width: 360, height: 420, top: 700 - POPOVER_GAP - 420 });
  });

  it('opens below when asked and there is room', () => {
    const position = computePopoverPosition({ top: 100, bottom: 130, left: 50, right: 80 }, VIEWPORT, SIZE, 'bottom');
    expect(position).toMatchObject({ placement: 'bottom', top: 130 + POPOVER_GAP, left: 50 });
  });

  it('flips to the side with more room', () => {
    expect(computePopoverPosition({ top: 60, bottom: 90, left: 50, right: 80 }, VIEWPORT, SIZE, 'top').placement).toBe('bottom');
    expect(computePopoverPosition({ top: 700, bottom: 740, left: 50, right: 80 }, VIEWPORT, SIZE, 'bottom').placement).toBe('top');
  });

  it('stays inside the viewport horizontally and shrinks to the available height', () => {
    const position = computePopoverPosition({ top: 300, bottom: 330, left: 1200, right: 1240 }, VIEWPORT, SIZE, 'top');
    expect(position.left + position.width).toBeLessThanOrEqual(VIEWPORT.width - POPOVER_MARGIN);
    expect(position.top).toBeGreaterThanOrEqual(POPOVER_MARGIN);
    expect(position.height).toBe(300 - POPOVER_GAP - POPOVER_MARGIN);
    expect(position.originX).toBeGreaterThan(0);
    expect(position.originX).toBeLessThanOrEqual(position.width);
  });

  it('never gets wider than the viewport', () => {
    const position = computePopoverPosition({ top: 600, bottom: 640, left: 0, right: 40 }, { width: 320, height: 700 }, SIZE, 'top');
    expect(position.width).toBe(320 - POPOVER_MARGIN * 2);
    expect(position.left).toBe(POPOVER_MARGIN);
  });
});
