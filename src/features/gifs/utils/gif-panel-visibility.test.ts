import { describe, expect, it } from 'vitest';
import { keepGifPanelOpen } from './gif-panel-visibility';

describe('keepGifPanelOpen', () => {
  it('closes the panel as soon as the composer has text', () => {
    expect(keepGifPanelOpen(true, 'oi')).toBe(false);
    expect(keepGifPanelOpen(true, '   ')).toBe(true);
    expect(keepGifPanelOpen(true, '')).toBe(true);
    expect(keepGifPanelOpen(false, '')).toBe(false);
  });
});
