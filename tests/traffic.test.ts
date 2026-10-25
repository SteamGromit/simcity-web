import { describe, expect, test } from 'vitest';
import { idx } from '../src/sim/grid';
import { GRID, Zone } from '../src/sim/types';
import { BORDER_TRIP, roadAccess, updateTraffic, WORKERS_PER_CAR } from '../src/sim/traffic';
import { makeCity, road, zone } from './helpers';

describe('roadAccess', () => {
  test('finds a road within Chebyshev distance 2', () => {
    const city = makeCity();
    zone(city, 7, 5, Zone.Road);
    expect(roadAccess(city, 5, 5)).toEqual({ rx: 7, ry: 5 });
  });

  test('returns null when the nearest road is farther than 2', () => {
    const city = makeCity();
    zone(city, 8, 5, Zone.Road);
    expect(roadAccess(city, 5, 5)).toBeNull();
  });

  test('a motorway has no front doors — you cannot address a highway', () => {
    const city = makeCity();
    zone(city, 7, 5, Zone.Road);
    city.tiles[idx(7, 5)].road = 3;
    expect(roadAccess(city, 5, 5)).toBeNull();
  });

  test('nor its second level', () => {
    const city = makeCity();
    zone(city, 7, 5, Zone.Road);
    city.tiles[idx(7, 5)].road = 4;
    expect(roadAccess(city, 5, 5)).toBeNull();
  });

  test('a frontage street beside the motorway is what gives the lot its address', () => {
    const city = makeCity();
    zone(city, 6, 5, Zone.Road); // a plain street
    zone(city, 7, 5, Zone.Road);
    city.tiles[idx(7, 5)].road = 3; // motorway behind it
    expect(roadAccess(city, 5, 5)).toEqual({ rx: 6, ry: 5 });
  });

  test('every class below the motorway still takes a front door', () => {
    for (const cls of [0, 1, 2] as const) {
      const city = makeCity();
      zone(city, 6, 5, Zone.Road);
      city.tiles[idx(6, 5)].road = cls;
      expect(roadAccess(city, 5, 5)).toEqual({ rx: 6, ry: 5 });
    }
  });
});

describe('updateTraffic', () => {
  test('commute equals road distance from home to jobs', () => {
    const city = makeCity();
    zone(city, 5, 5, Zone.Residential, 1);
    road(city, 5, 6, 10, 6);
    zone(city, 10, 7, Zone.Industrial, 1);
    updateTraffic(city);
    expect(city.tiles[idx(5, 5)].commute).toBe(5);
  });

  test('no road access means infinite commute', () => {
    const city = makeCity();
    zone(city, 5, 5, Zone.Residential, 1);
    zone(city, 40, 40, Zone.Industrial, 1);
    updateTraffic(city);
    expect(city.tiles[idx(5, 5)].commute).toBe(Infinity);
  });

  test('disconnected road networks cannot commute', () => {
    const city = makeCity();
    zone(city, 5, 5, Zone.Residential, 1);
    road(city, 5, 6, 8, 6);
    road(city, 20, 6, 24, 6);
    zone(city, 24, 7, Zone.Industrial, 1);
    updateTraffic(city);
    expect(city.tiles[idx(5, 5)].commute).toBe(Infinity);
  });

  test('commuters add traffic along the connecting road', () => {
    const city = makeCity();
    zone(city, 5, 5, Zone.Residential, 1);
    road(city, 5, 6, 10, 6);
    zone(city, 10, 7, Zone.Industrial, 1);
    updateTraffic(city);
    expect(city.tiles[idx(7, 6)].traffic).toBeGreaterThan(0);
  });

  test('C and I tiles measure commute to workers', () => {
    const city = makeCity();
    zone(city, 5, 5, Zone.Residential, 1);
    road(city, 5, 6, 10, 6);
    zone(city, 10, 7, Zone.Industrial, 1);
    updateTraffic(city);
    expect(city.tiles[idx(10, 7)].commute).toBe(5);
  });

  test('undeveloped zones provide no jobs', () => {
    const city = makeCity();
    zone(city, 5, 5, Zone.Residential, 1);
    road(city, 5, 6, 10, 6);
    zone(city, 10, 7, Zone.Industrial, 0); // zoned but never built
    updateTraffic(city);
    expect(city.tiles[idx(5, 5)].commute).toBe(Infinity);
  });
});

describe('border gates', () => {
  const gate = idx(GRID - 1, 40);
  /** A road from (80,40) to the east edge with a residence beside its far end. */
  function edgeTown() {
    const city = makeCity();
    road(city, 80, 40, GRID - 1, 40);
    zone(city, 80, 41, Zone.Residential, 2);
    return city;
  }

  test('a residence whose only work is next door gets a finite commute through the gate', () => {
    const city = edgeTown();
    city.neighbors.gates = [{ tile: gate, jobs: 300, workers: 0 }];
    updateTraffic(city);
    // 15 road steps from (80,40) to (95,40), then the drive into the next town
    expect(city.tiles[idx(80, 41)].commute).toBe(15 + BORDER_TRIP);
    for (let x = 80; x < GRID; x++) expect(city.tiles[idx(x, 40)].traffic).toBe(1);
  });

  test('the same layout with no gate reads Infinity and loads nothing', () => {
    const city = edgeTown();
    updateTraffic(city);
    expect(city.tiles[idx(80, 41)].commute).toBe(Infinity);
    expect(city.tiles[idx(90, 40)].traffic).toBe(0);
  });

  test('a gate with no jobs is not a destination', () => {
    const city = edgeTown();
    zone(city, 80, 39, Zone.Commercial, 2); // local work at the near end
    city.neighbors.gates = [{ tile: gate, jobs: 0, workers: 0 }];
    updateTraffic(city);
    expect(city.tiles[idx(80, 41)].commute).toBe(0);
    expect(city.tiles[idx(90, 40)].traffic).toBe(0);
  });

  test('inbound workers load the road from the gate to local jobs', () => {
    const city = edgeTown();
    zone(city, 80, 39, Zone.Commercial, 2);
    city.tiles[idx(80, 41)].zone = Zone.None; // no residence: only inbound trips
    city.neighbors.gates = [{ tile: gate, jobs: 0, workers: 250 }];
    updateTraffic(city);
    expect(city.tiles[idx(90, 40)].traffic).toBe(Math.round(250 / WORKERS_PER_CAR));
    expect(city.tiles[idx(80, 40)].traffic).toBe(Math.round(250 / WORKERS_PER_CAR));
  });

  test('a gate on the way to a nearer local job is passed through, not stopped at', () => {
    const city = makeCity();
    road(city, GRID - 1, 30, GRID - 1, 50);
    zone(city, GRID - 2, 30, Zone.Residential, 2);
    zone(city, GRID - 2, 50, Zone.Commercial, 2);
    city.neighbors.gates = [{ tile: idx(GRID - 1, 40), jobs: 300, workers: 0 }];
    updateTraffic(city);
    // 20 steps to the local job beats 10 steps plus the border trip
    expect(city.tiles[idx(GRID - 2, 30)].commute).toBe(20);
    for (let y = 30; y <= 50; y++) expect(city.tiles[idx(GRID - 1, y)].traffic).toBe(1);
  });

  test('a gate with workers but no jobs is not a destination: no local work reads Infinity', () => {
    const city = edgeTown();
    city.neighbors.gates = [{ tile: gate, jobs: 0, workers: 250 }];
    updateTraffic(city);
    expect(city.tiles[idx(80, 41)].commute).toBe(Infinity);
  });

  test('a crash at the crossing closes the gate', () => {
    const city = edgeTown();
    city.neighbors.gates = [{ tile: gate, jobs: 300, workers: 250 }];
    city.tiles[gate].accident = 3;
    updateTraffic(city);
    expect(city.tiles[idx(80, 41)].commute).toBe(Infinity);
    expect(city.tiles[idx(90, 40)].traffic).toBe(0);
  });

  test('a corner gate at position 0 is safe', () => {
    const city = makeCity();
    road(city, 0, 0, 0, 10);
    zone(city, 1, 5, Zone.Commercial, 2);
    city.neighbors.gates = [{ tile: idx(0, 0), jobs: 0, workers: 100 }];
    expect(() => updateTraffic(city)).not.toThrow();
    expect(city.tiles[idx(0, 3)].traffic).toBe(2);
  });
});
