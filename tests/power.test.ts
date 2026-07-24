import { describe, expect, test } from 'vitest';
import { idx } from '../src/sim/grid';
import { Zone } from '../src/sim/types';
import { updatePower } from '../src/sim/power';
import { makeCity, zone } from './helpers';
import { registerPack, resetRegistry, slotOf, unregisterPack } from '../src/content/registry';

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

  test('a wire strung over a road carries power across it', () => {
    const city = makeCity();
    zone(city, 10, 10, Zone.PowerPlant);
    zone(city, 11, 10, Zone.Road);
    city.tiles[idx(11, 10)].wire = true;
    zone(city, 12, 10, Zone.Residential);
    updatePower(city);
    expect(city.tiles[idx(12, 10)].powered).toBe(true);
  });

  test('no plant means nothing is powered, and stale flags clear', () => {
    const city = makeCity();
    zone(city, 5, 5, Zone.Residential);
    city.tiles[idx(5, 5)].powered = true; // stale
    updatePower(city);
    expect(city.tiles[idx(5, 5)].powered).toBe(false);
  });
});

describe('authored buildings and the power pool', () => {
  const LOOK = {
    footprint: 0.8, height: 20, hue: 200, sat: 40, light: 50,
    roof: 'flat' as const, props: [],
  };

  /** Register one pack holding every given building; returns their slots. */
  function loadMod(...buildings: Record<string, unknown>[]): number[] {
    const r = registerPack({
      id: 'mod',
      name: 'Mod',
      version: '1.0.0',
      buildings: buildings.map((b) => ({ name: 'Thing', cost: 10, upkeep: 1, visual: LOOK, ...b })),
    });
    if (!r.ok) throw new Error(r.errors.join('\n'));
    return buildings.map((b) => slotOf(b.id as string)!);
  }

  test('an authored building draws from the pool, so a dry pool browns it out', () => {
    // A zero-capacity plant conducts but supplies nothing. A consumer beside
    // it must go dark and register a brownout; a non-consumer would be lit
    // for free, which is exactly the distinction consumes() draws.
    resetRegistry();
    const city = makeCity();
    const [depot, dead] = loadMod(
      { id: 'mod:depot' },
      { id: 'mod:dead_plant', power: { capacity: 0, pollution: 0 } },
    );
    zone(city, 10, 10, dead as Zone);
    zone(city, 11, 10, depot as Zone);
    updatePower(city);
    expect(city.tiles[idx(11, 10)].powered).toBe(false);
    expect(city.brownouts).toBe(1);
  });

  test('the same building is powered when the pool has capacity', () => {
    resetRegistry();
    const city = makeCity();
    const [slot] = loadMod({ id: 'mod:depot' });
    zone(city, 10, 10, Zone.PowerPlant);
    zone(city, 11, 10, slot as Zone);
    updatePower(city);
    expect(city.tiles[idx(11, 10)].powered).toBe(true);
    expect(city.brownouts).toBe(0);
  });

  test('an authored plant supplies power rather than consuming it', () => {
    resetRegistry();
    const city = makeCity();
    const [slot] = loadMod({ id: 'mod:fusion', power: { capacity: 500, pollution: 0 } });
    zone(city, 10, 10, slot as Zone);
    zone(city, 11, 10, Zone.Residential);
    updatePower(city);
    expect(city.tiles[idx(11, 10)].powered).toBe(true);
  });

  test('a placed building whose pack is gone neither consumes nor crashes', () => {
    resetRegistry();
    const city = makeCity();
    const [slot] = loadMod({ id: 'mod:depot' });
    zone(city, 10, 10, Zone.PowerPlant);
    zone(city, 11, 10, slot as Zone);
    unregisterPack('mod');
    expect(() => updatePower(city)).not.toThrow();
  });
});
