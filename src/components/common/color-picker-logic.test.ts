import { describe, expect, it } from 'vitest';
import { hexToHsv, hexToRgb, hsvToHex, hueToHex, moveInArea, normalizeHex, nudgeArea, placePopover, rgbToHex } from './color-picker-logic';

describe('normalizeHex', () => {
  it('accepts 3 and 6 digit values with or without the hash', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc');
    expect(normalizeHex('4a4fc9')).toBe('#4a4fc9');
    expect(normalizeHex('  #FFFFFF ')).toBe('#ffffff');
  });

  it('rejects anything else', () => {
    expect(normalizeHex('')).toBeNull();
    expect(normalizeHex('#12')).toBeNull();
    expect(normalizeHex('#12345')).toBeNull();
    expect(normalizeHex('#gggggg')).toBeNull();
    expect(normalizeHex('rgb(1,2,3)')).toBeNull();
  });
});

describe('color conversions', () => {
  it('converts hex to rgb and back', () => {
    expect(hexToRgb('#272338')).toEqual({ r: 39, g: 35, b: 56 });
    expect(rgbToHex({ r: 39, g: 35, b: 56 })).toBe('#272338');
    expect(rgbToHex({ r: 300, g: -4, b: 12.4 })).toBe('#ff000c');
  });

  it('round trips common colors through hsv', () => {
    for (const hex of ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#4a4fc9', '#7e39a8', '#f5c46a', '#272338']) {
      expect(hsvToHex(hexToHsv(hex))).toBe(hex);
    }
  });

  it('computes the pure hue color', () => {
    expect(hueToHex(0)).toBe('#ff0000');
    expect(hueToHex(120)).toBe('#00ff00');
    expect(hueToHex(240)).toBe('#0000ff');
    expect(hueToHex(360)).toBe('#ff0000');
  });

  it('keeps the hue of grey colors at zero saturation', () => {
    expect(hexToHsv('#808080').s).toBe(0);
    expect(hexToHsv('#000000').v).toBe(0);
  });
});

describe('area interaction', () => {
  const area = { left: 100, top: 50, width: 200, height: 100 };

  it('maps pointer positions to saturation and value and clamps outside', () => {
    expect(moveInArea(area, 100, 50)).toEqual({ s: 0, v: 1 });
    expect(moveInArea(area, 300, 150)).toEqual({ s: 1, v: 0 });
    expect(moveInArea(area, 200, 100)).toEqual({ s: 0.5, v: 0.5 });
    expect(moveInArea(area, -50, 999)).toEqual({ s: 0, v: 0 });
  });

  it('nudges with the arrow keys and ignores others', () => {
    expect(nudgeArea({ s: 0.5, v: 0.5 }, 'ArrowRight', 0.1)).toEqual({ s: 0.6, v: 0.5 });
    expect(nudgeArea({ s: 0.05, v: 0.5 }, 'ArrowLeft', 0.1)).toEqual({ s: 0, v: 0.5 });
    expect(nudgeArea({ s: 0.5, v: 0.95 }, 'ArrowUp', 0.1)).toEqual({ s: 0.5, v: 1 });
    expect(nudgeArea({ s: 0.5, v: 0.5 }, 'Enter', 0.1)).toBeNull();
  });
});

describe('placePopover', () => {
  const size = { width: 280, height: 360 };
  const viewport = { width: 1000, height: 800 };

  it('opens below the trigger when there is room', () => {
    const placement = placePopover({ left: 100, top: 100, right: 124, bottom: 124 }, size, viewport);
    expect(placement.top).toBe(132);
    expect(placement.left).toBe(100);
    expect(placement.origin).toBe('top left');
  });

  it('flips above when the space below is too small', () => {
    const placement = placePopover({ left: 100, top: 700, right: 124, bottom: 724 }, size, viewport);
    expect(placement.top).toBe(700 - 8 - 360);
    expect(placement.origin).toBe('bottom left');
  });

  it('keeps the popover inside the viewport horizontally', () => {
    const placement = placePopover({ left: 950, top: 100, right: 974, bottom: 124 }, size, viewport);
    expect(placement.left).toBe(1000 - 12 - 280);
  });
});
