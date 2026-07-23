import { allBuildings } from '../content/registry';
import { modifier } from './content';
import { idx, neighbors4, tilesWithin } from './grid';
import {
  CityState,
  FIRE_BURN_TICKS,
  FIRE_EXTINGUISH,
  FIRE_RISK,
  FIRE_SPREAD,
  GRID,
  Zone,
} from './types';

type CovField = 'fireCov' | 'policeCov' | 'schoolCov' | 'healthCov' | 'busCov';

const COV_FIELD: Record<string, CovField> = {
  fire: 'fireCov',
  police: 'policeCov',
  school: 'schoolCov',
  health: 'healthCov',
  bus: 'busCov',
};

interface ServiceEntry {
  zone: Zone;
  radius: number;
  field: CovField;
  share?: number;
}

/** Derived per call: content can be registered after this module is imported. */
function services(): ServiceEntry[] {
  const out: ServiceEntry[] = [];
  for (const b of allBuildings()) {
    if (b.service) {
      out.push({
        zone: b.slot as Zone,
        radius: b.service.radius,
        field: COV_FIELD[b.service.kind],
        share: b.service.share,
      });
    } else if (b.transit) {
      // the transit ladder rides the bus machinery: same coverage field,
      // wider radius, fewer cars per covered trip (Tile.transitShare)
      out.push({
        zone: b.slot as Zone,
        radius: b.transit.radius,
        field: 'busCov',
        share: b.transit.share,
      });
    }
  }
  return out;
}

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
  const table = services();
  const schoolBoost = modifier(city, 'coverage.school');
  for (let i = 0; i < city.tiles.length; i++) {
    const station = city.tiles[i];
    const service = table.find((s) => s.zone === station.zone);
    if (!service || !station.powered) continue;
    const x = i % GRID;
    const y = (i / GRID) | 0;
    for (const [nx, ny] of tilesWithin(x, y, service.radius)) {
      const d = Math.max(Math.abs(nx - x), Math.abs(ny - y));
      // R+1 denominator keeps the rim ring covered (same convention as parks)
      let cov = 1 - d / (service.radius + 1);
      if (service.field === 'schoolCov' && schoolBoost !== 1) {
        cov = Math.min(1, cov * schoolBoost); // Education Grant stretches reach
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
    let risk = FIRE_RISK * modifier(city, 'fire.ignition');
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
