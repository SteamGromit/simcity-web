import { tilesWithin } from './grid';
import { CityState, GRID, Terrain, Zone, mapScaled } from './types';

const BASE = 0.3;
/** How hard uncollected refuse on the lot drags its value down. */
const GARBAGE_PENALTY = 0.35;
// 64-era bases — bonuses keep their share of a district on any map
const PARK_RADIUS = mapScaled(3);
const WATER_RADIUS = mapScaled(2);
const FOREST_RADIUS = mapScaled(1);
// commutes are physically longer on a bigger map; the painless band
// and the penalty ramp stretch with it
const COMMUTE_GRACE = mapScaled(8);
const COMMUTE_RAMP = mapScaled(40);

/** Land value = base + parks + service coverage − pollution − commute drag, clamped 0..1. */
export function updateLandValue(city: CityState): void {
  const parkBonus = new Float64Array(GRID * GRID);
  for (let i = 0; i < city.tiles.length; i++) {
    const tile = city.tiles[i];
    const x = i % GRID;
    const y = (i / GRID) | 0;
    if (tile.zone === Zone.Park) {
      for (const [nx, ny] of tilesWithin(x, y, PARK_RADIUS)) {
        const d = Math.max(Math.abs(nx - x), Math.abs(ny - y));
        parkBonus[ny * GRID + nx] += 0.25 * (1 - d / (PARK_RADIUS + 1));
      }
    } else if (tile.terrain === Terrain.Water) {
      for (const [nx, ny] of tilesWithin(x, y, WATER_RADIUS)) {
        const d = Math.max(Math.abs(nx - x), Math.abs(ny - y));
        parkBonus[ny * GRID + nx] += 0.08 * (1 - d / (WATER_RADIUS + 1));
      }
    } else if (tile.terrain === Terrain.Forest) {
      for (const [nx, ny] of tilesWithin(x, y, FOREST_RADIUS)) {
        const d = Math.max(Math.abs(nx - x), Math.abs(ny - y));
        parkBonus[ny * GRID + nx] += 0.05 * (1 - d / (FOREST_RADIUS + 1));
      }
    }
  }

  for (let i = 0; i < city.tiles.length; i++) {
    const t = city.tiles[i];
    const zoned =
      t.zone === Zone.Residential || t.zone === Zone.Commercial || t.zone === Zone.Industrial;
    // Commutes inside the grace band are painless; only long hauls drag value down.
    const commutePenalty = !zoned
      ? 0
      : Number.isFinite(t.commute)
        ? Math.min(0.25, Math.max(0, t.commute - COMMUTE_GRACE) / COMMUTE_RAMP)
        : 0.15;
    const serviceBonus = 0.12 * ((t.fireCov + t.policeCov + t.schoolCov) / 3);
    const viewBonus = 0.03 * t.elevation; // hillside views
    const v =
      BASE + parkBonus[i] + serviceBonus + viewBonus -
      0.5 * t.pollution - commutePenalty - GARBAGE_PENALTY * t.garbage;
    t.landValue = Math.max(0, Math.min(1, v));
  }
}
