import { describe, expect, test } from 'vitest';
import { GRID } from '../src/sim/types';
import { blankTile, idx, inBounds, neighbors4, tilesWithin } from '../src/sim/grid';

describe('grid', () => {
  test('idx maps (x,y) to row-major index', () => {
    expect(idx(0, 0)).toBe(0);
    expect(idx(1, 0)).toBe(1);
    expect(idx(0, 1)).toBe(GRID);
    expect(idx(GRID - 1, GRID - 1)).toBe(GRID * GRID - 1);
  });

  test('inBounds covers edges only', () => {
    expect(inBounds(0, 0)).toBe(true);
    expect(inBounds(GRID - 1, GRID - 1)).toBe(true);
    expect(inBounds(-1, 0)).toBe(false);
    expect(inBounds(0, GRID)).toBe(false);
  });

  test('neighbors4 clips at corners and is full in the interior', () => {
    expect(neighbors4(0, 0)).toHaveLength(2);
    expect(neighbors4(5, 5)).toHaveLength(4);
    expect(neighbors4(GRID - 1, 0)).toHaveLength(2);
  });

  test('tilesWithin uses Chebyshev distance and clips at borders', () => {
    expect(tilesWithin(5, 5, 1)).toHaveLength(9);
    expect(tilesWithin(5, 5, 2)).toHaveLength(25);
    expect(tilesWithin(0, 0, 1)).toHaveLength(4);
  });

  test('blankTile starts unzoned and unpowered', () => {
    const t = blankTile();
    expect(t.zone).toBe(0);
    expect(t.stage).toBe(0);
    expect(t.powered).toBe(false);
    expect(t.abandoned).toBe(false);
  });
});
