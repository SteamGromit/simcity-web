import { describe, expect, test } from 'vitest';
import { idx } from '../src/sim/grid';
import { Zone } from '../src/sim/types';
import { updatePower } from '../src/sim/power';
import { fireRisk, updateCoverage } from '../src/sim/services';
import { makeCity, zone } from './helpers';

/** A powered fire station at (x,y): plant right beside it. */
function poweredStation(city: ReturnType<typeof makeCity>, x: number, y: number, z: Zone) {
  zone(city, x, y, z);
  zone(city, x + 1, y, Zone.PowerPlant);
  updatePower(city);
}

describe('updateCoverage', () => {
  test('coverage falls off linearly with Chebyshev distance', () => {
    const city = makeCity();
    poweredStation(city, 20, 20, Zone.FireStation);
    updateCoverage(city);
    expect(city.tiles[idx(20, 20)].fireCov).toBeCloseTo(1, 5);
    expect(city.tiles[idx(24, 20)].fireCov).toBeCloseTo(0.5, 5); // d=4, R=8
    expect(city.tiles[idx(20, 29)].fireCov).toBe(0); // d=9 > R
  });

  test('overlapping stations take the max, not the sum', () => {
    const city = makeCity();
    poweredStation(city, 20, 20, Zone.FireStation);
    poweredStation(city, 22, 20, Zone.FireStation);
    updateCoverage(city);
    expect(city.tiles[idx(21, 20)].fireCov).toBeLessThanOrEqual(1);
    expect(city.tiles[idx(21, 20)].fireCov).toBeCloseTo(0.875, 5); // d=1 from either
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
    expect(city.tiles[idx(29, 20)].schoolCov).toBeCloseTo(0.1, 5); // d=9, R=10
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

describe('fireRisk', () => {
  const always = () => 0; // rand() < FIRE_RISK always fires

  test('an uncovered building burns to the ground and leaves a notice', () => {
    const city = makeCity();
    zone(city, 10, 10, Zone.Residential, 2);
    fireRisk(city, always);
    expect(city.tiles[idx(10, 10)].stage).toBe(0);
    expect(city.notices.length).toBe(1);
    expect(city.notices[0]).toContain('(10, 10)');
  });

  test('any fire coverage prevents fires entirely', () => {
    const city = makeCity();
    zone(city, 10, 10, Zone.Residential, 2);
    city.tiles[idx(10, 10)].fireCov = 0.1;
    fireRisk(city, always);
    expect(city.tiles[idx(10, 10)].stage).toBe(2);
    expect(city.notices.length).toBe(0);
  });

  test('empty zones and abandoned shells do not burn', () => {
    const city = makeCity();
    zone(city, 10, 10, Zone.Residential, 0);
    zone(city, 11, 10, Zone.Industrial, 2);
    city.tiles[idx(11, 10)].abandoned = true;
    fireRisk(city, always);
    expect(city.notices.length).toBe(0);
  });
});
