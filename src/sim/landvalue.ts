import { tilesWithin } from './grid';
import { CityState, GRID, Terrain, Zone } from './types';

const BASE = 0.3;
const PARK_RADIUS = 3;
const WATER_RADIUS = 2;
const FOREST_RADIUS = 1;

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
    // Commutes up to 8 tiles are painless; only long hauls drag value down.
    const commutePenalty = !zoned
      ? 0
      : Number.isFinite(t.commute)
        ? Math.min(0.25, Math.max(0, t.commute - 8) / 40)
        : 0.15;
    const serviceBonus = 0.12 * ((t.fireCov + t.policeCov + t.schoolCov) / 3);
    const v = BASE + parkBonus[i] + serviceBonus - 0.5 * t.pollution - commutePenalty;
    t.landValue = Math.max(0, Math.min(1, v));
  }
}
