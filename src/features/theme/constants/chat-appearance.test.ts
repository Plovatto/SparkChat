import { describe, expect, it } from 'vitest';
import { blurToPercent, hasWallpaperOverlay } from './chat-appearance';

describe('blurToPercent', () => {
  it('maps the blur range to a percentage', () => {
    expect(blurToPercent(0, 'overlayBlur')).toBe(0);
    expect(blurToPercent(9, 'overlayBlur')).toBe(45);
    expect(blurToPercent(20, 'bubbleBlur')).toBe(100);
  });
});

describe('hasWallpaperOverlay', () => {
  it('keeps the overlay for blur even with no dimming', () => {
    expect(hasWallpaperOverlay(true, { overlayOpacity: 0, overlayBlur: 9 })).toBe(true);
  });

  it('skips the overlay when there is nothing to apply or no image', () => {
    expect(hasWallpaperOverlay(true, { overlayOpacity: 0, overlayBlur: 0 })).toBe(false);
    expect(hasWallpaperOverlay(false, { overlayOpacity: 40, overlayBlur: 9 })).toBe(false);
  });
});
