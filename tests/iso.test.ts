import { describe, expect, test } from 'vitest';
import {
  TILE_H,
  TILE_W,
  isoToScreen,
  projectAt,
  screenToIso,
  setViewAngle,
  unprojectAt,
} from '../src/render/iso';

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

describe('rotated projection', () => {
  test('unprojectAt inverts projectAt at arbitrary angles', () => {
    for (const angle of [0, 0.4, Math.PI / 2, 2.1, Math.PI, 5.5]) {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      for (const [x, y] of [
        [0, 0],
        [5.5, 3.25],
        [63, 63],
      ]) {
        const { sx, sy } = projectAt(x, y, cos, sin);
        const inv = unprojectAt(sx, sy, cos, sin);
        expect(inv.x).toBeCloseTo(x, 6);
        expect(inv.y).toBeCloseTo(y, 6);
      }
    }
  });

  test('a 90° view rotation maps +x onto the old +y direction', () => {
    const cos = Math.cos(Math.PI / 2);
    const sin = Math.sin(Math.PI / 2);
    const rotated = projectAt(1, 0, cos, sin);
    const straight = projectAt(0, 1, 1, 0);
    expect(rotated.sx).toBeCloseTo(straight.sx, 6);
    expect(rotated.sy).toBeCloseTo(straight.sy, 6);
  });

  test('setViewAngle steers the module-level transform and 0 restores it', () => {
    setViewAngle(Math.PI / 4);
    const rotated = isoToScreen(10, 10);
    setViewAngle(0);
    const straight = isoToScreen(10, 10);
    expect(rotated.sy).not.toBeCloseTo(straight.sy, 1);
    expect(straight).toEqual({ sx: 0, sy: 10 * TILE_H });
  });
});
