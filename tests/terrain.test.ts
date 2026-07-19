import { describe, expect, test } from 'vitest';
import { idx } from '../src/sim/grid';
import { START_FUNDS, Terrain, Zone } from '../src/sim/types';
import { applyTool, newCity } from '../src/sim/city';
import { updateLandValue } from '../src/sim/landvalue';
import { deserialize, serialize } from '../src/sim/save';
import { makeCity, zone } from './helpers';

function counts(city: ReturnType<typeof newCity>) {
  let water = 0;
  let forest = 0;
  for (const t of city.tiles) {
    if (t.terrain === Terrain.Water) water++;
    if (t.terrain === Terrain.Forest) forest++;
  }
  return { water, forest };
}

describe('terrain generation', () => {
  test('new maps have lakes and forests, deterministic per seed', () => {
    const a = newCity(5);
    const b = newCity(5);
    expect(serialize(a)).toBe(serialize(b));
    const { water, forest } = counts(a);
    expect(water).toBeGreaterThan(30);
    expect(forest).toBeGreaterThan(10);
  });

  test('different seeds give different maps', () => {
    expect(serialize(newCity(5))).not.toBe(serialize(newCity(6)));
  });
});

describe('terrain rules', () => {
  test('nothing can be built on water or forest (roads may bridge water)', () => {
    const city = makeCity();
    city.tiles[idx(5, 5)].terrain = Terrain.Water;
    city.tiles[idx(6, 5)].terrain = Terrain.Forest;
    city.funds = 1000;
    expect(applyTool(city, 'road', 5, 5).ok).toBe(true); // bridge (see elevation.test)
    expect(applyTool(city, 'road', 6, 5).ok).toBe(false); // no roads through woods
    expect(applyTool(city, 'zoneR', 6, 5).ok).toBe(false);
    expect(applyTool(city, 'plant', 5, 5).ok).toBe(false);
    expect(applyTool(city, 'road', 7, 5).ok).toBe(true); // grass is fine
  });

  test('terrain painting is free on a pristine map, charged after founding', () => {
    const city = makeCity();
    city.funds = 1000;
    expect(applyTool(city, 'terraWater', 5, 5).ok).toBe(true);
    expect(city.funds).toBe(1000); // free before the city exists
    expect(city.tiles[idx(5, 5)].terrain).toBe(Terrain.Water);

    // founding is judged by the tiles themselves, not lagging aggregates —
    // the instant anything develops, terraforming costs money
    zone(city, 30, 30, Zone.Residential, 1);
    expect(city.population).toBe(0); // aggregates deliberately stale
    expect(applyTool(city, 'terraWater', 6, 5).ok).toBe(true);
    expect(city.funds).toBe(1000 - 25);
    expect(applyTool(city, 'terraForest', 7, 5).ok).toBe(true);
    expect(city.funds).toBe(1000 - 25 - 10);
  });

  test('terrain tools respect occupancy and reject no-ops', () => {
    const city = makeCity();
    city.funds = 1000;
    zone(city, 5, 5, Zone.Road);
    expect(applyTool(city, 'terraWater', 5, 5).ok).toBe(false); // occupied
    expect(applyTool(city, 'terraGrass', 6, 5).ok).toBe(false); // already grass
  });

  test('bulldozing forest levels it to grass at terrain pricing', () => {
    const city = makeCity();
    city.funds = 100;
    city.tiles[idx(5, 5)].terrain = Terrain.Forest;
    city.tiles[idx(6, 5)].terrain = Terrain.Forest;
    expect(applyTool(city, 'bulldoze', 5, 5).ok).toBe(true);
    expect(city.tiles[idx(5, 5)].terrain).toBe(Terrain.Grass);
    expect(city.funds).toBe(100); // pristine map: free, like the terrain tools
    zone(city, 30, 30, Zone.Residential, 1); // founded
    expect(applyTool(city, 'bulldoze', 6, 5).ok).toBe(true);
    expect(city.funds).toBe(100 - 5); // priced like Level Land, not §1
    expect(applyTool(city, 'bulldoze', 6, 6).ok).toBe(false); // bare grass: nothing there
  });

  test('a crafted save cannot put a building on water', () => {
    const city = makeCity();
    zone(city, 5, 5, Zone.Residential, 3);
    const mangled = JSON.parse(serialize(city));
    mangled.tiles[idx(5, 5)].terrain = Terrain.Water;
    const revived = deserialize(JSON.stringify(mangled));
    expect(revived!.tiles[idx(5, 5)].terrain).toBe(Terrain.Grass);
    expect(revived!.tiles[idx(5, 5)].zone).toBe(Zone.Residential);
  });

  test('waterfront and forest edges raise land value', () => {
    const city = makeCity();
    city.tiles[idx(10, 10)].terrain = Terrain.Water;
    zone(city, 11, 10, Zone.Residential, 1);
    zone(city, 40, 40, Zone.Residential, 1);
    updateLandValue(city);
    expect(city.tiles[idx(11, 10)].landValue).toBeGreaterThan(city.tiles[idx(40, 40)].landValue);
  });

  test('terrain survives save round-trips; junk terrain degrades to grass', () => {
    const city = makeCity();
    city.tiles[idx(5, 5)].terrain = Terrain.Water;
    city.tiles[idx(6, 5)].terrain = Terrain.Forest;
    const revived = deserialize(serialize(city));
    expect(revived!.tiles[idx(5, 5)].terrain).toBe(Terrain.Water);
    expect(revived!.tiles[idx(6, 5)].terrain).toBe(Terrain.Forest);
    const junk = JSON.parse(serialize(city));
    junk.tiles[idx(5, 5)].terrain = 99;
    expect(deserialize(JSON.stringify(junk))!.tiles[idx(5, 5)].terrain).toBe(Terrain.Grass);
  });

  test('START_FUNDS unchanged by generation', () => {
    expect(newCity(3).funds).toBe(START_FUNDS);
  });
});
