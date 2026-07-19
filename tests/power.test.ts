import { describe, expect, test } from 'vitest';
import { idx } from '../src/sim/grid';
import { Zone } from '../src/sim/types';
import { updatePower } from '../src/sim/power';
import { makeCity, zone } from './helpers';

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
