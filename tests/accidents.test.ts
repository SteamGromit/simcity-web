import { beforeEach, describe, expect, test } from 'vitest';
import { resetRegistry } from '../src/content/registry';
import { ensureCoreContent } from '../src/sim/content';
import { idx } from '../src/sim/grid';
import { accidentDuration, accidentRoll, updateAccidents } from '../src/sim/accidents';
import { updateTraffic } from '../src/sim/traffic';
import { adviseTips } from '../src/sim/tips';
import { CityState, Zone } from '../src/sim/types';
import { clearLand, makeCity, zone } from './helpers';

function base(): CityState {
  const city = makeCity();
  clearLand(city);
  return city;
}

/** A road tile carrying some traffic. */
function busyRoad(city: CityState, x: number, y: number, traffic = 30): void {
  zone(city, x, y, Zone.Road);
  city.tiles[idx(x, y)].traffic = traffic;
}

/** Roll many months and count how many accidents landed on (x,y). */
function countRolls(city: CityState, x: number, y: number, seeds: number): number {
  let n = 0;
  for (let s = 0; s < seeds; s++) {
    city.tiles[idx(x, y)].accident = 0;
    let k = s * 2654435761;
    const rand = () => {
      k = (k + 0x6d2b79f5) | 0;
      let t = Math.imul(k ^ (k >>> 15), 1 | k);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    accidentRoll(city, rand);
    if (city.tiles[idx(x, y)].accident > 0) n++;
  }
  return n;
}

beforeEach(() => {
  resetRegistry();
  ensureCoreContent();
});

describe('accidents roll on busy roads', () => {
  test('a road with no traffic never has an accident', () => {
    const city = base();
    zone(city, 10, 10, Zone.Road); // traffic 0
    for (let s = 0; s < 200; s++) accidentRoll(city, () => 0); // always-fires rng
    expect(city.tiles[idx(10, 10)].accident).toBe(0);
  });

  test('a busy road can throw one', () => {
    const city = base();
    busyRoad(city, 10, 10, 40);
    accidentRoll(city, () => 0); // a roll of 0 clears any threshold
    expect(city.tiles[idx(10, 10)].accident).toBeGreaterThan(0);
  });

  test('heavier traffic means more accidents', () => {
    const light = base();
    busyRoad(light, 10, 10, 6);
    const heavy = base();
    busyRoad(heavy, 10, 10, 40);
    expect(countRolls(heavy, 10, 10, 300)).toBeGreaterThan(countRolls(light, 10, 10, 300));
  });

  test('Driver Education makes them rarer', () => {
    const plain = base();
    busyRoad(plain, 10, 10, 30);
    const plainCount = countRolls(plain, 10, 10, 300);

    const safe = base();
    busyRoad(safe, 10, 10, 30);
    safe.ordinances['driverEd'] = true;
    expect(countRolls(safe, 10, 10, 300)).toBeLessThan(plainCount);
  });
});

describe('how long a wreck blocks the road', () => {
  test('fire coverage at the scene shortens it', () => {
    const city = base();
    busyRoad(city, 10, 10, 30);
    const bare = accidentDuration(city, idx(10, 10));
    city.tiles[idx(10, 10)].fireCov = 1;
    expect(accidentDuration(city, idx(10, 10))).toBeLessThan(bare);
  });

  test('the EMT Program shortens it, and stacks with fire coverage', () => {
    const city = base();
    busyRoad(city, 10, 10, 30);
    city.tiles[idx(10, 10)].fireCov = 0.5;
    const withoutEmt = accidentDuration(city, idx(10, 10));
    city.ordinances['emt'] = true;
    const withEmt = accidentDuration(city, idx(10, 10));
    expect(withEmt).toBeLessThan(withoutEmt);
  });

  test('updateAccidents counts a block down to clear', () => {
    const city = base();
    city.tiles[idx(10, 10)].zone = Zone.Road;
    city.tiles[idx(10, 10)].accident = 3;
    updateAccidents(city);
    expect(city.tiles[idx(10, 10)].accident).toBe(2);
    updateAccidents(city);
    updateAccidents(city);
    expect(city.tiles[idx(10, 10)].accident).toBe(0);
  });
});

describe('a blocked road reroutes traffic', () => {
  const home = (city: CityState, x: number, y: number) => {
    zone(city, x, y, Zone.Residential);
    city.tiles[idx(x, y)].stage = 2 as never;
  };
  const job = (city: CityState, x: number, y: number) => {
    zone(city, x, y, Zone.Commercial);
    city.tiles[idx(x, y)].stage = 2 as never;
  };

  /** A road rectangle: a home on the left, a job on the right, two ways round. */
  function twoRouteCity(): CityState {
    const city = base();
    home(city, 4, 10);
    job(city, 16, 10);
    for (let x = 5; x <= 15; x++) { zone(city, x, 9, Zone.Road); zone(city, x, 11, Zone.Road); }
    for (let y = 9; y <= 11; y++) { zone(city, 5, y, Zone.Road); zone(city, 15, y, Zone.Road); }
    return city;
  }

  test('blocking one of two routes keeps commutes finite', () => {
    const city = twoRouteCity();
    updateTraffic(city);
    expect(Number.isFinite(city.tiles[idx(4, 10)].commute)).toBe(true);

    for (let x = 6; x <= 14; x++) city.tiles[idx(x, 9)].accident = 10; // close the north road
    updateTraffic(city);
    expect(Number.isFinite(city.tiles[idx(4, 10)].commute)).toBe(true); // rerouted south
  });

  /** A single straight road, home to job, no alternative. */
  function oneRouteCity(): CityState {
    const city = base();
    home(city, 4, 10);
    job(city, 16, 10);
    for (let x = 5; x <= 15; x++) zone(city, x, 10, Zone.Road);
    return city;
  }

  test('blocking the only route breaks the commute, then it heals', () => {
    const city = oneRouteCity();
    updateTraffic(city);
    expect(Number.isFinite(city.tiles[idx(4, 10)].commute)).toBe(true);

    city.tiles[idx(10, 10)].accident = 3;
    updateTraffic(city);
    expect(city.tiles[idx(4, 10)].commute).toBe(Infinity); // no way through

    for (let i = 0; i < 3; i++) updateAccidents(city);
    updateTraffic(city);
    expect(Number.isFinite(city.tiles[idx(4, 10)].commute)).toBe(true); // cleared
  });
});

describe('the advisor flags an active accident', () => {
  test('a blocked road produces the snarl tip; a clear city does not', () => {
    const city = base();
    busyRoad(city, 10, 10, 20);
    expect(adviseTips(city).map((t) => t.id)).not.toContain('accident-snarl');
    city.tiles[idx(10, 10)].accident = 8;
    expect(adviseTips(city).map((t) => t.id)).toContain('accident-snarl');
  });
});
