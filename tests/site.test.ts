import { describe, expect, test } from 'vitest';
import { idx } from '../src/sim/grid';
import { Zone } from '../src/sim/types';
import { partners, siteOf, streetSide, terraceBand } from '../src/render/site';
import { makeCity, road, zone } from './helpers';

/** A street along y = 10 with a row of five stage-2 houses on its south side (x 12..16, y 11). */
function row(stage: 1 | 2 | 3 = 2) {
  const city = makeCity();
  road(city, 10, 10, 30, 10);
  for (let x = 12; x <= 16; x++) zone(city, x, 11, Zone.Residential, stage, 2);
  return city;
}
const at = (x: number, y: number) => idx(x, y);

describe('site', () => {
  test('the band: houses to stage 3, shops to stage 4, nothing industrial', () => {
    expect([1, 2, 3, 4].map((s) => terraceBand(Zone.Residential, s as 1))).toEqual([true, true, true, false]);
    expect([1, 4, 5].map((s) => terraceBand(Zone.Commercial, s as 1))).toEqual([true, true, false]);
    expect(terraceBand(Zone.Industrial, 1)).toBe(false);
    expect(terraceBand(Zone.Residential, 0)).toBe(false);
  });

  test('a row south of a street: the road is on grid side north, partners east and west', () => {
    const city = row();
    expect(streetSide(city, at(14, 11))).toBe(0);
    // quarter 0: screen side = grid side; party bits on E (1) and W (3)
    expect(siteOf(city, at(14, 11), 0, 0)).toEqual({ side: 0, corner: -1, party: (1 << 1) | (1 << 3) });
    expect(siteOf(city, at(12, 11), 0, 0).party).toBe(1 << 1); // west end: a partner east only
    expect(siteOf(city, at(16, 11), 0, 0).party).toBe(1 << 3); // east end
  });

  test('a quarter turn moves every bit on by one, the way roadSideOf does', () => {
    const city = row();
    for (let q = 0; q < 4; q++) {
      const s = siteOf(city, at(14, 11), q, q);
      expect(s.party).toBe((1 << ((1 + q) % 4)) | (1 << ((3 + q) % 4)));
      expect(siteOf(city, at(12, 11), q, q).party).toBe(1 << ((1 + q) % 4));
    }
  });

  test('no partner across a difference in band, tier, zone, standing, or street', () => {
    const base = row();
    expect(partners(base, at(13, 11), at(14, 11))).toBe(true);
    let city = row();
    city.tiles[at(14, 11)].stage = 3; // another stage in the band still joins
    expect(partners(city, at(13, 11), at(14, 11))).toBe(true);
    city.tiles[at(14, 11)].stage = 4; // past the band does not
    expect(partners(city, at(13, 11), at(14, 11))).toBe(false);
    city = row();
    city.tiles[at(14, 11)].tier = 1;
    expect(partners(city, at(13, 11), at(14, 11))).toBe(false);
    city = row();
    city.tiles[at(14, 11)].zone = Zone.Commercial;
    expect(partners(city, at(13, 11), at(14, 11))).toBe(false);
    city = row();
    city.tiles[at(14, 11)].abandoned = true;
    expect(partners(city, at(13, 11), at(14, 11))).toBe(false);
    city = row();
    city.tiles[at(14, 11)].grew = 0; // still a building site
    expect(partners(city, at(13, 11), at(14, 11))).toBe(false);
    // a lot whose street is two tiles away has no side and joins nothing
    city = row();
    zone(city, 13, 12, Zone.Residential, 2, 2);
    zone(city, 14, 12, Zone.Residential, 2, 2);
    expect(streetSide(city, at(13, 12))).toBe(-1);
    expect(partners(city, at(13, 12), at(14, 12))).toBe(false);
    // neighbours across the street are not along it
    zone(city, 14, 9, Zone.Residential, 2, 2);
    expect(partners(city, at(14, 11), at(14, 9))).toBe(false);
  });

  test('bulldozing a partner drops the bit on the next call', () => {
    const city = row();
    expect(siteOf(city, at(13, 11), 0, 0).party).toBe((1 << 1) | (1 << 3));
    city.tiles[at(14, 11)].zone = Zone.None;
    city.tiles[at(14, 11)].stage = 0;
    expect(siteOf(city, at(13, 11), 0, 0).party).toBe(1 << 3);
  });

  test('a corner names the side of its second road; a road behind is not a corner', () => {
    const city = row();
    road(city, 11, 10, 11, 14); // a side street down the west end
    expect(siteOf(city, at(12, 11), 0, 0).corner).toBe(3); // the side street is to its west
    expect(siteOf(city, at(12, 11), 1, 1).corner).toBe(0); // a quarter on, the west is screen north
    expect(siteOf(city, at(13, 11), 0, 0).corner).toBe(-1);
    // the corner lot still joins the row along its street
    expect(siteOf(city, at(12, 11), 0, 0).party).toBe(1 << 1);
    const across = row();
    road(across, 10, 12, 30, 12); // a parallel street behind the row
    expect(siteOf(across, at(14, 11), 0, 0).corner).toBe(-1);
  });

  test('a stage-5 shop is past the band', () => {
    const city = makeCity();
    road(city, 10, 10, 30, 10);
    zone(city, 14, 11, Zone.Commercial, 5, 2);
    zone(city, 15, 11, Zone.Commercial, 5, 2);
    expect(partners(city, at(14, 11), at(15, 11))).toBe(false);
  });
});
