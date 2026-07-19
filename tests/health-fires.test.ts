import { describe, expect, test } from 'vitest';
import { idx } from '../src/sim/grid';
import { FIRE_BURN_TICKS, SERVICE_UPKEEP, Zone } from '../src/sim/types';
import { updatePower } from '../src/sim/power';
import { fireRisk, updateCoverage, updateFires } from '../src/sim/services';
import { developTile } from '../src/sim/develop';
import { collectBudget } from '../src/sim/budget';
import { applyTool } from '../src/sim/city';
import { deserialize, serialize } from '../src/sim/save';
import { adviseTips } from '../src/sim/tips';
import { clearLand, makeCity, zone } from './helpers';

const never = () => 0.999; // rolls that never trigger chance events
const always = () => 0;

describe('hospital coverage', () => {
  test('a powered hospital fills healthCov with linear falloff', () => {
    const city = makeCity();
    zone(city, 20, 20, Zone.Hospital);
    zone(city, 21, 20, Zone.PowerPlant);
    updatePower(city);
    updateCoverage(city);
    expect(city.tiles[idx(20, 20)].healthCov).toBeCloseTo(1, 5);
    expect(city.tiles[idx(20, 25)].healthCov).toBeGreaterThan(0);
    expect(city.tiles[idx(20, 32)].healthCov).toBe(0);
  });

  test('hospitals charge monthly upkeep', () => {
    const city = makeCity();
    zone(city, 20, 20, Zone.Hospital);
    collectBudget(city);
    expect(city.lastBudget.expenses).toBe(SERVICE_UPKEEP.health);
  });
});

describe('health gates high-density growth', () => {
  function primed(healthCov: number) {
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
    t.healthCov = healthCov;
    t.watered = true;
    city.demand = { r: 1, c: 1, i: 1 };
    return city;
  }

  test('without hospital coverage residential tops out at stage 4', () => {
    const city = primed(0);
    for (let i = 0; i < 20; i++) developTile(city, 5, 5, always);
    expect(city.tiles[idx(5, 5)].stage).toBe(4);
  });

  test('with hospital coverage it grows past stage 4', () => {
    const city = primed(1);
    for (let i = 0; i < 20; i++) developTile(city, 5, 5, always);
    expect(city.tiles[idx(5, 5)].stage).toBe(7);
  });
});

describe('spreading fires', () => {
  test('a burning building burns down after FIRE_BURN_TICKS and leaves a notice', () => {
    const city = makeCity();
    zone(city, 10, 10, Zone.Residential, 3);
    fireRisk(city, always); // ignite
    city.notices.length = 0;
    for (let i = 0; i < FIRE_BURN_TICKS; i++) updateFires(city, never);
    const t = city.tiles[idx(10, 10)];
    expect(t.burning).toBe(0);
    expect(t.stage).toBe(0);
    expect(t.zone).toBe(Zone.Residential); // lot stays zoned, can redevelop
    expect(city.notices.some((n) => n.includes('(10, 10)'))).toBe(true);
  });

  test('fire spreads to adjacent uncovered buildings but not two tiles in one step', () => {
    const city = makeCity();
    zone(city, 10, 10, Zone.Residential, 2);
    zone(city, 11, 10, Zone.Residential, 2);
    zone(city, 12, 10, Zone.Residential, 2);
    city.tiles[idx(10, 10)].burning = FIRE_BURN_TICKS;
    updateFires(city, always);
    expect(city.tiles[idx(11, 10)].burning).toBeGreaterThan(0);
    expect(city.tiles[idx(12, 10)].burning).toBe(0); // no same-tick chain
  });

  test('full fire coverage blocks spread', () => {
    const city = makeCity();
    zone(city, 10, 10, Zone.Residential, 2);
    zone(city, 11, 10, Zone.Residential, 2);
    city.tiles[idx(11, 10)].fireCov = 1;
    city.tiles[idx(10, 10)].burning = FIRE_BURN_TICKS;
    updateFires(city, always);
    expect(city.tiles[idx(11, 10)].burning).toBe(0);
  });

  test('covered buildings get extinguished before burning down', () => {
    const city = makeCity();
    zone(city, 10, 10, Zone.Residential, 3);
    const t = city.tiles[idx(10, 10)];
    t.fireCov = 1;
    t.burning = FIRE_BURN_TICKS;
    updateFires(city, always); // rand 0 < fireCov × extinguish chance
    expect(t.burning).toBe(0);
    expect(t.stage).toBe(3); // saved!
  });

  test('abandoned shells catch spreading fire too', () => {
    const city = makeCity();
    zone(city, 10, 10, Zone.Residential, 2);
    zone(city, 11, 10, Zone.Commercial, 2);
    city.tiles[idx(11, 10)].abandoned = true;
    city.tiles[idx(10, 10)].burning = FIRE_BURN_TICKS;
    updateFires(city, always);
    expect(city.tiles[idx(11, 10)].burning).toBeGreaterThan(0);
  });

  test('a burning building does not grow', () => {
    const city = makeCity();
    zone(city, 5, 5, Zone.Residential, 1);
    zone(city, 5, 6, Zone.Road);
    const t = city.tiles[idx(5, 5)];
    t.powered = true;
    t.landValue = 0.9;
    t.fireCov = 1;
    t.burning = 5;
    city.demand = { r: 1, c: 1, i: 1 };
    developTile(city, 5, 5, always);
    expect(t.stage).toBe(1);
  });

  test('bulldozing a burning building puts the fire out', () => {
    const city = makeCity();
    clearLand(city);
    city.funds = 1000;
    zone(city, 10, 10, Zone.Residential, 2);
    city.tiles[idx(10, 10)].burning = 5;
    applyTool(city, 'bulldoze', 10, 10);
    expect(city.tiles[idx(10, 10)].burning).toBe(0);
    expect(city.tiles[idx(10, 10)].zone).toBe(Zone.None);
  });
});

describe('save round-trip', () => {
  test('hospital zone, healthCov and burning survive serialization', () => {
    const city = makeCity();
    zone(city, 20, 20, Zone.Hospital);
    zone(city, 10, 10, Zone.Residential, 2);
    city.tiles[idx(10, 10)].burning = 7;
    city.tiles[idx(10, 10)].healthCov = 0.5;
    const revived = deserialize(serialize(city))!;
    expect(revived.tiles[idx(20, 20)].zone).toBe(Zone.Hospital);
    expect(revived.tiles[idx(10, 10)].burning).toBe(7);
    expect(revived.tiles[idx(10, 10)].healthCov).toBeCloseTo(0.5, 5);
  });

  test('legacy saves without the new fields revive to safe defaults', () => {
    const city = makeCity();
    const raw = JSON.parse(serialize(city));
    for (const t of raw.tiles) {
      delete t.healthCov;
      delete t.burning;
    }
    const revived = deserialize(JSON.stringify(raw))!;
    expect(revived.tiles[0].healthCov).toBe(0);
    expect(revived.tiles[0].burning).toBe(0);
  });
});

describe('tips integration', () => {
  test('an active fire is the top tip', () => {
    const city = makeCity();
    zone(city, 30, 30, Zone.PowerPlant);
    zone(city, 10, 10, Zone.Residential, 2);
    city.tiles[idx(10, 10)].powered = true;
    city.tiles[idx(10, 10)].fireCov = 1;
    city.tiles[idx(10, 10)].burning = 5;
    expect(adviseTips(city)[0].id).toBe('fire-burning');
  });

  test('tall buildings without hospitals get the health tip', () => {
    const city = makeCity();
    zone(city, 30, 30, Zone.PowerPlant);
    zone(city, 10, 10, Zone.Residential, 4);
    zone(city, 10, 11, Zone.Road);
    const t = city.tiles[idx(10, 10)];
    t.density = 3;
    t.powered = true;
    t.fireCov = 1;
    const ids = adviseTips(city).map((x) => x.id);
    expect(ids).toContain('no-health');
    t.healthCov = 0.5;
    expect(adviseTips(city).map((x) => x.id)).not.toContain('no-health');
  });
});
