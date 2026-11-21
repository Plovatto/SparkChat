import { describe, expect, it } from 'vitest';
import { EMOJI_CELL_TOUCH, EMOJI_PANEL_PADDING, SHEET_ANCHOR_GAP, computeSheetPlacement, emojiColumnsFor, emojiSheetHeight, emojiSheetWidth, shouldDismissSheet } from './picker-layout';

describe('emoji picker layout', () => {
  it('keeps touch targets at least 44px wide on phones and tablets', () => {
    for (const width of [320, 360, 390, 414, 768]) {
      const sheetWidth = emojiSheetWidth(width);
      const columns = emojiColumnsFor(sheetWidth, true);
      expect((sheetWidth - EMOJI_PANEL_PADDING * 2) / columns).toBeGreaterThanOrEqual(44);
    }
    expect(EMOJI_CELL_TOUCH).toBeGreaterThanOrEqual(44);
  });

  it('uses eight columns in the desktop popover', () => {
    expect(emojiColumnsFor(360, false)).toBe(8);
  });

  it('caps the sheet width and keeps room above the sheet', () => {
    expect(emojiSheetWidth(360)).toBe(360);
    expect(emojiSheetWidth(1024)).toBe(640);
    expect(emojiSheetHeight(740)).toBe(440);
    expect(emojiSheetHeight(400)).toBe(328);
  });

  it('dismisses the sheet on a long or fast downward drag', () => {
    expect(shouldDismissSheet(120, 0.1)).toBe(true);
    expect(shouldDismissSheet(40, 1)).toBe(true);
    expect(shouldDismissSheet(40, 0.2)).toBe(false);
    expect(shouldDismissSheet(10, 2)).toBe(false);
  });

  it('docks the sheet above an anchor near the bottom so the composer stays visible', () => {
    expect(computeSheetPlacement({ top: 682 }, 740, 0)).toEqual({ bottom: 740 - 682 + SHEET_ANCHOR_GAP, height: 440 });
    expect(computeSheetPlacement({ top: 339 }, 407, 0)).toEqual({ bottom: 78, height: 257 });
  });

  it('falls back to the viewport bottom for anchors high on the screen or without an anchor', () => {
    expect(computeSheetPlacement({ top: 120 }, 740, 0)).toEqual({ bottom: 0, height: 440 });
    expect(computeSheetPlacement(null, 740, 300)).toEqual({ bottom: 300, height: 368 });
  });

  it('keeps a minimum sheet height on very short screens', () => {
    const placement = computeSheetPlacement({ top: 260 }, 320, 0);
    expect(placement.height).toBeGreaterThanOrEqual(220);
  });
});
