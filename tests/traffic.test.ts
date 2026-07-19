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
