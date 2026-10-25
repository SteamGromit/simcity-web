import { describe, expect, test } from 'vitest';
import { GRID, MAX_ELEV, Terrain } from '../src/sim/types';
import { blankTile } from '../src/sim/grid';
import {
  fillTerrain,
  rolledBiome,
  singleWorld,
  terrainAt,
  TILE_MARGINS,
  type World,
} from '../src/sim/terrain';

function tileOf(world: World, col: number, row: number) {
  const tiles = Array.from({ length: GRID * GRID }, blankTile);
  fillTerrain(tiles, world, col, row);
  return tiles;
}
const at = (tiles: ReturnType<typeof tileOf>, x: number, y: number) => tiles[y * GRID + x];

describe('terrainAt', () => {
  test('is pure', () => {
    const w: World = { seed: 11, cols: 3, rows: 3, biome: 'temperate' };
    expect(terrainAt(w, 150, 77)).toEqual(terrainAt(w, 150, 77));
  });

  test('the border is no more of a seam than any other column pair', () => {
    // Two tiles sample one field, so a shoreline may cross the border, but
    // the border must not be special: the pair of columns either side of it
    // disagrees no more often than a pair wholly inside one tile.
    const w: World = { seed: 11, cols: 2, rows: 1, biome: 'temperate' };
    const a = tileOf(w, 0, 0);
    const b = tileOf(w, 1, 0);
    let seam = 0;
    let inside = 0;
    for (let y = 0; y < GRID; y++) {
      const ea = at(a, GRID - 1, y);
      const eb = at(b, 0, y);
      expect(Math.abs(ea.elevation - eb.elevation)).toBeLessThanOrEqual(1);
      if ((ea.terrain === Terrain.Water) !== (eb.terrain === Terrain.Water)) seam++;
      const ia = at(a, GRID - 2, y);
      if ((ia.terrain === Terrain.Water) !== (ea.terrain === Terrain.Water)) inside++;
    }
    expect(seam).toBeLessThanOrEqual(inside + 3);
  });

  test('a temperate river reaches both edges of the world along its axis', () => {
    const w: World = { seed: 4, cols: 3, rows: 3, biome: 'temperate' };
    const W = 3 * GRID;
    const column = (wx: number) =>
      Array.from({ length: W }, (_, wy) => terrainAt(w, wx, wy).terrain).filter(
        (t) => t === Terrain.Water,
      ).length;
    const rowOf = (wy: number) =>
      Array.from({ length: W }, (_, wx) => terrainAt(w, wx, wy).terrain).filter(
        (t) => t === Terrain.Water,
      ).length;
    const horizontal = column(0) > 0 && column(W - 1) > 0;
    const vertical = rowOf(0) > 0 && rowOf(W - 1) > 0;
    expect(horizontal || vertical).toBe(true);
  });

  test('every tile has a true peak, and none near a border', () => {
    const w: World = { seed: 9, cols: 2, rows: 2, biome: 'temperate' };
    for (const [c, r] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ]) {
      const t = tileOf(w, c, r);
      expect(Math.max(...t.map((k) => k.elevation))).toBe(MAX_ELEV);
      for (let y = 0; y < GRID; y++) {
        for (let x = 0; x < GRID; x++) {
          const edge = Math.min(x, y, GRID - 1 - x, GRID - 1 - y);
          if (edge < 10) expect(at(t, x, y).elevation).toBeLessThanOrEqual(3);
        }
      }
    }
  });

  test('per-tile terms cannot reach a border: the margins are pinned', () => {
    expect(TILE_MARGINS.reach).toBeLessThan(TILE_MARGINS.centreMin);
  });

  test('every tile of a 3×3 world has a summit, over several seeds', () => {
    for (const seed of [1, 2, 3, 5, 8, 13]) {
      const w: World = { seed, cols: 3, rows: 3, biome: 'temperate' };
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const t = tileOf(w, c, r);
          expect(Math.max(...t.map((k) => k.elevation)), `seed ${seed} tile ${c},${r}`).toBe(MAX_ELEV);
        }
      }
    }
  });

  test('water and forest fractions stay in range over many seeds', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const biome = rolledBiome(seed);
      const t = tileOf(singleWorld(seed, biome), 0, 0);
      const water = t.filter((k) => k.terrain === Terrain.Water).length / t.length;
      const forest = t.filter((k) => k.terrain === Terrain.Forest).length / t.length;
      if (biome === 'temperate') {
        expect(water, `seed ${seed} water`).toBeGreaterThanOrEqual(0.015);
        expect(water, `seed ${seed} water`).toBeLessThanOrEqual(0.1);
        expect(forest, `seed ${seed} forest`).toBeGreaterThanOrEqual(60 / t.length);
      } else {
        expect(water, `seed ${seed} water`).toBeGreaterThanOrEqual(0.002);
        expect(water, `seed ${seed} water`).toBeLessThanOrEqual(0.05);
      }
    }
  });

  test('adjacent steps are at most 2 levels', () => {
    const t = tileOf(singleWorld(7, 'temperate'), 0, 0);
    for (let y = 0; y < GRID - 1; y++) {
      for (let x = 0; x < GRID - 1; x++) {
        expect(
          Math.abs(at(t, x, y).elevation - at(t, x + 1, y).elevation),
        ).toBeLessThanOrEqual(2);
        expect(
          Math.abs(at(t, x, y).elevation - at(t, x, y + 1).elevation),
        ).toBeLessThanOrEqual(2);
      }
    }
  });
});
