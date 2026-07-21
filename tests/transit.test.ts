import { describe, expect, test } from 'vitest';
import { idx } from '../src/sim/grid';
import {
  BUS_TRAFFIC_SHARE,
  ROAD_CAPACITY,
  SERVICE_RADII,
  SERVICE_UPKEEP,
  Zone,
} from '../src/sim/types';
import { updatePower } from '../src/sim/power';
import { updateCoverage } from '../src/sim/services';
import { updateTraffic } from '../src/sim/traffic';
import { collectBudget } from '../src/sim/budget';
import { buildLine, rasterizePath } from '../src/sim/transitlines';
import { deserialize, serialize } from '../src/sim/save';
import { adviseTips } from '../src/sim/tips';
import { clearLand, makeCity, road, zone } from './helpers';

describe('congestion-aware commutes', () => {
  test('with empty roads, commute equals plain distance', () => {
    const city = makeCity();
    zone(city, 5, 5, Zone.Residential, 1);
    road(city, 5, 6, 10, 6);
    zone(city, 10, 7, Zone.Industrial, 1);
    updateTraffic(city);
    expect(city.tiles[idx(5, 5)].commute).toBe(5);
  });

  test('congested roads make the same route cost more', () => {
    const city = makeCity();
    zone(city, 5, 5, Zone.Residential, 1);
    road(city, 5, 6, 10, 6);
    zone(city, 10, 7, Zone.Industrial, 1);
    for (let x = 5; x <= 10; x++) city.tiles[idx(x, 6)].traffic = ROAD_CAPACITY * 2;
    updateTraffic(city);
    expect(city.tiles[idx(5, 5)].commute).toBeGreaterThan(5);
  });

  test('commuters route around a jammed artery', () => {
    const city = makeCity();
    // two parallel routes between home (4,4) and job (10,4):
    // route A straight along y=4 side; route B detours along y=8
    zone(city, 4, 4, Zone.Residential, 1);
    zone(city, 11, 4, Zone.Industrial, 1);
    road(city, 5, 4, 10, 4); // route A, length 6
    road(city, 5, 4, 5, 8);
    road(city, 5, 8, 10, 8);
    road(city, 10, 8, 10, 4); // route B, longer
    for (let x = 6; x <= 9; x++) city.tiles[idx(x, 4)].traffic = ROAD_CAPACITY * 3;
    updateTraffic(city);
    // the new commuter flow lands on the empty detour, not the jam
    expect(city.tiles[idx(7, 8)].traffic).toBeGreaterThan(0);
    expect(city.tiles[idx(7, 4)].traffic).toBe(0);
  });
});

describe('bus stops', () => {
  test('a powered bus stop fills busCov over its radius', () => {
    const city = makeCity();
    zone(city, 20, 20, Zone.BusStop);
    zone(city, 21, 20, Zone.PowerPlant);
    updatePower(city);
    updateCoverage(city);
    expect(city.tiles[idx(20, 20)].busCov).toBeCloseTo(1, 5);
    expect(city.tiles[idx(20, 23)].busCov).toBeGreaterThan(0);
    expect(city.tiles[idx(20, 20 + SERVICE_RADII.bus + 1)].busCov).toBe(0);
  });

  test('coverage at both ends puts fewer cars on the road', () => {
    const build = (withBus: boolean) => {
      const city = makeCity();
      zone(city, 5, 5, Zone.Residential, 1);
      road(city, 5, 6, 10, 6);
      zone(city, 10, 7, Zone.Industrial, 1);
      if (withBus) {
        zone(city, 4, 5, Zone.BusStop);
        zone(city, 11, 7, Zone.BusStop);
        city.tiles[idx(4, 5)].powered = true;
        city.tiles[idx(11, 7)].powered = true;
        updateCoverage(city);
      }
      updateTraffic(city);
      return city.tiles[idx(7, 6)].traffic;
    };
    expect(build(false)).toBe(1);
    expect(build(true)).toBeCloseTo(BUS_TRAFFIC_SHARE, 5);
  });

  test('bus stops charge monthly upkeep', () => {
    const city = makeCity();
    zone(city, 20, 20, Zone.BusStop);
    collectBudget(city);
    expect(city.lastBudget.expenses).toBe(SERVICE_UPKEEP.bus);
  });

  test('a bus line places its stop and busCov survives a save round-trip', () => {
    const city = makeCity();
    clearLand(city);
    city.funds = 1000;
    const ok = buildLine(city, {
      mode: Zone.BusStop,
      color: '#e05548',
      path: rasterizePath([
        [20, 20],
        [23, 20],
      ]),
      stops: [[20, 20]],
    });
    expect(ok).toBe(true);
    city.tiles[idx(20, 20)].busCov = 0.7;
    const revived = deserialize(serialize(city))!;
    expect(revived.tiles[idx(20, 20)].zone).toBe(Zone.BusStop);
    expect(revived.tiles[idx(20, 20)].busCov).toBeCloseTo(0.7, 5);
  });
});

describe('congestion tip', () => {
  test('a jammed network surfaces the congestion tip', () => {
    const city = makeCity();
    zone(city, 30, 30, Zone.PowerPlant);
    road(city, 10, 10, 20, 10);
    for (let x = 10; x <= 20; x++) city.tiles[idx(x, 10)].traffic = ROAD_CAPACITY * 2;
    expect(adviseTips(city).map((t) => t.id)).toContain('congestion');
  });
});
