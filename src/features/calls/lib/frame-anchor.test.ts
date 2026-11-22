import { describe, expect, it } from 'vitest';
import { frameInsets } from './frame-anchor';

describe('frameInsets', () => {
  it('anchors the floating call bar inside the rounded desktop frame', () => {
    expect(frameInsets({ right: 1260, bottom: 760 }, { width: 1280, height: 800 }, 16)).toEqual({ right: 36, bottom: 56 });
  });

  it('keeps the default placement when the frame fills the screen, as on phones', () => {
    expect(frameInsets({ right: 390, bottom: 844 }, { width: 390, height: 844 }, 16)).toBeNull();
  });

  it('ignores a frame that is not laid out yet', () => {
    expect(frameInsets({ right: 0, bottom: 0 }, { width: 1280, height: 800 }, 16)).toBeNull();
  });
});
