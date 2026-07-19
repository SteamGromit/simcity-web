import { describe, expect, test } from 'vitest';
import { idx } from '../src/sim/grid';
import { BUS_TRAFFIC_SHARE, FIRE_RISK, ORDINANCES, Zone } from '../src/sim/types';
import { newCity } from '../src/sim/city';
import { updatePollution } from '../src/sim/pollution';
import { fireRisk, updateCoverage } from '../src/sim/services';
import { updateTraffic } from '../src/sim/traffic';
import { collectBudget } from '../src/sim/budget';
import { deserialize, serialize } from '../src/sim/save';
import { makeCity, road, zone } from './helpers';

describe('ordinance metadata', () => {
  test('every ordinance has a label, blurb and monthly cost', () => {
    expect(ORDINANCES.length).toBeGreaterThanOrEqual(4);
    for (const o of ORDINANCES) {
      expect(o.label.length).toBeGreaterThan(3);
      expect(o.blurb.length).toBeGreaterThan(10);
      expect(o.cost).toBeGreaterThan(0);
    }
  });

  test('a new city starts with every ordinance off', () => {
    const city = newCity(1);
    for (const o of ORDINANCES) expect(city.ordinances[o.id]).toBe(false);
  });
});

describe('ordinance effects', () => {
  test('Clean Air Act cuts industrial pollution', () => {
    const run = (on: boolean) => {
      const city = makeCity();
      zone(city, 20, 20, Zone.Industrial, 3);
      city.ordinances.cleanAir = on;
      updatePollution(city);
      return city.tiles[idx(20, 20)].pollution;
    };
    expect(run(true)).toBeLessThan(run(false));
    expect(run(true)).toBeGreaterThan(0);
  });

  test('Free Bus Service puts even fewer cars on the road', () => {
    const run = (on: boolean) => {
      const city = makeCity();
      city.ordinances.freeBus = on;
      zone(city, 5, 5, Zone.Residential, 1);
      road(city, 5, 6, 10, 6);
      zone(city, 10, 7, Zone.Industrial, 1);
      zone(city, 4, 5, Zone.BusStop);
      zone(city, 11, 7, Zone.BusStop);
      city.tiles[idx(4, 5)].powered = true;
      city.tiles[idx(11, 7)].powered = true;
      updateCoverage(city);
      updateTraffic(city);
      return city.tiles[idx(7, 6)].traffic;
    };
    expect(run(false)).toBeCloseTo(BUS_TRAFFIC_SHARE, 5);
    expect(run(true)).toBeCloseTo(BUS_TRAFFIC_SHARE / 2, 5);
  });

  test('Fire Safety Code halves ignition risk', () => {
    const run = (on: boolean) => {
      const city = makeCity();
      zone(city, 10, 10, Zone.Residential, 2);
      city.ordinances.fireCode = on;
      fireRisk(city, () => FIRE_RISK * 0.7); // between half risk and full risk
      return city.tiles[idx(10, 10)].burning > 0;
    };
    expect(run(false)).toBe(true);
    expect(run(true)).toBe(false);
  });

  test('Education Grant stretches school coverage', () => {
    const run = (on: boolean) => {
      const city = makeCity();
      city.ordinances.eduGrant = on;
      zone(city, 20, 20, Zone.School);
      city.tiles[idx(20, 20)].powered = true;
      updateCoverage(city);
      return city.tiles[idx(20, 27)].schoolCov;
    };
    expect(run(true)).toBeGreaterThan(run(false));
    const city = makeCity();
    city.ordinances.eduGrant = true;
    zone(city, 20, 20, Zone.School);
    city.tiles[idx(20, 20)].powered = true;
    updateCoverage(city);
    expect(city.tiles[idx(20, 20)].schoolCov).toBeLessThanOrEqual(1);
  });

  test('active ordinances charge their monthly cost', () => {
    const city = makeCity();
    city.ordinances.cleanAir = true;
    city.ordinances.fireCode = true;
    collectBudget(city);
    const cleanAir = ORDINANCES.find((o) => o.id === 'cleanAir')!;
    const fireCode = ORDINANCES.find((o) => o.id === 'fireCode')!;
    expect(city.lastBudget.expenses).toBe(cleanAir.cost + fireCode.cost);
  });
});

describe('persistence', () => {
  test('ordinances survive a save round-trip; legacy saves default off', () => {
    const city = makeCity();
    city.ordinances.freeBus = true;
    const revived = deserialize(serialize(city))!;
    expect(revived.ordinances.freeBus).toBe(true);
    expect(revived.ordinances.cleanAir).toBe(false);

    const raw = JSON.parse(serialize(city));
    delete raw.ordinances;
    const legacy = deserialize(JSON.stringify(raw))!;
    for (const o of ORDINANCES) expect(legacy.ordinances[o.id]).toBe(false);
  });
});
