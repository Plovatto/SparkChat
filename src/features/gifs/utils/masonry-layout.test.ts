import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { gifColumnCount, isGridKey, layoutMasonry, moveInMasonry, tileAspectRatio } from './masonry-layout';

const square = { width: 100, height: 100 };
const tall = { width: 100, height: 200 };
const wide = { width: 200, height: 100 };

describe('layoutMasonry', () => {
  it('places each tile in the shortest column, leftmost first', () => {
    const layout = layoutMasonry([tall, square, square, square], 2);

    expect(layout.columns).toEqual([[0, 3], [1, 2]]);
    expect(layout.placements[2]).toEqual({ index: 2, column: 1, top: 1, height: 1 });
    expect(layout.placements[3]).toEqual({ index: 3, column: 0, top: 2, height: 1 });
  });

  it('reserves a clamped aspect ratio for every tile', () => {
    expect(tileAspectRatio(wide)).toBe(0.5);
    expect(tileAspectRatio({ width: 100, height: 1000 })).toBe(2.5);
    expect(tileAspectRatio({ width: 1000, height: 10 })).toBe(0.4);
    expect(tileAspectRatio({ width: 0, height: 0 })).toBe(1);
  });

  it('places every tile exactly once', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ width: fc.integer({ min: 1, max: 500 }), height: fc.integer({ min: 1, max: 500 }) }), { maxLength: 60 }),
        fc.integer({ min: 1, max: 4 }),
        (sizes, columnCount) => {
          const layout = layoutMasonry(sizes, columnCount);
          expect(layout.columns.flat().sort((a, b) => a - b)).toEqual(sizes.map((_, index) => index));
        },
      ),
    );
  });
});

describe('moveInMasonry', () => {
  const layout = layoutMasonry([tall, square, square, square, square], 2);

  it('moves up and down inside a column', () => {
    expect(moveInMasonry(layout, 1, 'ArrowDown')).toBe(2);
    expect(moveInMasonry(layout, 2, 'ArrowUp')).toBe(1);
    expect(moveInMasonry(layout, 1, 'ArrowUp')).toBeNull();
  });

  it('moves sideways to the tile closest in height', () => {
    expect(moveInMasonry(layout, 0, 'ArrowRight')).toBe(1);
    expect(moveInMasonry(layout, 2, 'ArrowLeft')).toBe(0);
    expect(moveInMasonry(layout, 3, 'ArrowRight')).toBe(4);
    expect(moveInMasonry(layout, 0, 'ArrowLeft')).toBeNull();
  });

  it('jumps to the first and last tiles', () => {
    expect(moveInMasonry(layout, 3, 'Home')).toBe(0);
    expect(moveInMasonry(layout, 0, 'End')).toBe(4);
    expect(moveInMasonry(layoutMasonry([], 2), 0, 'End')).toBeNull();
  });

  it('recognizes only navigation keys', () => {
    expect(isGridKey('ArrowDown')).toBe(true);
    expect(isGridKey('Enter')).toBe(false);
  });
});

describe('gifColumnCount', () => {
  it('uses two columns on a 360 px screen and more on wider panels', () => {
    expect(gifColumnCount(0)).toBe(2);
    expect(gifColumnCount(328)).toBe(2);
    expect(gifColumnCount(480)).toBe(3);
    expect(gifColumnCount(2000)).toBe(5);
  });
});
