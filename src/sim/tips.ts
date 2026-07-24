import { isPlant } from './energy';
import { CityState, GRID, ROAD_CAPACITY, Zone } from './types';
import { roadAccess } from './traffic';

export type TipId =
  | 'disaster'
  | 'fire-burning'
  | 'welcome'
  | 'no-power-plant'
  | 'brownout'
  | 'unpowered-zones'
  | 'no-road-access'
  | 'no-fire-coverage'
  | 'no-water'
  | 'no-health'
  | 'no-garbage-pickup'
  | 'garbage-over-capacity'
  | 'crime-unpoliced'
  | 'crime-stretched'
  | 'accident-snarl'
  | 'congestion'
  | 'deficit'
  | 'high-taxes'
  | 'pollution'
  | 'abandoned';

export interface Tip {
  id: TipId;
  text: string;
}

const TIP_TEXT: Record<TipId, string> = {
  disaster:
    'Disaster in progress! Ride it out, fight the fires, and rebuild when the skies clear.',
  'fire-burning':
    'A fire is raging! It spreads to neighbors — fire coverage fights it; bulldoze a firebreak.',
  'no-water':
    'Buildings need running water to grow past stage 2 — build a Water Pump by open water and lay Pipes.',
  'no-health':
    'Tall buildings need a Hospital in reach to keep growing — build one near your towers.',
  'no-garbage-pickup':
    'Refuse is piling up in streets no collection reaches — a Landfill nearby will clear them, and blocks need pickup to grow past stage 3.',
  'garbage-over-capacity':
    'The city is throwing out more than it can process, so rubbish is mounting everywhere — add disposal capacity or enact the Recycling Program.',
  'crime-unpoliced':
    'Crime is high where no police patrol — build a Police Station near the hotspots, or a Prison to cover a wider area.',
  'crime-stretched':
    'Crime is creeping up even under police coverage — your force is stretched. Add stations, or enact the Neighborhood Watch.',
  'accident-snarl':
    'A crash is blocking traffic — fire crews clear wrecks faster with coverage nearby and the EMT Program. Driver Education means fewer of them.',
  congestion:
    'Roads are jamming and commutes are suffering — add parallel routes or Bus Stops.',
  welcome:
    'Welcome! Lay a Road, zone Residential beside it, and build a Coal Plant. Press ? for help.',
  'no-power-plant': 'Your zones have no electricity — build a Coal Plant to get things growing.',
  brownout:
    'The grid is over capacity and browning out — build another power plant to cover demand.',
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
  let unhealthyTowers = 0;
  let dryBuildings = 0;
  let pollutedHomes = 0;
  let abandonedCount = 0;
  let heapsWithPickup = 0;
  let heapsWithoutPickup = 0;
  let crimeUnpoliced = 0;
  let crimeUnderPolice = 0;
  let accidents = 0;
  let burningCount = 0;
  let jammedRoads = 0;

  for (let i = 0; i < city.tiles.length; i++) {
    const t = city.tiles[i];
    if (t.zone !== Zone.None) builtAnything = true;
    if (isPlant(t.zone)) hasPlant = true;
    if (t.zone === Zone.Road && t.traffic > ROAD_CAPACITY) jammedRoads++;
    if (t.zone === Zone.Road && t.accident > 0) accidents++;
    if (!isRci(t.zone)) continue;
    zonedTiles++;
    if (t.burning > 0) burningCount++;
    if (t.abandoned) abandonedCount++;
    if (!t.powered && t.stage === 0 && !t.abandoned) unpoweredZones++;
    if (!roadAccess(city, i % GRID, (i / GRID) | 0)) roadlessZones++;
    if (t.stage > 0 && !t.abandoned) {
      if (t.fireCov === 0) uncoveredBuildings++;
      if (t.stage >= 2 && !t.watered) dryBuildings++;
      if (t.stage >= 4 && t.zone !== Zone.Industrial && t.healthCov === 0) unhealthyTowers++;
      if (t.zone === Zone.Residential && t.pollution > 0.5) pollutedHomes++;
      // a heap with no pickup is a siting problem; with pickup it is capacity
      if (t.garbage > 0.05) {
        if (t.garbageCov > 0) heapsWithPickup++;
        else heapsWithoutPickup++;
      }
      // crime reads the same way: unpoliced hotspot vs stretched force
      if (t.crime > 0.35) {
        if (t.policeCov > 0) crimeUnderPolice++;
        else crimeUnpoliced++;
      }
    }
  }

  const overCapacity = city.waste.uncollected > 0 && heapsWithPickup > 0;

  const tips: Tip[] = [];
  const add = (id: TipId) => tips.push({ id, text: TIP_TEXT[id] });

  const d = city.disasters;
  if (d.tornado !== null || d.hurricaneTicks > 0 || d.pandemicMonths > 0) add('disaster');
  if (burningCount > 0) add('fire-burning');
  if (!builtAnything) {
    add('welcome');
    return tips;
  }
  if (zonedTiles > 0 && !hasPlant) add('no-power-plant');
  if (city.brownouts > 0) add('brownout');
  if (hasPlant && unpoweredZones > 0) add('unpowered-zones');
  if (roadlessZones > 0) add('no-road-access');
  if (uncoveredBuildings > 0) add('no-fire-coverage');
  if (dryBuildings > 0) add('no-water');
  if (unhealthyTowers > 0) add('no-health');
  // the two failures need different fixes, so never blur them into one tip
  if (heapsWithoutPickup > 0) add('no-garbage-pickup');
  if (overCapacity) add('garbage-over-capacity');
  if (crimeUnpoliced > 0) add('crime-unpoliced');
  else if (crimeUnderPolice > 0) add('crime-stretched');
  if (accidents > 0) add('accident-snarl');
  if (jammedRoads >= 5) add('congestion');
  if (city.lastBudget.net < 0) add('deficit');
  if (city.taxes.r > 0.12 || city.taxes.c > 0.12 || city.taxes.i > 0.12) add('high-taxes');
  if (pollutedHomes > 0) add('pollution');
  if (abandonedCount > 0) add('abandoned');
  return tips;
}
