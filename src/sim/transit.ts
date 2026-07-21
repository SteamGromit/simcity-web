import { Zone, mapScaled } from './types';

export interface TransitSpec {
  /** Chebyshev coverage radius, same convention as SERVICE_RADII. */
  radius: number;
  /** Cars a covered trip still puts on the road (bus is 0.5). */
  share: number;
  /** City population required before the tool unlocks. */
  unlockPop: number;
  name: string;
}

/** The transit ladder above the bus stop. The bus itself stays a plain
 * service (SERVICE_RADII.bus, BUS_TRAFFIC_SHARE) — these are its
 * upgrades, unlocked by growth like the energy roster. */
export const TRANSIT_SPECS: Partial<Record<Zone, TransitSpec>> = {
  // 64-era bases keep the ladder strictly above the scaled bus at any map size
  [Zone.StreetcarStop]: { radius: mapScaled(6.5), share: 0.4, unlockPop: 5000, name: 'Streetcar Stop' },
  [Zone.MonorailStation]: { radius: mapScaled(8.5), share: 0.3, unlockPop: 15000, name: 'Monorail Station' },
  [Zone.SubwayStation]: { radius: mapScaled(10.5), share: 0.22, unlockPop: 30000, name: 'Subway Station' },
  [Zone.RailTerminal]: { radius: mapScaled(13), share: 0.15, unlockPop: 50000, name: 'Rail Terminal' },
};

export const TRANSIT_ZONES: Zone[] = Object.keys(TRANSIT_SPECS).map(Number) as Zone[];

export function isTransit(zone: Zone): boolean {
  return TRANSIT_SPECS[zone] !== undefined;
}

export function transitUnlocked(zone: Zone, population: number): boolean {
  const spec = TRANSIT_SPECS[zone];
  return spec !== undefined && population >= spec.unlockPop;
}
