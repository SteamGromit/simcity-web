import { describe, expect, test } from 'vitest';
import { idx } from '../src/sim/grid';
import { FIRE_RISK, MAX_ELEV, Terrain, Zone } from '../src/sim/types';
import { newCity } from '../src/sim/city';
import { fireRisk } from '../src/sim/services';
import { deserialize, serialize } from '../src/sim/save';
import { makeCity, zone } from './helpers';

describe('mountains', () => {
  test('the elevation ceiling allows real peaks', () => {
    expect(MAX_ELEV).toBeGreaterThanOrEqual(5);
  });

  test('every new map has at least one mountain', () => {
    for (const seed of [1, 7, 42]) {
      const peak = Math.max(...newCity(seed).tiles.map((t) => t.elevation));
      expect(peak).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('desert biome', () => {
  test('some seeds roll desert, most roll temperate; deterministic', () => {
    const biomes = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) biomes.add(newCity(seed).biome);
    expect(biomes.has('temperate')).toBe(true);
    expect(biomes.has('desert')).toBe(true);
    const again = newCity(5);
    expect(again.biome).toBe(newCity(5).biome);
  });

  test('deserts are dry and sparse: less water and forest than temperate', () => {
    // Medians over the first few seeds of each climate, so one desert that
    // happens to roll a river does not stand for all of them.
    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1];
    const count = (seed: number, kind: Terrain) =>
      newCity(seed).tiles.filter((t) => t.terrain === kind).length;
    const seeds = { desert: [] as number[], temperate: [] as number[] };
    for (let seed = 1; seed <= 80; seed++) {
      const b = newCity(seed).biome;
      if (seeds[b].length < 6) seeds[b].push(seed);
    }
    expect(seeds.desert.length).toBeGreaterThan(2);
    const forest = (list: number[]) => median(list.map((s) => count(s, Terrain.Forest)));
    const water = (list: number[]) => median(list.map((s) => count(s, Terrain.Water)));
    expect(forest(seeds.desert)).toBeLessThan(forest(seeds.temperate) / 3);
    expect(water(seeds.desert)).toBeLessThan(water(seeds.temperate) / 2);
    for (const s of seeds.desert) expect(count(s, Terrain.Water)).toBeGreaterThan(0); // an oasis — pumps must have a chance
  });

  test('desert air is dry: fires ignite more easily', () => {
    const run = (biome: 'temperate' | 'desert') => {
      const city = makeCity();
      city.biome = biome;
      zone(city, 10, 10, Zone.Residential, 2);
      fireRisk(city, () => FIRE_RISK * 1.2);
      return city.tiles[idx(10, 10)].burning > 0;
    };
    expect(run('temperate')).toBe(false);
    expect(run('desert')).toBe(true);
  });

  test('biome survives saves; legacy saves default temperate', () => {
    const city = makeCity();
    city.biome = 'desert';
    expect(deserialize(serialize(city))!.biome).toBe('desert');
    const raw = JSON.parse(serialize(city));
    delete raw.biome;
    expect(deserialize(JSON.stringify(raw))!.biome).toBe('temperate');
  });
});
