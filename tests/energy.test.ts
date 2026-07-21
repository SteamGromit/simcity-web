import { describe, expect, it } from 'vitest';
import { PLANT_SPECS, PLANT_ZONES, isPlant, plantUnlocked } from '../src/sim/energy';
import { Zone } from '../src/sim/types';

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
