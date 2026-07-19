import { describe, expect, test } from 'vitest';
import { blankTile, idx } from '../src/sim/grid';
import { GRID, CityState, Zone } from '../src/sim/types';
import { updatePower } from '../src/sim/power';

function makeCity(): CityState {
  return {
    version: 1,
    seed: 1,
    tiles: Array.from({ length: GRID * GRID }, blankTile),
    funds: 0,
    tick: 0,
    month: 0,
    demand: { r: 0, c: 0, i: 0 },
    taxes: { r: 0.09, c: 0.09, i: 0.09 },
    population: 0,
    jobs: 0,
    lastBudget: { rIncome: 0, cIncome: 0, iIncome: 0, expenses: 0, net: 0 },
  };
}

function zone(city: CityState, x: number, y: number, z: Zone) {
  city.tiles[idx(x, y)].zone = z;
}

describe('updatePower', () => {
  test('plant powers a contiguous chain of zones', () => {
    const city = makeCity();
    zone(city, 10, 10, Zone.PowerPlant);
    zone(city, 11, 10, Zone.Residential);
    zone(city, 12, 10, Zone.Residential);
    updatePower(city);
    expect(city.tiles[idx(11, 10)].powered).toBe(true);
    expect(city.tiles[idx(12, 10)].powered).toBe(true);
  });

  test('an unzoned gap blocks conduction', () => {
    const city = makeCity();
    zone(city, 10, 10, Zone.PowerPlant);
    zone(city, 12, 10, Zone.Residential); // gap at (11,10)
    updatePower(city);
    expect(city.tiles[idx(12, 10)].powered).toBe(false);
  });

  test('a power line bridges a gap', () => {
    const city = makeCity();
    zone(city, 10, 10, Zone.PowerPlant);
    zone(city, 11, 10, Zone.PowerLine);
    zone(city, 12, 10, Zone.Residential);
    updatePower(city);
    expect(city.tiles[idx(12, 10)].powered).toBe(true);
  });

  test('roads do not conduct power', () => {
    const city = makeCity();
    zone(city, 10, 10, Zone.PowerPlant);
    zone(city, 11, 10, Zone.Road);
    zone(city, 12, 10, Zone.Residential);
    updatePower(city);
    expect(city.tiles[idx(12, 10)].powered).toBe(false);
  });

  test('no plant means nothing is powered, and stale flags clear', () => {
    const city = makeCity();
    zone(city, 5, 5, Zone.Residential);
    city.tiles[idx(5, 5)].powered = true; // stale
    updatePower(city);
    expect(city.tiles[idx(5, 5)].powered).toBe(false);
  });
});
