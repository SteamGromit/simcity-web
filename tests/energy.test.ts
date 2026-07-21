import { describe, expect, it } from 'vitest';
import { PLANT_SPECS, PLANT_ZONES, isPlant, plantUnlocked } from '../src/sim/energy';
import { updatePower } from '../src/sim/power';
import { Zone } from '../src/sim/types';
import { clearLand, makeCity } from './helpers';

function idx96(x: number, y: number): number {
  return y * 96 + x;
}

describe('plant roster', () => {
  it('covers all five plant zones', () => {
    expect(PLANT_ZONES).toContain(Zone.PowerPlant);
    expect(PLANT_ZONES).toContain(Zone.SolarPlant);
    expect(PLANT_ZONES).toContain(Zone.WindTurbine);
    expect(PLANT_ZONES).toContain(Zone.HydroPlant);
    expect(PLANT_ZONES).toContain(Zone.NuclearPlant);
    expect(PLANT_ZONES).toHaveLength(5);
  });

  it('isPlant separates plants from other structures', () => {
    for (const z of PLANT_ZONES) expect(isPlant(z)).toBe(true);
    expect(isPlant(Zone.WaterPump)).toBe(false);
    expect(isPlant(Zone.None)).toBe(false);
  });

  it('carries the spec capacities at the extremes', () => {
    expect(PLANT_SPECS[Zone.PowerPlant]!.capacity).toBe(240);
    expect(PLANT_SPECS[Zone.NuclearPlant]!.capacity).toBe(700);
  });
});

describe('plantUnlocked', () => {
  it('coal is always available', () => {
    expect(plantUnlocked(Zone.PowerPlant, 0)).toBe(true);
  });

  it('wind unlocks exactly at pop 2,000', () => {
    expect(plantUnlocked(Zone.WindTurbine, 1999)).toBe(false);
    expect(plantUnlocked(Zone.WindTurbine, 2000)).toBe(true);
  });

  it('nuclear unlocks at pop 25,000', () => {
    expect(plantUnlocked(Zone.NuclearPlant, 24999)).toBe(false);
    expect(plantUnlocked(Zone.NuclearPlant, 25000)).toBe(true);
  });
});

describe('pooled plant capacity', () => {
  it('a wind turbine browns out consumers beyond its 50-tile pool, nearest first', () => {
    const city = makeCity();
    clearLand(city);
    city.tiles[idx96(0, 0)].zone = Zone.WindTurbine;
    for (let x = 1; x <= 60; x++) city.tiles[idx96(x, 0)].zone = Zone.Residential;
    updatePower(city);
    expect(city.tiles[idx96(50, 0)].powered).toBe(true);
    expect(city.tiles[idx96(51, 0)].powered).toBe(false);
    expect(city.tiles[idx96(60, 0)].powered).toBe(false);
    expect(city.brownouts).toBe(10);
  });

  it('a second turbine pools capacity and clears the brownout', () => {
    const city = makeCity();
    clearLand(city);
    city.tiles[idx96(0, 0)].zone = Zone.WindTurbine;
    city.tiles[idx96(61, 0)].zone = Zone.WindTurbine;
    for (let x = 1; x <= 60; x++) city.tiles[idx96(x, 0)].zone = Zone.Residential;
    updatePower(city);
    for (let x = 1; x <= 60; x++) expect(city.tiles[idx96(x, 0)].powered).toBe(true);
    expect(city.brownouts).toBe(0);
  });

  it('parks and lines conduct without drawing from the pool', () => {
    const city = makeCity();
    clearLand(city);
    city.tiles[idx96(0, 0)].zone = Zone.WindTurbine;
    for (let x = 1; x <= 10; x++) city.tiles[idx96(x, 0)].zone = Zone.Park;
    for (let x = 11; x <= 70; x++) city.tiles[idx96(x, 0)].zone = Zone.Residential;
    updatePower(city);
    for (let x = 1; x <= 10; x++) expect(city.tiles[idx96(x, 0)].powered).toBe(true);
    expect(city.tiles[idx96(60, 0)].powered).toBe(true); // 50th consumer
    expect(city.tiles[idx96(61, 0)].powered).toBe(false);
    expect(city.brownouts).toBe(10);
  });
});
