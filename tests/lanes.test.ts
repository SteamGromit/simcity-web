import { describe, expect, test } from 'vitest';
import { canEnter, laneStep, nextRoad } from '../src/render/automata';
import { idx } from '../src/sim/grid';
import type { RoadClass } from '../src/sim/roads';
import { CityState, Zone } from '../src/sim/types';
import { makeCity } from './helpers';

function slab(city: CityState, x0: number, y0: number, x1: number, y1: number, cls: RoadClass) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const t = city.tiles[idx(x, y)];
      t.zone = Zone.Road;
      t.road = cls;
      t.median = false;
      t.traffic = 4;
    }
  }
}

/** A four-lane highway running east–west across rows 20..23. */
function highway(): CityState {
  const city = makeCity();
  slab(city, 10, 20, 40, 23, 3);
  return city;
}

describe('laneStep', () => {
  test('the northern lanes of an east–west highway run west', () => {
    const city = highway();
    for (const y of [20, 21]) {
      expect(laneStep(city, idx(25, y))).toBe(idx(24, y));
    }
  });

  test('the southern lanes run east — traffic keeps right', () => {
    const city = highway();
    for (const y of [22, 23]) {
      expect(laneStep(city, idx(25, y))).toBe(idx(26, y));
    }
  });

  test('a lane never wanders across the carriageway', () => {
    const city = highway();
    for (let y = 20; y <= 23; y++) {
      const next = laneStep(city, idx(25, y));
      expect((next / 96) | 0).toBe(y); // same row: it moved along, not across
    }
  });

  test('a north–south highway runs south on the west side and north on the east', () => {
    const city = makeCity();
    slab(city, 20, 10, 23, 40, 3);
    expect(laneStep(city, idx(20, 25))).toBe(idx(20, 26)); // west lane, southbound
    expect(laneStep(city, idx(23, 25))).toBe(idx(23, 24)); // east lane, northbound
  });

  test('the carriageway ending hands the car back to ordinary routing', () => {
    const city = highway();
    // the westbound lanes run off the western end of the band
    expect(laneStep(city, idx(10, 20))).toBe(-1);
    // and the eastbound ones off the eastern end
    expect(laneStep(city, idx(40, 23))).toBe(-1);
  });

  test('a plain street has no lane to follow', () => {
    const city = makeCity();
    slab(city, 10, 30, 40, 30, 0);
    expect(laneStep(city, idx(25, 30))).toBe(-1);
  });

  test("a boulevard's carriageways run opposite ways around the median", () => {
    const city = makeCity();
    slab(city, 10, 20, 40, 22, 2);
    for (let x = 10; x <= 40; x++) city.tiles[idx(x, 21)].median = true;
    expect(laneStep(city, idx(25, 20))).toBe(idx(24, 20));
    expect(laneStep(city, idx(25, 22))).toBe(idx(26, 22));
  });
});

describe('canEnter', () => {
  test('nothing drives the wrong way up a motorway', () => {
    const city = highway();
    // row 20 is westbound, so approaching it head-on from the west is refused
    expect(canEnter(city, idx(24, 20), idx(25, 20))).toBe(false);
    // and going with it is fine
    expect(canEnter(city, idx(26, 20), idx(25, 20))).toBe(true);
  });

  test('merging across from the side is allowed — that is how you get on', () => {
    const city = highway();
    city.tiles[idx(25, 19)].zone = Zone.Road; // a street touching the north edge
    expect(canEnter(city, idx(25, 19), idx(25, 20))).toBe(true);
  });

  test('changing lanes within the carriageway stays allowed', () => {
    const city = highway();
    expect(canEnter(city, idx(25, 20), idx(25, 21))).toBe(true);
  });

  test('an ordinary street takes traffic from any direction', () => {
    const city = makeCity();
    slab(city, 10, 30, 40, 30, 0);
    expect(canEnter(city, idx(24, 30), idx(25, 30))).toBe(true);
    expect(canEnter(city, idx(26, 30), idx(25, 30))).toBe(true);
  });
});

describe('nextRoad', () => {
  const always = (v: number) => () => v;

  test('on a carriageway the lane decides, whatever the dice say', () => {
    const city = highway();
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
      expect(nextRoad(city, idx(25, 20), -1, always(r))).toBe(idx(24, 20));
      expect(nextRoad(city, idx(25, 23), -1, always(r))).toBe(idx(26, 23));
    }
  });

  test('a car does not double back along its own lane', () => {
    const city = highway();
    // arriving at (25,20) from the east, the lane still sends it west
    expect(nextRoad(city, idx(25, 20), idx(26, 20), always(0.5))).toBe(idx(24, 20));
  });

  test('at the end of the carriageway it takes what is there', () => {
    const city = highway();
    city.tiles[idx(9, 20)].zone = Zone.Road; // a street off the western end
    city.tiles[idx(9, 20)].road = 0;
    const out = nextRoad(city, idx(10, 20), idx(11, 20), always(0.5));
    expect(out).toBe(idx(9, 20));
  });

  test('on a street it still picks among the neighbours at random', () => {
    const city = makeCity();
    slab(city, 10, 30, 40, 30, 0);
    const seen = new Set<number>();
    for (const r of [0, 0.9]) seen.add(nextRoad(city, idx(25, 30), -1, always(r)));
    expect(seen.size).toBe(2); // east and west were both reachable
  });

  test('a dead end turns the car around rather than stranding it', () => {
    const city = makeCity();
    city.tiles[idx(25, 30)].zone = Zone.Road;
    city.tiles[idx(26, 30)].zone = Zone.Road;
    expect(nextRoad(city, idx(25, 30), idx(26, 30), always(0.5))).toBe(idx(26, 30));
  });

  test('an isolated tile has nowhere to send anyone', () => {
    const city = makeCity();
    city.tiles[idx(25, 30)].zone = Zone.Road;
    expect(nextRoad(city, idx(25, 30), -1, always(0.5))).toBe(-1);
  });

  test('it never returns a tile that is not drivable', () => {
    const city = highway();
    city.tiles[idx(30, 21)].median = true; // a stray median in the carriageway
    for (let y = 20; y <= 23; y++) {
      for (let x = 11; x < 40; x++) {
        const out = nextRoad(city, idx(x, y), -1, always(0.3));
        if (out === -1) continue;
        const t = city.tiles[out];
        expect(t.zone).toBe(Zone.Road);
        expect(t.median).toBe(false);
      }
    }
  });
});
