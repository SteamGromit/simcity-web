import { describe, expect, test } from 'vitest';
import { idx } from '../src/sim/grid';
import { Zone } from '../src/sim/types';
import { updatePollution } from '../src/sim/pollution';
import { updateLandValue } from '../src/sim/landvalue';
import { makeCity, zone } from './helpers';

describe('updatePollution', () => {
  test('a developed factory pollutes, decaying with distance', () => {
    const city = makeCity();
    zone(city, 10, 10, Zone.Industrial, 2);
    updatePollution(city);
    const at = (x: number, y: number) => city.tiles[idx(x, y)].pollution;
    expect(at(10, 10)).toBeGreaterThan(0.4);
    expect(at(12, 10)).toBeGreaterThan(0);
    expect(at(12, 10)).toBeLessThan(at(10, 10));
    expect(at(20, 10)).toBe(0);
  });

  test('undeveloped industrial land is clean', () => {
    const city = makeCity();
    zone(city, 10, 10, Zone.Industrial, 0);
    updatePollution(city);
    expect(city.tiles[idx(10, 10)].pollution).toBe(0);
  });

  test('a busy road corridor smogs but never saturates its neighbors', () => {
    const city = makeCity();
    for (let x = 10; x <= 25; x++) {
      zone(city, x, 10, Zone.Road);
      city.tiles[idx(x, 10)].traffic = 25;
    }
    updatePollution(city);
    const beside = city.tiles[idx(17, 11)].pollution;
    expect(beside).toBeGreaterThan(0.05); // traffic still pollutes...
    expect(beside).toBeLessThan(0.5); // ...but stacked plumes can't zero out land value
  });

  test('power plants pollute heavily', () => {
    const city = makeCity();
    zone(city, 10, 10, Zone.PowerPlant);
    updatePollution(city);
    expect(city.tiles[idx(10, 10)].pollution).toBeGreaterThan(0.8);
  });
});

describe('updateLandValue', () => {
  test('parks raise nearby land value', () => {
    const city = makeCity();
    zone(city, 5, 5, Zone.Park);
    updatePollution(city);
    updateLandValue(city);
    const near = city.tiles[idx(6, 5)].landValue;
    const far = city.tiles[idx(30, 30)].landValue;
    expect(near).toBeGreaterThan(far);
  });

  test('pollution lowers land value', () => {
    const city = makeCity();
    zone(city, 10, 10, Zone.Industrial, 3);
    updatePollution(city);
    updateLandValue(city);
    const polluted = city.tiles[idx(11, 10)].landValue;
    const clean = city.tiles[idx(40, 40)].landValue;
    expect(polluted).toBeLessThan(clean);
  });

  test('service coverage lifts land value', () => {
    const city = makeCity();
    zone(city, 5, 5, Zone.Residential, 1);
    zone(city, 8, 8, Zone.Residential, 1);
    const covered = city.tiles[idx(5, 5)];
    covered.fireCov = 1;
    covered.policeCov = 1;
    covered.schoolCov = 1;
    updateLandValue(city);
    expect(covered.landValue).toBeCloseTo(city.tiles[idx(8, 8)].landValue + 0.12, 5);
  });

  test('long commutes drag residential land value down', () => {
    const city = makeCity();
    zone(city, 5, 5, Zone.Residential, 1);
    city.tiles[idx(5, 5)].commute = 30;
    zone(city, 8, 8, Zone.Residential, 1);
    city.tiles[idx(8, 8)].commute = 2;
    updateLandValue(city);
    expect(city.tiles[idx(5, 5)].landValue).toBeLessThan(city.tiles[idx(8, 8)].landValue);
  });

  test('short commutes carry no land value penalty at all', () => {
    const city = makeCity();
    zone(city, 5, 5, Zone.Residential, 1);
    city.tiles[idx(5, 5)].commute = 6;
    zone(city, 8, 8, Zone.Residential, 1);
    city.tiles[idx(8, 8)].commute = 1;
    updateLandValue(city);
    expect(city.tiles[idx(5, 5)].landValue).toBe(city.tiles[idx(8, 8)].landValue);
  });
});
