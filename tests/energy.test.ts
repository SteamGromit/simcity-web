import { beforeAll, describe, expect, it } from 'vitest';
import { plantCapacity, plantZones, isPlant, plantUnlocked } from '../src/sim/energy';
import { ensureCoreContent } from '../src/sim/content';
import { collectBudget } from '../src/sim/budget';
import { applyTool, canApply } from '../src/sim/city';
import { updatePollution } from '../src/sim/pollution';
import { deserialize, serialize } from '../src/sim/save';
import { updatePower } from '../src/sim/power';
import { Terrain, Zone } from '../src/sim/types';
import { clearLand, makeCity } from './helpers';

function idx96(x: number, y: number): number {
  return y * 96 + x;
}

beforeAll(() => {
  ensureCoreContent();
});

describe('plant roster', () => {
  it('covers all six plant zones', () => {
    expect(plantZones()).toContain(Zone.PowerPlant);
    expect(plantZones()).toContain(Zone.SolarPlant);
    expect(plantZones()).toContain(Zone.WindTurbine);
    expect(plantZones()).toContain(Zone.HydroPlant);
    expect(plantZones()).toContain(Zone.NuclearPlant);
    expect(plantZones()).toContain(Zone.FusionPlant); // unlocked by research
    expect(plantZones()).toHaveLength(6);
  });

  it('isPlant separates plants from other structures', () => {
    for (const z of plantZones()) expect(isPlant(z)).toBe(true);
    expect(isPlant(Zone.WaterPump)).toBe(false);
    expect(isPlant(Zone.None)).toBe(false);
  });

  it('carries the spec capacities at the extremes', () => {
    expect(plantCapacity(Zone.PowerPlant)).toBe(240);
    expect(plantCapacity(Zone.NuclearPlant)).toBe(700);
  });
});

describe('plantUnlocked', () => {
  it('coal is always available', () => {
    const city = makeCity();
    city.population = 0;
    expect(plantUnlocked(Zone.PowerPlant, city)).toBe(true);
  });

  it('wind unlocks exactly at pop 2,000', () => {
    const city = makeCity();
    city.population = 1999;
    expect(plantUnlocked(Zone.WindTurbine, city)).toBe(false);
    city.population = 2000;
    expect(plantUnlocked(Zone.WindTurbine, city)).toBe(true);
  });

  it('nuclear unlocks at pop 25,000', () => {
    const city = makeCity();
    city.population = 24999;
    expect(plantUnlocked(Zone.NuclearPlant, city)).toBe(false);
    city.population = 25000;
    expect(plantUnlocked(Zone.NuclearPlant, city)).toBe(true);
  });
});

describe('plant placement rules', () => {
  it('rejects a locked plant with the unlock population', () => {
    const city = makeCity();
    clearLand(city);
    city.funds = 100000;
    city.population = 1999;
    expect(canApply(city, 'wind', 10, 10)).toBe(false);
    expect(applyTool(city, 'wind', 10, 10).err).toBe('unlocks at pop 2,000');
    city.population = 2000;
    expect(applyTool(city, 'wind', 10, 10).ok).toBe(true);
    expect(city.tiles[idx96(10, 10)].zone).toBe(Zone.WindTurbine);
  });

  it('hydro needs an orthogonal water neighbor', () => {
    const city = makeCity();
    clearLand(city);
    city.funds = 100000;
    city.population = 10000;
    expect(applyTool(city, 'hydro', 20, 20).err).toBe('needs adjacent water');
    city.tiles[idx96(21, 20)].terrain = Terrain.Water;
    expect(applyTool(city, 'hydro', 20, 20).ok).toBe(true);
    expect(city.tiles[idx96(20, 20)].zone).toBe(Zone.HydroPlant);
  });
});

describe('plant economics and pollution', () => {
  it('charges each plant its monthly upkeep', () => {
    const city = makeCity();
    clearLand(city);
    city.tiles[idx96(0, 0)].zone = Zone.WindTurbine;
    city.tiles[idx96(2, 0)].zone = Zone.NuclearPlant;
    const report = collectBudget(city);
    expect(report.expenses).toBe(15 + 300);
  });

  it('clean plants emit nothing; nuclear emits a trace', () => {
    const city = makeCity();
    clearLand(city);
    city.tiles[idx96(10, 10)].zone = Zone.SolarPlant;
    updatePollution(city);
    expect(city.tiles[idx96(10, 10)].pollution).toBe(0);
    city.tiles[idx96(10, 10)].zone = Zone.NuclearPlant;
    updatePollution(city);
    expect(city.tiles[idx96(10, 10)].pollution).toBeGreaterThan(0);
    expect(city.tiles[idx96(10, 10)].pollution).toBeLessThan(0.3);
  });
});

describe('plant save round-trip', () => {
  it('new plant zones survive serialize → deserialize', () => {
    const city = makeCity();
    clearLand(city);
    city.tiles[idx96(5, 5)].zone = Zone.NuclearPlant;
    city.tiles[idx96(6, 5)].zone = Zone.SolarPlant;
    const revived = deserialize(serialize(city))!;
    expect(revived.tiles[idx96(5, 5)].zone).toBe(Zone.NuclearPlant);
    expect(revived.tiles[idx96(6, 5)].zone).toBe(Zone.SolarPlant);
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
