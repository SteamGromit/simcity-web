import { idx, neighbors4, tilesWithin } from './grid';
import { TRANSIT_SPECS, TRANSIT_ZONES } from './transit';
import {
  BUS_TRAFFIC_SHARE,
  CityState,
  FIRE_BURN_TICKS,
  FIRE_EXTINGUISH,
  FIRE_RISK,
  FIRE_SPREAD,
  GRID,
  SERVICE_RADII,
  Zone,
} from './types';

type CovField = 'fireCov' | 'policeCov' | 'schoolCov' | 'healthCov' | 'busCov';

const SERVICES: { zone: Zone; radius: number; field: CovField; share?: number }[] = [
  { zone: Zone.FireStation, radius: SERVICE_RADII.fire, field: 'fireCov' },
  { zone: Zone.PoliceStation, radius: SERVICE_RADII.police, field: 'policeCov' },
  { zone: Zone.School, radius: SERVICE_RADII.school, field: 'schoolCov' },
  { zone: Zone.Hospital, radius: SERVICE_RADII.health, field: 'healthCov' },
  { zone: Zone.BusStop, radius: SERVICE_RADII.bus, field: 'busCov', share: BUS_TRAFFIC_SHARE },
  // the transit ladder rides the bus machinery: same coverage field,
  // wider radius, fewer cars per covered trip (Tile.transitShare)
  ...TRANSIT_ZONES.map((zone) => ({
    zone,
    radius: TRANSIT_SPECS[zone]!.radius,
    field: 'busCov' as CovField,
    share: TRANSIT_SPECS[zone]!.share,
  })),
];

/**
 * Refresh service coverage: linear falloff from each powered station,
 * overlapping stations take the max. Run after updatePower.
 */
export function updateCoverage(city: CityState): void {
  for (const t of city.tiles) {
    t.fireCov = 0;
    t.policeCov = 0;
    t.schoolCov = 0;
    t.healthCov = 0;
    t.busCov = 0;
    t.transitShare = 1;
  }
  for (let i = 0; i < city.tiles.length; i++) {
    const station = city.tiles[i];
    const service = SERVICES.find((s) => s.zone === station.zone);
    if (!service || !station.powered) continue;
    const x = i % GRID;
    const y = (i / GRID) | 0;
    for (const [nx, ny] of tilesWithin(x, y, service.radius)) {
      const d = Math.max(Math.abs(nx - x), Math.abs(ny - y));
      // R+1 denominator keeps the rim ring covered (same convention as parks)
      let cov = 1 - d / (service.radius + 1);
      if (service.field === 'schoolCov' && city.ordinances.eduGrant) {
        cov = Math.min(1, cov * 1.25); // Education Grant stretches reach
      }
      const t = city.tiles[idx(nx, ny)];
      if (cov > t[service.field]) t[service.field] = cov;
      if (service.share !== undefined && service.share < t.transitShare) {
        t.transitShare = service.share;
      }
    }
  }
}

const isBuilding = (t: { zone: Zone }) =>
  t.zone === Zone.Residential || t.zone === Zone.Commercial || t.zone === Zone.Industrial;

/**
 * Monthly ignition roll: developed buildings with zero fire coverage can
 * catch fire. The fire itself burns and spreads per tick in updateFires.
 */
export function fireRisk(city: CityState, rand: () => number): void {
  for (let i = 0; i < city.tiles.length; i++) {
    const t = city.tiles[i];
    if (!isBuilding(t) || t.stage === 0 || t.abandoned || t.fireCov > 0 || t.burning > 0) continue;
    let risk = city.ordinances.fireCode ? FIRE_RISK / 2 : FIRE_RISK;
    if (city.weather.kind === 'rain' || city.weather.kind === 'snow') risk /= 2; // wet roofs
    if (city.biome === 'desert') risk *= 1.5; // dry air, drier timber
    if (rand() < risk) {
      t.burning = FIRE_BURN_TICKS;
      const x = i % GRID;
      const y = (i / GRID) | 0;
      city.notices.push(`Fire has broken out at (${x}, ${y})!`);
    }
  }
}

/**
 * Per-tick fire dynamics: coverage can extinguish a blaze, otherwise it
 * burns down toward destruction and rolls to spread to adjacent buildings
 * (developed or abandoned), throttled by their fire coverage. Newly caught
 * tiles start burning next tick — fire moves one tile per tick at most.
 */
export function updateFires(city: CityState, rand: () => number): void {
  const caught: number[] = [];
  for (let i = 0; i < city.tiles.length; i++) {
    const t = city.tiles[i];
    if (t.burning === 0) continue;

    if (rand() < t.fireCov * FIRE_EXTINGUISH) {
      t.burning = 0; // the fire department got there in time
      continue;
    }

    t.burning -= 1;
    const x = i % GRID;
    const y = (i / GRID) | 0;
    if (t.burning === 0) {
      t.stage = 0;
      t.abandoned = false;
      city.notices.push(`The building at (${x}, ${y}) burned to the ground.`);
    }

    for (const [nx, ny] of neighbors4(x, y)) {
      const n = city.tiles[idx(nx, ny)];
      if (!isBuilding(n) || n.burning > 0) continue;
      if (n.stage === 0 && !n.abandoned) continue;
      if (rand() < FIRE_SPREAD * (1 - n.fireCov)) caught.push(idx(nx, ny));
    }
  }
  for (const i of caught) city.tiles[i].burning = FIRE_BURN_TICKS;
}
