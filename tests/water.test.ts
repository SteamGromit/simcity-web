import { describe, expect, test } from 'vitest';
import { idx } from '../src/sim/grid';
import { Terrain, Zone } from '../src/sim/types';
import { updatePower } from '../src/sim/power';
import { updateWater } from '../src/sim/water';
import { developTile } from '../src/sim/develop';
import { collectBudget } from '../src/sim/budget';
import { applyTool } from '../src/sim/city';
import { deserialize, serialize } from '../src/sim/save';
import { adviseTips } from '../src/sim/tips';
import { clearLand, makeCity, zone } from './helpers';

/** Powered pump at (x,y) with a lake tile beside it. */
function workingPump(city: ReturnType<typeof makeCity>, x: number, y: number) {
  zone(city, x, y, Zone.WaterPump);
  city.tiles[idx(x - 1, y)].terrain = Terrain.Water;
  zone(city, x + 1, y, Zone.PowerPlant);
  updatePower(city);
}

describe('updateWater', () => {
  test('a powered lakeside pump waters adjacent zones through the block', () => {
    const city = makeCity();
    workingPump(city, 20, 20);
    zone(city, 20, 21, Zone.Residential);
    zone(city, 20, 22, Zone.Residential);
    updateWater(city);
    expect(city.tiles[idx(20, 21)].watered).toBe(true);
    expect(city.tiles[idx(20, 22)].watered).toBe(true);
    expect(city.tiles[idx(30, 30)].watered).toBe(false);
  });

  test('an unpowered pump pumps nothing', () => {
    const city = makeCity();
    zone(city, 20, 20, Zone.WaterPump);
    city.tiles[idx(19, 20)].terrain = Terrain.Water;
    zone(city, 20, 21, Zone.Residential);
    updatePower(city);
    updateWater(city);
    expect(city.tiles[idx(20, 21)].watered).toBe(false);
  });

  test('a landlocked pump pumps nothing', () => {
    const city = makeCity();
    zone(city, 20, 20, Zone.WaterPump); // no water anywhere near
    zone(city, 21, 20, Zone.PowerPlant);
    zone(city, 20, 21, Zone.Residential);
    updatePower(city);
    updateWater(city);
    expect(city.tiles[idx(20, 21)].watered).toBe(false);
  });

  test('pipes carry water across empty land; bare roads block it', () => {
    const city = makeCity();
    workingPump(city, 20, 20);
    zone(city, 20, 21, Zone.WaterPipe);
    zone(city, 20, 22, Zone.WaterPipe);
    zone(city, 20, 23, Zone.Residential);
    zone(city, 22, 20, Zone.Road); // road right of pump...
    zone(city, 23, 20, Zone.Residential); // ...then a zone behind it
    updateWater(city);
    expect(city.tiles[idx(20, 23)].watered).toBe(true);
    expect(city.tiles[idx(23, 20)].watered).toBe(false); // road has no main
    city.tiles[idx(22, 20)].pipe = true; // lay a main under the road
    updateWater(city);
    expect(city.tiles[idx(23, 20)].watered).toBe(true);
  });
});

describe('water gates growth', () => {
  function primed(watered: boolean) {
    const city = makeCity();
    zone(city, 5, 5, Zone.Residential, 0);
    zone(city, 5, 6, Zone.Road);
    const t = city.tiles[idx(5, 5)];
    t.density = 3;
    t.powered = true;
    t.landValue = 0.9;
    t.commute = 2;
    t.fireCov = 1;
    t.policeCov = 1;
    t.schoolCov = 1;
    t.healthCov = 1;
    t.watered = watered;
    city.demand = { r: 1, c: 1, i: 1 };
    return city;
  }

  test('dry buildings stop at stage 2 — wells only go so far', () => {
    const city = primed(false);
    for (let i = 0; i < 20; i++) developTile(city, 5, 5, () => 0);
    expect(city.tiles[idx(5, 5)].stage).toBe(2);
  });

  test('watered buildings grow past stage 2', () => {
    const city = primed(true);
    for (let i = 0; i < 20; i++) developTile(city, 5, 5, () => 0);
    expect(city.tiles[idx(5, 5)].stage).toBe(7);
  });
});

describe('tools and budget', () => {
  test('the pipe tool overlays roads with a main', () => {
    const city = makeCity();
    clearLand(city);
    city.funds = 1000;
    zone(city, 10, 10, Zone.Road);
    expect(applyTool(city, 'pipe', 10, 10).ok).toBe(true);
    expect(city.tiles[idx(10, 10)].pipe).toBe(true);
    expect(city.tiles[idx(10, 10)].zone).toBe(Zone.Road);
    expect(applyTool(city, 'pipe', 10, 10).ok).toBe(false); // already piped
    expect(applyTool(city, 'pipe', 11, 10).ok).toBe(true); // standalone pipe
    expect(city.tiles[idx(11, 10)].zone).toBe(Zone.WaterPipe);
  });

  test('pumps and pipes charge monthly upkeep', () => {
    const city = makeCity();
    zone(city, 20, 20, Zone.WaterPump);
    collectBudget(city);
    expect(city.lastBudget.expenses).toBeGreaterThan(0);
  });

  test('watered flag, pipes and pump survive a save round-trip', () => {
    const city = makeCity();
    zone(city, 20, 20, Zone.WaterPump);
    zone(city, 20, 21, Zone.WaterPipe);
    zone(city, 10, 10, Zone.Road);
    city.tiles[idx(10, 10)].pipe = true;
    city.tiles[idx(15, 15)].watered = true;
    const revived = deserialize(serialize(city))!;
    expect(revived.tiles[idx(20, 20)].zone).toBe(Zone.WaterPump);
    expect(revived.tiles[idx(20, 21)].zone).toBe(Zone.WaterPipe);
    expect(revived.tiles[idx(10, 10)].pipe).toBe(true);
    expect(revived.tiles[idx(15, 15)].watered).toBe(true);
  });
});

describe('water tip', () => {
  test('grown buildings without water surface the no-water tip', () => {
    const city = makeCity();
    zone(city, 30, 30, Zone.PowerPlant);
    zone(city, 10, 10, Zone.Residential, 2);
    zone(city, 10, 11, Zone.Road);
    const t = city.tiles[idx(10, 10)];
    t.powered = true;
    t.fireCov = 1;
    expect(adviseTips(city).map((x) => x.id)).toContain('no-water');
    t.watered = true;
    expect(adviseTips(city).map((x) => x.id)).not.toContain('no-water');
  });
});
