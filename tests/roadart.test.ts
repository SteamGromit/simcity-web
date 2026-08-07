import { describe, expect, test } from 'vitest';
import { SIDE_DIRS, SIDE_MID, roadMask } from '../src/render/roadart';
import { newCity } from '../src/sim/city';
import { GRID, Zone } from '../src/sim/types';
import { idx } from '../src/sim/grid';
import { TILE_H, TILE_W, isoToScreen, setViewAngle } from '../src/render/iso';

function bareCity() {
  const city = newCity(7);
  for (const t of city.tiles) {
    t.zone = Zone.None;
    t.elevation = 0;
    t.median = false;
  }
  return city;
}

function road(city: ReturnType<typeof bareCity>, x: number, y: number) {
  const t = city.tiles[idx(x, y)];
  t.zone = Zone.Road;
  return t;
}

describe('roadMask', () => {
  test('an isolated stub connects to nothing', () => {
    const city = bareCity();
    road(city, 10, 10);
    expect(roadMask(city, 10, 10)).toBe(0);
  });

  test('each side sets its own bit', () => {
    for (let k = 0; k < 4; k++) {
      const city = bareCity();
      road(city, 10, 10);
      const [dx, dy] = SIDE_DIRS[k];
      road(city, 10 + dx, 10 + dy);
      expect(roadMask(city, 10, 10)).toBe(1 << k);
    }
  });

  test('a crossroads connects on all four sides', () => {
    const city = bareCity();
    road(city, 10, 10);
    for (const [dx, dy] of SIDE_DIRS) road(city, 10 + dx, 10 + dy);
    expect(roadMask(city, 10, 10)).toBe(0b1111);
  });

  test('a planted median is landscaping, not a lane, so nothing connects to it', () => {
    const city = bareCity();
    road(city, 10, 10);
    road(city, 11, 10).median = true;
    expect(roadMask(city, 10, 10)).toBe(0);
  });

  test('a road cannot connect across more than one level of climb', () => {
    const city = bareCity();
    road(city, 10, 10);
    const up = road(city, 11, 10);
    up.elevation = 1;
    expect(roadMask(city, 10, 10)).toBe(0b0010);
    up.elevation = 2; // a cliff, not a ramp
    expect(roadMask(city, 10, 10)).toBe(0);
  });

  test('the map edge is never a connection', () => {
    const city = bareCity();
    road(city, 0, 0);
    road(city, 1, 0);
    road(city, 0, 1);
    // north and west run off the map; east and south are real
    expect(roadMask(city, 0, 0)).toBe(0b0110);
  });

  test('a full grid row reports straight-through everywhere but the ends', () => {
    const city = bareCity();
    for (let x = 5; x <= 15; x++) road(city, x, 20);
    for (let x = 6; x <= 14; x++) expect(roadMask(city, x, 20)).toBe(0b1010);
    expect(roadMask(city, 5, 20)).toBe(0b0010);
    expect(roadMask(city, 15, 20)).toBe(0b1000);
  });

  test('only roads count — a zoned lot beside a street is not a junction', () => {
    const city = bareCity();
    road(city, 10, 10);
    city.tiles[idx(11, 10)].zone = Zone.Residential;
    expect(roadMask(city, 10, 10)).toBe(0);
  });
});

describe('side geometry', () => {
  test('every side midpoint matches where that neighbour actually is', () => {
    setViewAngle(0);
    const centre = isoToScreen(10.5, 10.5);
    for (let k = 0; k < 4; k++) {
      const [dx, dy] = SIDE_DIRS[k];
      const shared = isoToScreen(10.5 + dx / 2, 10.5 + dy / 2);
      expect(SIDE_MID[k][0]).toBeCloseTo(shared.sx - centre.sx, 6);
      expect(SIDE_MID[k][1]).toBeCloseTo(shared.sy - centre.sy, 6);
    }
  });

  test('the midpoints sit on the tile diamond, half a tile from the centre', () => {
    for (const [mx, my] of SIDE_MID) {
      expect(Math.abs(mx) / (TILE_W / 2) + Math.abs(my) / (TILE_H / 2)).toBeCloseTo(1, 6);
    }
  });

  test('opposite sides are exact mirrors, so a straight road draws straight', () => {
    for (let k = 0; k < 2; k++) {
      expect(SIDE_MID[k][0]).toBeCloseTo(-SIDE_MID[k + 2][0], 6);
      expect(SIDE_MID[k][1]).toBeCloseTo(-SIDE_MID[k + 2][1], 6);
    }
  });

  test('the mask never exceeds the grid', () => {
    const city = bareCity();
    road(city, GRID - 1, GRID - 1);
    expect(() => roadMask(city, GRID - 1, GRID - 1)).not.toThrow();
  });
});
