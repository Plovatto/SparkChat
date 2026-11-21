import { describe, expect, it } from 'vitest';
import { EMOJI_CELL_TOUCH, EMOJI_PANEL_PADDING, emojiColumnsFor, emojiSheetHeight, emojiSheetWidth, shouldDismissSheet } from './picker-layout';

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
});
