import { buildingBySlot, allBuildings } from '../content/registry';
import { unlockedFor } from './content';
import { CityState, Zone } from './types';

/** The transit ladder above the bus stop, derived from whatever content is
 * registered. The bus itself stays a plain service (SERVICE_RADII.bus,
 * BUS_TRAFFIC_SHARE) — these are its upgrades, unlocked by growth. */
export function transitZones(): Zone[] {
  return allBuildings()
    .filter((b) => b.transit !== undefined)
    .map((b) => b.slot as Zone);
}

export function isTransit(zone: Zone): boolean {
  return buildingBySlot(zone)?.transit !== undefined;
}

export function transitRadius(zone: Zone): number {
  return buildingBySlot(zone)?.transit?.radius ?? 0;
}

export function transitShareOf(zone: Zone): number {
  return buildingBySlot(zone)?.transit?.share ?? 1;
}

export function transitUnlocked(zone: Zone, city: CityState): boolean {
  const def = buildingBySlot(zone);
  return def?.transit !== undefined && unlockedFor(def, city);
}

export function transitUnlockLabel(zone: Zone): string | undefined {
  return buildingBySlot(zone)?.unlock?.label;
}
