import { CityState, GRID, Zone } from './types';
import { roadAccess } from './traffic';

export type TipId =
  | 'welcome'
  | 'no-power-plant'
  | 'unpowered-zones'
  | 'no-road-access'
  | 'no-fire-coverage'
  | 'deficit'
  | 'high-taxes'
  | 'pollution'
  | 'abandoned';

export interface Tip {
  id: TipId;
  text: string;
}

const TIP_TEXT: Record<TipId, string> = {
  welcome:
    'Welcome! Lay a Road, zone Residential beside it, and build a Coal Plant. Press ? for help.',
  'no-power-plant': 'Your zones have no electricity — build a Coal Plant to get things growing.',
  'unpowered-zones':
    'Some zones are unpowered — string Power Lines from the plant (roads carry wires too).',
  'no-road-access': 'Some zones have no road within reach — buildings only develop next to roads.',
  'no-fire-coverage':
    'Buildings outside fire coverage can burn down — build a Fire Station nearby.',
  deficit: 'The budget is running a deficit — raise taxes a notch or trim service buildings.',
  'high-taxes': 'A tax rate above 12% strangles demand — ease it back toward 9%.',
  pollution:
    'Residents are choking on pollution — keep industry downwind and add parks or trees.',
  abandoned:
    'Buildings are abandoned — check commute times, demand, and desirability (use Query).',
};

const isRci = (z: Zone) =>
  z === Zone.Residential || z === Zone.Commercial || z === Zone.Industrial;

/**
 * Contextual advisor: inspect the city and return every applicable tip,
 * highest-priority first. Pure — the UI decides what to show and when.
 */
export function adviseTips(city: CityState): Tip[] {
  let zonedTiles = 0;
  let builtAnything = false;
  let hasPlant = false;
  let unpoweredZones = 0;
  let roadlessZones = 0;
  let uncoveredBuildings = 0;
  let pollutedHomes = 0;
  let abandonedCount = 0;

  for (let i = 0; i < city.tiles.length; i++) {
    const t = city.tiles[i];
    if (t.zone !== Zone.None) builtAnything = true;
    if (t.zone === Zone.PowerPlant) hasPlant = true;
    if (!isRci(t.zone)) continue;
    zonedTiles++;
    if (t.abandoned) abandonedCount++;
    if (!t.powered && t.stage === 0 && !t.abandoned) unpoweredZones++;
    if (!roadAccess(city, i % GRID, (i / GRID) | 0)) roadlessZones++;
    if (t.stage > 0 && !t.abandoned) {
      if (t.fireCov === 0) uncoveredBuildings++;
      if (t.zone === Zone.Residential && t.pollution > 0.5) pollutedHomes++;
    }
  }

  const tips: Tip[] = [];
  const add = (id: TipId) => tips.push({ id, text: TIP_TEXT[id] });

  if (!builtAnything) {
    add('welcome');
    return tips;
  }
  if (zonedTiles > 0 && !hasPlant) add('no-power-plant');
  if (hasPlant && unpoweredZones > 0) add('unpowered-zones');
  if (roadlessZones > 0) add('no-road-access');
  if (uncoveredBuildings > 0) add('no-fire-coverage');
  if (city.lastBudget.net < 0) add('deficit');
  if (city.taxes.r > 0.12 || city.taxes.c > 0.12 || city.taxes.i > 0.12) add('high-taxes');
  if (pollutedHomes > 0) add('pollution');
  if (abandonedCount > 0) add('abandoned');
  return tips;
}
