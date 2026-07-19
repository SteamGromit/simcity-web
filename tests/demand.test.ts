import { describe, expect, test } from 'vitest';
import { Zone } from '../src/sim/types';
import { updateDemand } from '../src/sim/demand';
import { makeCity, zone } from './helpers';

describe('updateDemand', () => {
  test('an empty city wants residents and industry, not much commerce', () => {
    const city = makeCity();
    updateDemand(city);
    expect(city.demand.r).toBeGreaterThan(0);
    expect(city.demand.i).toBeGreaterThan(0);
    expect(city.demand.c).toBeLessThanOrEqual(city.demand.r);
  });

  test('population and jobs are recomputed from developed tiles', () => {
    const city = makeCity();
    zone(city, 5, 5, Zone.Residential, 2); // 24 pop
    zone(city, 6, 5, Zone.Industrial, 1); // 10 jobs
    zone(city, 7, 5, Zone.Commercial, 1); // 6 jobs
    updateDemand(city);
    expect(city.population).toBe(24);
    expect(city.jobs).toBe(16);
  });

  test('abandoned buildings count for nothing', () => {
    const city = makeCity();
    zone(city, 5, 5, Zone.Residential, 2);
    city.tiles[5 * 64 + 5].abandoned = true;
    updateDemand(city);
    expect(city.population).toBe(0);
  });

  test('jobs pull residential demand up', () => {
    const jobless = makeCity();
    updateDemand(jobless);
    const jobRich = makeCity();
    for (let x = 5; x < 15; x++) zone(jobRich, x, 5, Zone.Industrial, 2);
    updateDemand(jobRich);
    expect(jobRich.demand.r).toBeGreaterThan(jobless.demand.r);
  });

  test('a big population with no commerce wants shops', () => {
    const city = makeCity();
    for (let x = 5; x < 25; x++) zone(city, x, 5, Zone.Residential, 3);
    updateDemand(city);
    expect(city.demand.c).toBeGreaterThan(0);
  });

  test('high taxes suppress demand; low taxes boost it', () => {
    const base = makeCity();
    updateDemand(base);
    const taxed = makeCity();
    taxed.taxes.r = 0.2;
    updateDemand(taxed);
    const cheap = makeCity();
    cheap.taxes.r = 0.05;
    updateDemand(cheap);
    expect(taxed.demand.r).toBeLessThan(base.demand.r);
    expect(cheap.demand.r).toBeGreaterThanOrEqual(base.demand.r);
  });
});
