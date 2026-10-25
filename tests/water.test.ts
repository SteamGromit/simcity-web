import { describe, expect, test } from 'vitest';
import { idx } from '../src/sim/grid';
import { Terrain, Zone } from '../src/sim/types';
import { updatePower } from '../src/sim/power';
import { updateWater, WATER_PER_PUMP, waterSupply } from '../src/sim/water';
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
    t.garbageCov = 1; // this test is about the water gate, not refuse
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

describe('water has a capacity', () => {
  /** `n` residences in a 6-wide block below the pump, nearest first. */
  function block(city: ReturnType<typeof makeCity>, n: number) {
    for (let k = 0; k < n; k++) zone(city, 20 + (k % 6), 21 + Math.floor(k / 6), Zone.Residential);
  }
  const last = (n: number) => idx(20 + ((n - 1) % 6), 21 + Math.floor((n - 1) / 6));

  test('a pump waters at most WATER_PER_PUMP consumers; the farthest go dry', () => {
    const city = makeCity();
    workingPump(city, 20, 20);
    block(city, WATER_PER_PUMP + 30);
    updateWater(city);
    const wet = city.tiles.filter((t) => t.zone === Zone.Residential && t.watered).length;
    expect(wet).toBe(WATER_PER_PUMP);
    expect(city.dryouts).toBe(30);
    expect(city.tiles[idx(20, 21)].watered).toBe(true); // nearest first
    expect(city.tiles[last(WATER_PER_PUMP + 30)].watered).toBe(false);
  });

  test('a second pump doubles the pool', () => {
    const city = makeCity();
    workingPump(city, 20, 20);
    workingPump(city, 24, 20);
    block(city, WATER_PER_PUMP + 30);
    updateWater(city);
    const wet = city.tiles.filter((t) => t.zone === Zone.Residential && t.watered).length;
    expect(wet).toBe(WATER_PER_PUMP + 30);
    expect(city.dryouts).toBe(0);
  });

  test('imported water joins the pool and exported water leaves it', () => {
    const city = makeCity();
    workingPump(city, 20, 20);
    block(city, WATER_PER_PUMP);
    city.neighbors.water = -50;
    updateWater(city);
    expect(city.dryouts).toBe(50);
    city.neighbors.water = 30;
    updateWater(city);
    expect(city.dryouts).toBe(0);
  });

  test('waterSupply counts what updateWater counts', () => {
    const city = makeCity();
    workingPump(city, 20, 20);
    block(city, 120);
    updateWater(city);
    expect(waterSupply(city)).toEqual({ capacity: WATER_PER_PUMP, demand: 120, spare: WATER_PER_PUMP - 120 });
  });

  test('a dry consumer still conducts, so the block behind it is not cut off', () => {
    const city = makeCity();
    workingPump(city, 20, 20);
    city.neighbors.water = -(WATER_PER_PUMP - 1); // one tile's worth of water
    zone(city, 20, 21, Zone.Residential);
    zone(city, 20, 22, Zone.Residential);
    zone(city, 20, 23, Zone.WaterPipe);
    zone(city, 20, 24, Zone.Residential);
    updateWater(city);
    expect(city.tiles[idx(20, 21)].watered).toBe(true);
    expect(city.tiles[idx(20, 22)].watered).toBe(false);
    expect(city.tiles[idx(20, 23)].watered).toBe(true); // a pipe conducts and drinks nothing
    expect(city.tiles[idx(20, 24)].watered).toBe(false);
    expect(city.dryouts).toBe(2);
  });

  test('dryouts survive a save round-trip and default to 0 in an old save', () => {
    const city = makeCity();
    city.dryouts = 7;
    expect(deserialize(serialize(city))!.dryouts).toBe(7);
    const old = JSON.parse(serialize(city));
    delete old.dryouts;
    expect(deserialize(JSON.stringify(old))!.dryouts).toBe(0);
  });
});
