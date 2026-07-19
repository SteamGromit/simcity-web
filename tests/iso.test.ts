import { describe, expect, test } from 'vitest';
import { TILE_H, TILE_W, isoToScreen, screenToIso } from '../src/render/iso';

describe('iso transforms', () => {
  test('origin tile maps to origin', () => {
    expect(isoToScreen(0, 0)).toEqual({ sx: 0, sy: 0 });
  });

  test('+x goes right-down, +y goes left-down', () => {
    expect(isoToScreen(1, 0)).toEqual({ sx: TILE_W / 2, sy: TILE_H / 2 });
    expect(isoToScreen(0, 1)).toEqual({ sx: -TILE_W / 2, sy: TILE_H / 2 });
  });

  test('screenToIso inverts isoToScreen', () => {
    for (const [x, y] of [
      [0, 0],
      [5, 3],
      [63, 63],
      [10, 40],
    ]) {
      const { sx, sy } = isoToScreen(x, y);
      const inv = screenToIso(sx, sy);
      expect(inv.x).toBeCloseTo(x, 6);
      expect(inv.y).toBeCloseTo(y, 6);
    }
  });
});
