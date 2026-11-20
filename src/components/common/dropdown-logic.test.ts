import { describe, expect, it } from 'vitest';
import { moveActive, placeMenu, typeAhead } from './dropdown-logic';

const viewport = { width: 1280, height: 800 };

describe('placeMenu', () => {
  it('opens below the trigger when there is room', () => {
    const result = placeMenu({ trigger: { top: 100, bottom: 142, left: 40, width: 300 }, viewport, contentHeight: 200 });
    expect(result).toMatchObject({ placement: 'below', top: 148, left: 40, width: 300, maxHeight: 280 });
  });

  it('flips above when the space below is too small', () => {
    const result = placeMenu({ trigger: { top: 700, bottom: 742, left: 40, width: 300 }, viewport, contentHeight: 240 });
    expect(result.placement).toBe('above');
    expect(result.bottom).toBe(800 - 700 + 6);
    expect(result.maxHeight).toBe(280);
  });

  it('stays below when it is still the larger side', () => {
    const result = placeMenu({ trigger: { top: 60, bottom: 102, left: 0, width: 300 }, viewport: { width: 360, height: 220 }, contentHeight: 300 });
    expect(result.placement).toBe('below');
    expect(result.maxHeight).toBe(220 - 102 - 6 - 12);
  });

  it('keeps the menu inside a phone viewport', () => {
    const result = placeMenu({ trigger: { top: 100, bottom: 142, left: 4, width: 400 }, viewport: { width: 360, height: 640 }, contentHeight: 100 });
    expect(result.width).toBe(336);
    expect(result.left).toBe(12);
  });
});

describe('moveActive', () => {
  it('moves and clamps with the arrow keys', () => {
    expect(moveActive(3, 0, 'ArrowDown')).toBe(1);
    expect(moveActive(3, 2, 'ArrowDown')).toBe(2);
    expect(moveActive(3, 0, 'ArrowUp')).toBe(0);
    expect(moveActive(3, -1, 'ArrowUp')).toBe(2);
  });

  it('jumps with Home and End and ignores other keys', () => {
    expect(moveActive(3, 1, 'Home')).toBe(0);
    expect(moveActive(3, 1, 'End')).toBe(2);
    expect(moveActive(3, 1, 'a')).toBeNull();
    expect(moveActive(0, 0, 'ArrowDown')).toBeNull();
  });
});

describe('typeAhead', () => {
  const labels = ['Padrão', 'Microfone USB', 'Microfone interno', 'Headset'];

  it('finds the first label matching the typed prefix', () => {
    expect(typeAhead(labels, 0, 'micro')).toBe(1);
    expect(typeAhead(labels, 0, 'microfone i')).toBe(2);
    expect(typeAhead(labels, 0, 'H')).toBe(3);
  });

  it('cycles through matches when the same letter is repeated', () => {
    expect(typeAhead(labels, 1, 'm')).toBe(2);
    expect(typeAhead(labels, 2, 'mm')).toBe(1);
  });

  it('returns null without a match', () => {
    expect(typeAhead(labels, 0, 'zzz')).toBeNull();
    expect(typeAhead(labels, 0, '')).toBeNull();
  });
});
