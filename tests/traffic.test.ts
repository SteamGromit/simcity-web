import { describe, expect, test } from 'vitest';
import { idx } from '../src/sim/grid';
import { Zone } from '../src/sim/types';
import { roadAccess, updateTraffic } from '../src/sim/traffic';
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
