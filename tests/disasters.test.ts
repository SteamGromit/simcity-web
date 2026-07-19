import { describe, expect, test } from 'vitest';
import { idx } from '../src/sim/grid';
import { HURRICANE_TICKS, PANDEMIC_MONTHS, RUBBLE_MONTHS, TORNADO_TICKS, Zone } from '../src/sim/types';
import { pandemicMonthly, spawnDisaster, updateDisasters } from '../src/sim/disasters';
import { deserialize, serialize } from '../src/sim/save';
import { adviseTips } from '../src/sim/tips';
import { makeCity, zone } from './helpers';

const never = () => 0.999;
const always = () => 0;

describe('spawnDisaster', () => {
  test('tornado spawns with a position, duration, and a notice', () => {
    const city = makeCity();
    spawnDisaster(city, 'tornado', always);
    expect(city.disasters.tornado).not.toBeNull();
    expect(city.disasters.tornado!.ticksLeft).toBe(TORNADO_TICKS);
    expect(city.notices.some((n) => n.toLowerCase().includes('tornado'))).toBe(true);
  });

  test('hurricane and pandemic set their timers', () => {
    const city = makeCity();
    spawnDisaster(city, 'hurricane', always);
    spawnDisaster(city, 'pandemic', always);
    expect(city.disasters.hurricaneTicks).toBe(HURRICANE_TICKS);
    expect(city.disasters.pandemicMonths).toBe(PANDEMIC_MONTHS);
  });
});

describe('tornado', () => {
  test('grinds buildings down along its path and expires', () => {
    const city = makeCity();
    for (let x = 8; x <= 12; x++)
      for (let y = 8; y <= 12; y++) zone(city, x, y, Zone.Residential, 3);
    city.disasters.tornado = { x: 10, y: 10, ticksLeft: 3 };
    const before = city.tiles.reduce((s, t) => s + t.stage, 0);
    for (let i = 0; i < 3; i++) updateDisasters(city, always);
    const after = city.tiles.reduce((s, t) => s + t.stage, 0);
    expect(after).toBeLessThan(before);
    expect(city.disasters.tornado).toBeNull(); // blew itself out
  });

  test('the funnel wanders but stays on the map', () => {
    const city = makeCity();
    city.disasters.tornado = { x: 0, y: 0, ticksLeft: 40 };
    for (let i = 0; i < 40; i++) {
      updateDisasters(city, never);
      if (city.disasters.tornado) {
        expect(city.disasters.tornado.x).toBeGreaterThanOrEqual(0);
        expect(city.disasters.tornado.y).toBeGreaterThanOrEqual(0);
        expect(city.disasters.tornado.x).toBeLessThan(64);
        expect(city.disasters.tornado.y).toBeLessThan(64);
      }
    }
  });
});

describe('hurricane', () => {
  test('damages developed tiles across the city while it lasts', () => {
    const city = makeCity();
    for (let x = 10; x <= 30; x += 2) zone(city, x, 20, Zone.Commercial, 3);
    city.disasters.hurricaneTicks = 10;
    const before = city.tiles.reduce((s, t) => s + t.stage, 0);
    for (let i = 0; i < 10; i++) updateDisasters(city, always);
    const after = city.tiles.reduce((s, t) => s + t.stage, 0);
    expect(after).toBeLessThan(before);
    expect(city.disasters.hurricaneTicks).toBe(0);
  });
});

describe('pandemic', () => {
  test('suppresses residential demand while active', () => {
    const city = makeCity();
    city.demand.r = 0.8;
    city.disasters.pandemicMonths = 3;
    pandemicMonthly(city, never);
    expect(city.demand.r).toBeLessThan(0.8);
    expect(city.disasters.pandemicMonths).toBe(2);
  });

  test('uncovered homes empty out; hospital coverage protects', () => {
    const run = (healthCov: number) => {
      const city = makeCity();
      zone(city, 10, 10, Zone.Residential, 3);
      city.tiles[idx(10, 10)].healthCov = healthCov;
      city.disasters.pandemicMonths = 1;
      pandemicMonthly(city, always); // rand 0 → abandon roll hits if possible
      return city.tiles[idx(10, 10)].abandoned;
    };
    expect(run(0)).toBe(true);
    expect(run(1)).toBe(false);
  });
});

describe('rubble', () => {
  test('tornado damage leaves rubble on the lot', () => {
    const city = makeCity();
    zone(city, 10, 10, Zone.Residential, 3);
    city.disasters.tornado = { x: 10, y: 10, ticksLeft: 1 };
    updateDisasters(city, always); // rand 0 → damage roll hits
    expect(city.tiles[idx(10, 10)].rubble).toBe(RUBBLE_MONTHS);
  });

  test('hurricane damage leaves rubble', () => {
    const city = makeCity();
    zone(city, 10, 10, Zone.Commercial, 3);
    city.disasters.hurricaneTicks = 1;
    updateDisasters(city, always);
    expect(city.tiles[idx(10, 10)].rubble).toBe(RUBBLE_MONTHS);
  });

  test('fresh damage re-buries a lot that was almost clear', () => {
    const city = makeCity();
    zone(city, 10, 10, Zone.Commercial, 3);
    city.tiles[idx(10, 10)].rubble = 1;
    city.disasters.hurricaneTicks = 1;
    updateDisasters(city, always);
    expect(city.tiles[idx(10, 10)].rubble).toBe(RUBBLE_MONTHS);
  });

  test('pandemic abandonment leaves no rubble', () => {
    const city = makeCity();
    zone(city, 10, 10, Zone.Residential, 3);
    city.disasters.pandemicMonths = 1;
    pandemicMonthly(city, always);
    expect(city.tiles[idx(10, 10)].abandoned).toBe(true);
    expect(city.tiles[idx(10, 10)].rubble).toBe(0);
  });
});

describe('integration', () => {
  test('active disasters survive a save round-trip', () => {
    const city = makeCity();
    city.disasters.tornado = { x: 5, y: 6, ticksLeft: 9 };
    city.disasters.hurricaneTicks = 4;
    city.disasters.pandemicMonths = 2;
    const revived = deserialize(serialize(city))!;
    expect(revived.disasters.tornado).toEqual({ x: 5, y: 6, ticksLeft: 9 });
    expect(revived.disasters.hurricaneTicks).toBe(4);
    expect(revived.disasters.pandemicMonths).toBe(2);
  });

  test('an active disaster is the top advisor tip', () => {
    const city = makeCity();
    zone(city, 30, 30, Zone.PowerPlant);
    city.disasters.hurricaneTicks = 5;
    expect(adviseTips(city)[0].id).toBe('disaster');
  });
});
