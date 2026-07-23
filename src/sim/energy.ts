import { buildingBySlot, allBuildings } from '../content/registry';
import { unlockedFor } from './content';
import { CityState, Zone } from './types';

/** Zones that generate power, derived from whatever content is registered. */
export function plantZones(): Zone[] {
  return allBuildings()
    .filter((b) => b.power !== undefined)
    .map((b) => b.slot as Zone);
}

export function isPlant(zone: Zone): boolean {
  return buildingBySlot(zone)?.power !== undefined;
}

export function plantCapacity(zone: Zone): number {
  return buildingBySlot(zone)?.power?.capacity ?? 0;
}

export function plantPollution(zone: Zone): number {
  return buildingBySlot(zone)?.power?.pollution ?? 0;
}

export function plantUnlocked(zone: Zone, city: CityState): boolean {
  const def = buildingBySlot(zone);
  return def?.power !== undefined && unlockedFor(def, city);
}

/** Human phrasing of a locked plant's requirement, for the UI. */
export function plantUnlockLabel(zone: Zone): string | undefined {
  return buildingBySlot(zone)?.unlock?.label;
}
