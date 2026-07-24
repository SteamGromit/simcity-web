import { beforeEach, describe, expect, test } from 'vitest';
import { registerPack, resetRegistry } from '../src/content/registry';
import { ensureCoreContent } from '../src/sim/content';
import { idx } from '../src/sim/grid';
import { updateLandValue } from '../src/sim/landvalue';
import { crimeIncidents, crimeTarget, updateCrime } from '../src/sim/crime';
import { CityState, Zone } from '../src/sim/types';
import { clearLand, makeCity, zone } from './helpers';

function base(): CityState {
  const city = makeCity();
  clearLand(city);
  return city;
}

/** A developed residential tile with a chosen land value / density / commute. */
function home(
  city: CityState,
  x: number,
  y: number,
  opts: { landValue?: number; density?: 1 | 2 | 3; commute?: number; stage?: number } = {},
): void {
  zone(city, x, y, Zone.Residential);
  const t = city.tiles[idx(x, y)];
  t.stage = (opts.stage ?? 3) as never;
  t.density = opts.density ?? 2;
  t.landValue = opts.landValue ?? 0.5;
  t.commute = opts.commute ?? 3;
}

const target = (city: CityState, x: number, y: number) => crimeTarget(city, idx(x, y));

beforeEach(() => {
  resetRegistry();
  ensureCoreContent();
});

describe('the crime rate reflects conditions', () => {
  test('a rich, low-density, job-adjacent block is nearly crime-free', () => {
    const city = base();
    home(city, 10, 10, { landValue: 0.9, density: 1, commute: 2 });
    expect(target(city, 10, 10)).toBeLessThan(0.1);
  });

  test('a poor, dense, jobless block is a hotspot', () => {
    const city = base();
    home(city, 10, 10, { landValue: 0.1, density: 3, commute: Infinity });
    expect(target(city, 10, 10)).toBeGreaterThan(0.4);
  });

  test('lower land value means more crime, all else equal', () => {
    const city = base();
    home(city, 10, 10, { landValue: 0.8 });
    home(city, 20, 20, { landValue: 0.2 });
    expect(target(city, 20, 20)).toBeGreaterThan(target(city, 10, 10));
  });

  test('density raises it', () => {
    const city = base();
    home(city, 10, 10, { density: 1 });
    home(city, 20, 20, { density: 3 });
    expect(target(city, 20, 20)).toBeGreaterThan(target(city, 10, 10));
  });

  test('no reachable jobs raises residential crime', () => {
    const city = base();
    home(city, 10, 10, { commute: 3 });
    home(city, 20, 20, { commute: Infinity });
    expect(target(city, 20, 20)).toBeGreaterThan(target(city, 10, 10));
  });

  test('nearby abandonment and rubble raise it', () => {
    const city = base();
    home(city, 10, 10, { landValue: 0.5 });
    const plain = target(city, 10, 10);

    const city2 = base();
    home(city2, 10, 10, { landValue: 0.5 });
    zone(city2, 11, 10, Zone.Commercial);
    city2.tiles[idx(11, 10)].stage = 2 as never;
    city2.tiles[idx(11, 10)].abandoned = true;
    city2.tiles[idx(10, 11)].rubble = 3;
    expect(target(city2, 10, 10)).toBeGreaterThan(plain);
  });

  test('undeveloped and non-RCI tiles have no crime target', () => {
    const city = base();
    zone(city, 10, 10, Zone.Residential); // stage 0
    zone(city, 11, 10, Zone.Park);
    expect(target(city, idx(10, 10) === idx(10, 10) ? 10 : 0, 10)).toBe(0);
    expect(crimeTarget(city, idx(11, 10))).toBe(0);
  });
});

describe('police coverage fights crime', () => {
  function poorBlock(): CityState {
    const city = base();
    home(city, 10, 10, { landValue: 0.15, density: 3 });
    return city;
  }

  test('coverage cuts the rate; more coverage cuts more', () => {
    const none = poorBlock();
    const bare = target(none, 10, 10);

    const some = poorBlock();
    some.tiles[idx(10, 10)].policeCov = 0.5;
    const half = target(some, 10, 10);

    const full = poorBlock();
    full.tiles[idx(10, 10)].policeCov = 1;
    const covered = target(full, 10, 10);

    expect(half).toBeLessThan(bare);
    expect(covered).toBeLessThan(half);
  });

  test('the Neighborhood Watch modifier scales it, composing with coverage', () => {
    registerPack({
      id: 'watch', name: 'Watch', version: '1',
      ordinances: [{ id: 'watch:w', label: 'W', blurb: 'x', cost: 1, effects: { 'crime.rate': 0.5 } }],
    });
    const city = poorBlock();
    const plain = target(city, 10, 10);
    city.ordinances['watch:w'] = true;
    expect(target(city, 10, 10)).toBeCloseTo(plain * 0.5, 5);
  });
});

describe('the rate eases toward its target', () => {
  test('crime rises toward a high target over months, not in one step', () => {
    const city = base();
    home(city, 10, 10, { landValue: 0.1, density: 3 });
    const t = city.tiles[idx(10, 10)];
    const goal = crimeTarget(city, idx(10, 10));

    updateCrime(city);
    const afterOne = t.crime;
    expect(afterOne).toBeGreaterThan(0);
    expect(afterOne).toBeLessThan(goal); // did not snap
    for (let i = 0; i < 20; i++) updateCrime(city);
    expect(t.crime).toBeCloseTo(goal, 2); // but converges
  });

  test('the value/crime feedback loop settles instead of running away', () => {
    const city = base();
    // a whole poor district
    for (let x = 10; x <= 16; x++) {
      for (let y = 10; y <= 14; y++) home(city, x, y, { landValue: 0.2, density: 3, commute: Infinity });
    }
    let prev = 0;
    for (let i = 0; i < 40; i++) {
      updateLandValue(city);
      updateCrime(city);
      prev = city.tiles[idx(13, 12)].crime;
    }
    updateLandValue(city);
    updateCrime(city);
    const now = city.tiles[idx(13, 12)].crime;
    expect(now).toBeGreaterThanOrEqual(0);
    expect(now).toBeLessThanOrEqual(1);
    expect(Math.abs(now - prev)).toBeLessThan(0.02); // converged, not oscillating
  });
});

describe('incidents roll against the rate', () => {
  test('a calm city has no incidents', () => {
    const city = base();
    home(city, 10, 10, { landValue: 0.95, density: 1 });
    for (let i = 0; i < 40; i++) updateCrime(city);
    const before = city.notices.length;
    for (let i = 0; i < 50; i++) crimeIncidents(city, () => 0.5);
    expect(city.notices.length).toBe(before);
  });

  test('a high-crime city produces incidents and flashes the tile', () => {
    const city = base();
    home(city, 10, 10, { landValue: 0.05, density: 3, commute: Infinity });
    for (let i = 0; i < 40; i++) updateCrime(city);
    crimeIncidents(city, () => 0); // a roll of 0 always fires
    expect(city.notices.some((n) => /crime|burglar|vandal|theft|robber/i.test(n))).toBe(true);
    expect(city.tiles[idx(10, 10)].crimeFlash).toBeGreaterThan(0);
  });

  test('an abandoned or undeveloped tile is never the site of an incident', () => {
    const city = base();
    zone(city, 10, 10, Zone.Residential);
    city.tiles[idx(10, 10)].stage = 3 as never;
    city.tiles[idx(10, 10)].abandoned = true;
    city.tiles[idx(10, 10)].crime = 1;
    crimeIncidents(city, () => 0);
    expect(city.tiles[idx(10, 10)].crimeFlash).toBe(0);
    expect(city.notices.length).toBe(0);
  });
});
