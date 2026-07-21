import { Zone } from './types';

export interface PlantSpec {
  /** Consuming tiles this plant can feed (see updatePower's consumer set). */
  capacity: number;
  /** Pollution source strength, 0..1 (coal's historic 1.0 is the ceiling). */
  pollution: number;
  /** City population required before the tool unlocks; 0 = always. */
  unlockPop: number;
  name: string;
}

/** The energy roster. Coal keeps its historic cost/upkeep elsewhere
 * (COSTS.plant, UPKEEP.plant); this table owns capacity, pollution,
 * and the unlock ladder. */
export const PLANT_SPECS: Partial<Record<Zone, PlantSpec>> = {
  [Zone.PowerPlant]: { capacity: 240, pollution: 1.0, unlockPop: 0, name: 'Coal Plant' },
  [Zone.WindTurbine]: { capacity: 50, pollution: 0, unlockPop: 2000, name: 'Wind Turbine' },
  [Zone.SolarPlant]: { capacity: 100, pollution: 0, unlockPop: 5000, name: 'Solar Farm' },
  [Zone.HydroPlant]: { capacity: 280, pollution: 0, unlockPop: 10000, name: 'Hydro Plant' },
  [Zone.NuclearPlant]: { capacity: 700, pollution: 0.15, unlockPop: 25000, name: 'Nuclear Plant' },
};

export const PLANT_ZONES: Zone[] = Object.keys(PLANT_SPECS).map(Number) as Zone[];

export function isPlant(zone: Zone): boolean {
  return PLANT_SPECS[zone] !== undefined;
}

export function plantUnlocked(zone: Zone, population: number): boolean {
  const spec = PLANT_SPECS[zone];
  return spec !== undefined && population >= spec.unlockPop;
}
