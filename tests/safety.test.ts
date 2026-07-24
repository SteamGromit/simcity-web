import { beforeEach, describe, expect, test } from 'vitest';
import { resetRegistry } from '../src/content/registry';
import { ensureCoreContent } from '../src/sim/content';
import { idx } from '../src/sim/grid';
import { ageBuildings, collapseChance, collapseRoll } from '../src/sim/safety';
import { COLLAPSE_AGE, CityState, Zone } from '../src/sim/types';
import { clearLand, makeCity, zone } from './helpers';

function base(): CityState {
  const city = makeCity();
  clearLand(city);
  return city;
}

/** A developed building of `ageMonths`. */
function aged(city: CityState, x: number, y: number, ageMonths: number, zoneKind = Zone.Residential): void {
  zone(city, x, y, zoneKind);
  const t = city.tiles[idx(x, y)];
  t.stage = 3 as never;
  t.age = ageMonths;
}

const chance = (city: CityState, x: number, y: number) => collapseChance(city, idx(x, y));

beforeEach(() => {
  resetRegistry();
  ensureCoreContent();
});

describe('collapse chance', () => {
  test('is zero below the age gate', () => {
    const city = base();
    aged(city, 10, 10, COLLAPSE_AGE - 12); // one year short of 100
    expect(chance(city, 10, 10)).toBe(0);
  });

  test('is positive past it and rises with age', () => {
    const city = base();
    aged(city, 10, 10, COLLAPSE_AGE + 120); // 110 years
    aged(city, 20, 20, COLLAPSE_AGE + 600); // 150 years
    expect(chance(city, 10, 10)).toBeGreaterThan(0);
    expect(chance(city, 20, 20)).toBeGreaterThan(chance(city, 10, 10));
  });

  test('an abandoned or undeveloped lot never collapses', () => {
    const city = base();
    aged(city, 10, 10, COLLAPSE_AGE + 600);
    city.tiles[idx(10, 10)].abandoned = true;
    expect(chance(city, 10, 10)).toBe(0);

    zone(city, 11, 10, Zone.Residential); // stage 0
    city.tiles[idx(11, 10)].age = COLLAPSE_AGE + 600;
    expect(chance(city, 11, 10)).toBe(0);
  });

  test('even a very old building is rare', () => {
    const city = base();
    aged(city, 10, 10, COLLAPSE_AGE + 240); // 120 years
    expect(chance(city, 10, 10)).toBeLessThan(0.05); // < 5% a month
  });
});

describe('the safety programmes cut the odds', () => {
  function ancient(): CityState {
    const city = base();
    aged(city, 10, 10, COLLAPSE_AGE + 600);
    return city;
  }

  test('Building Permits lower it', () => {
    const plain = ancient();
    const bare = chance(plain, 10, 10);
    const safe = ancient();
    safe.ordinances['permits'] = true;
    expect(chance(safe, 10, 10)).toBeLessThan(bare);
  });

  test('both programmes compound', () => {
    const one = ancient();
    one.ordinances['permits'] = true;
    const both = ancient();
    both.ordinances['permits'] = true;
    both.ordinances['inspectors'] = true;
    expect(chance(both, 10, 10)).toBeLessThan(chance(one, 10, 10));
  });
});

describe('a collapse razes the building', () => {
  test('an ancient building falls, leaving rubble and casualties', () => {
    const city = base();
    aged(city, 10, 10, COLLAPSE_AGE + 600);
    collapseRoll(city, () => 0); // a roll of 0 always fires

    const t = city.tiles[idx(10, 10)];
    expect(t.stage).toBe(0);
    expect(t.rubble).toBeGreaterThan(0);
    expect(t.age).toBe(0);
    expect(t.collapseFlash).toBeGreaterThan(0);
    expect(city.notices.some((n) => /collaps/i.test(n))).toBe(true);
  });

  test('a young or abandoned building never falls', () => {
    const city = base();
    aged(city, 10, 10, COLLAPSE_AGE - 120); // 90 years
    aged(city, 12, 10, COLLAPSE_AGE + 600);
    city.tiles[idx(12, 10)].abandoned = true;
    collapseRoll(city, () => 0);
    expect(city.tiles[idx(10, 10)].stage).toBe(3);
    expect(city.tiles[idx(12, 10)].stage).toBe(3);
  });
});

describe('buildings age each month', () => {
  test('a developed lot ages; an empty one does not', () => {
    const city = base();
    aged(city, 10, 10, 5);
    zone(city, 11, 10, Zone.Residential); // stage 0
    ageBuildings(city);
    expect(city.tiles[idx(10, 10)].age).toBe(6);
    expect(city.tiles[idx(11, 10)].age).toBe(0);
  });

  test('an abandoned lot does not age', () => {
    const city = base();
    aged(city, 10, 10, 5);
    city.tiles[idx(10, 10)].abandoned = true;
    ageBuildings(city);
    expect(city.tiles[idx(10, 10)].age).toBe(5);
  });
});
