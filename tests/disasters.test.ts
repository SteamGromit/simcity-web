import { describe, expect, test } from 'vitest';
import { idx } from '../src/sim/grid';
import {
  GRID,
  HURRICANE_TICKS,
  PANDEMIC_MONTHS,
  RUBBLE_MONTHS,
  TICKS_PER_MONTH,
  TORNADO_TICKS,
  Zone,
} from '../src/sim/types';
import { applyTool, simTick } from '../src/sim/city';
import { pandemicMonthly, rollForDisaster, spawnDisaster, updateDisasters } from '../src/sim/disasters';
import { collectBudget } from '../src/sim/budget';
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
        expect(city.disasters.tornado.x).toBeLessThan(GRID);
        expect(city.disasters.tornado.y).toBeLessThan(GRID);
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

describe('public health campaign', () => {
  const seq = (vals: number[]) => {
    let i = 0;
    return () => vals[Math.min(i++, vals.length - 1)];
  };

  test('halves the odds of a pandemic striking', () => {
    // rand order: tornado, hurricane, pandemic
    const rolls = [0.9, 0.9, 0.0015];
    const base = makeCity();
    base.population = 1000;
    rollForDisaster(base, seq(rolls));
    expect(base.disasters.pandemicMonths).toBe(PANDEMIC_MONTHS);

    const covered = makeCity();
    covered.population = 1000;
    covered.ordinances.healthDrive = true;
    rollForDisaster(covered, seq(rolls));
    expect(covered.disasters.pandemicMonths).toBe(0);
  });

  test('halves the pandemic toll on homes and demand', () => {
    const run = (enacted: boolean) => {
      const city = makeCity();
      zone(city, 5, 5, Zone.Residential, 1);
      city.disasters.pandemicMonths = 1;
      city.ordinances.healthDrive = enacted;
      pandemicMonthly(city, () => 0.1);
      return { abandoned: city.tiles[idx(5, 5)].abandoned, demand: city.demand.r };
    };
    const base = run(false);
    expect(base.abandoned).toBe(true); // 0.1 < 0.15
    expect(base.demand).toBe(-0.5);
    const covered = run(true);
    expect(covered.abandoned).toBe(false); // 0.1 ≥ 0.075
    expect(covered.demand).toBe(-0.25);
  });

  test('charges $200 a month while enacted', () => {
    const city = makeCity();
    city.ordinances.healthDrive = true;
    collectBudget(city);
    expect(city.lastBudget.expenses).toBe(200);
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

  test('rubble decays one step per month', () => {
    const city = makeCity();
    city.tiles[idx(3, 3)].rubble = 2;
    for (let i = 0; i < TICKS_PER_MONTH; i++) simTick(city, never);
    expect(city.tiles[idx(3, 3)].rubble).toBe(1);
    for (let i = 0; i < TICKS_PER_MONTH; i++) simTick(city, never);
    expect(city.tiles[idx(3, 3)].rubble).toBe(0);
  });

  test('bulldozing a wrecked lot clears the rubble', () => {
    const city = makeCity();
    city.funds = 100;
    zone(city, 10, 10, Zone.Residential, 1);
    city.tiles[idx(10, 10)].rubble = 3;
    const res = applyTool(city, 'bulldoze', 10, 10);
    expect(res.ok).toBe(true);
    expect(city.tiles[idx(10, 10)].rubble).toBe(0);
    expect(city.tiles[idx(10, 10)].zone).toBe(Zone.None);
  });

  test('rubble survives a save round-trip', () => {
    const city = makeCity();
    city.tiles[idx(7, 7)].rubble = 2;
    const revived = deserialize(serialize(city))!;
    expect(revived.tiles[idx(7, 7)].rubble).toBe(2);
  });

  test('crafted saves cannot smuggle bogus rubble', () => {
    const city = makeCity();
    const raw = JSON.parse(serialize(city));
    raw.tiles[0].rubble = 999;
    raw.tiles[1].rubble = -5;
    raw.tiles[2].rubble = 'soon';
    const revived = deserialize(JSON.stringify(raw))!;
    expect(revived.tiles[0].rubble).toBe(RUBBLE_MONTHS);
    expect(revived.tiles[1].rubble).toBe(0);
    expect(revived.tiles[2].rubble).toBe(0);
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
