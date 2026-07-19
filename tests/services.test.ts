import { describe, expect, test } from 'vitest';
import { idx } from '../src/sim/grid';
import { FIRE_BURN_TICKS, Zone } from '../src/sim/types';
import { updatePower } from '../src/sim/power';
import { fireRisk, updateCoverage } from '../src/sim/services';
import { developTile } from '../src/sim/develop';
import { makeCity, zone } from './helpers';

/** A powered fire station at (x,y): plant right beside it. */
function poweredStation(city: ReturnType<typeof makeCity>, x: number, y: number, z: Zone) {
  zone(city, x, y, z);
  zone(city, x + 1, y, Zone.PowerPlant);
  updatePower(city);
}

describe('updateCoverage', () => {
  test('coverage falls off linearly with Chebyshev distance, rim included', () => {
    const city = makeCity();
    poweredStation(city, 20, 20, Zone.FireStation);
    updateCoverage(city);
    expect(city.tiles[idx(20, 20)].fireCov).toBeCloseTo(1, 5);
    expect(city.tiles[idx(24, 20)].fireCov).toBeCloseTo(1 - 4 / 9, 5); // d=4, R=8
    expect(city.tiles[idx(28, 20)].fireCov).toBeGreaterThan(0); // rim d=8 still covered
    expect(city.tiles[idx(20, 29)].fireCov).toBe(0); // d=9 > R
  });

  test('overlapping stations take the max, not the sum', () => {
    const city = makeCity();
    poweredStation(city, 20, 20, Zone.FireStation);
    poweredStation(city, 22, 20, Zone.FireStation);
    updateCoverage(city);
    expect(city.tiles[idx(21, 20)].fireCov).toBeLessThanOrEqual(1);
    expect(city.tiles[idx(21, 20)].fireCov).toBeCloseTo(1 - 1 / 9, 5); // d=1 from either
  });

  test('unpowered stations provide no coverage', () => {
    const city = makeCity();
    zone(city, 20, 20, Zone.PoliceStation); // no plant anywhere
    updatePower(city);
    updateCoverage(city);
    expect(city.tiles[idx(21, 20)].policeCov).toBe(0);
  });

  test('each service fills its own field, school reaches farther', () => {
    const city = makeCity();
    poweredStation(city, 20, 20, Zone.School);
    updateCoverage(city);
    expect(city.tiles[idx(29, 20)].schoolCov).toBeCloseTo(1 - 9 / 11, 5); // d=9, R=10
    expect(city.tiles[idx(29, 20)].fireCov).toBe(0);
    expect(city.tiles[idx(29, 20)].policeCov).toBe(0);
  });

  test('stale coverage clears when a station is gone', () => {
    const city = makeCity();
    city.tiles[idx(30, 30)].fireCov = 0.9;
    updateCoverage(city);
    expect(city.tiles[idx(30, 30)].fireCov).toBe(0);
  });
});

describe('fireRisk (ignition)', () => {
  const always = () => 0; // rand() < FIRE_RISK always fires

  test('an uncovered building catches fire and leaves a notice', () => {
    const city = makeCity();
    zone(city, 10, 10, Zone.Residential, 2);
    fireRisk(city, always);
    const t = city.tiles[idx(10, 10)];
    expect(t.burning).toBe(FIRE_BURN_TICKS);
    expect(t.stage).toBe(2); // still standing while it burns
    expect(city.notices.length).toBe(1);
    expect(city.notices[0]).toContain('(10, 10)');
  });

  test('any fire coverage prevents ignition entirely', () => {
    const city = makeCity();
    zone(city, 10, 10, Zone.Residential, 2);
    city.tiles[idx(10, 10)].fireCov = 0.1;
    fireRisk(city, always);
    expect(city.tiles[idx(10, 10)].burning).toBe(0);
    expect(city.notices.length).toBe(0);
  });

  test('empty zones and abandoned shells do not ignite', () => {
    const city = makeCity();
    zone(city, 10, 10, Zone.Residential, 0);
    zone(city, 11, 10, Zone.Industrial, 2);
    city.tiles[idx(11, 10)].abandoned = true;
    fireRisk(city, always);
    expect(city.notices.length).toBe(0);
  });

  test('an already-burning building is not re-ignited', () => {
    const city = makeCity();
    zone(city, 10, 10, Zone.Residential, 2);
    city.tiles[idx(10, 10)].burning = 3;
    fireRisk(city, always);
    expect(city.tiles[idx(10, 10)].burning).toBe(3);
    expect(city.notices.length).toBe(0);
  });
});

describe('service desirability bonus', () => {
  test('full coverage tips a marginal tile into growing', () => {
    // Tuned so p ≈ 0.168 without services and ≈ 0.24 with full coverage.
    const build = (covered: boolean) => {
      const city = makeCity();
      zone(city, 10, 10, Zone.Residential, 0);
      zone(city, 10, 11, Zone.Road);
      const t = city.tiles[idx(10, 10)];
      t.powered = true;
      t.landValue = 0.4;
      t.commute = 30; // job access term zero
      if (covered) {
        t.fireCov = 1;
        t.policeCov = 1;
        t.schoolCov = 1;
      }
      city.demand.r = 1;
      developTile(city, 10, 10, () => 0.2);
      return city.tiles[idx(10, 10)].stage;
    };
    expect(build(false)).toBe(0);
    expect(build(true)).toBe(1);
  });
});
