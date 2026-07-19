import { tilesWithin } from './grid';
import { CityState, GRID, Zone } from './types';

const SPREAD = 5; // Chebyshev radius an emitter reaches

function emission(city: CityState, i: number): number {
  const t = city.tiles[i];
  // Clean Air Act scrubs industry and traffic (the coal plant is exempt —
  // replace it, don't regulate it)
  const scrub = city.ordinances.cleanAir ? 0.7 : 1;
  if (t.zone === Zone.PowerPlant) return 1.0;
  if (t.abandoned && t.stage > 0) return 0.1;
  if (t.zone === Zone.Industrial && t.stage > 0) return (0.3 + 0.15 * t.stage) * scrub;
  // Roads are line sources — plumes from adjacent tiles stack, so the
  // per-tile cap must stay small or busy corridors saturate to 1.0.
  if (t.zone === Zone.Road && t.traffic > 0) return Math.min(0.06, t.traffic * 0.005) * scrub;
  return 0;
}

/** Splat each emitter with linear falloff; sum overlapping plumes, clamp to 1. */
export function updatePollution(city: CityState): void {
  const field = new Float64Array(GRID * GRID);
  for (let i = 0; i < city.tiles.length; i++) {
    const e = emission(city, i);
    if (e === 0) continue;
    const x = i % GRID;
    const y = (i / GRID) | 0;
    for (const [nx, ny] of tilesWithin(x, y, SPREAD)) {
      const d = Math.max(Math.abs(nx - x), Math.abs(ny - y));
      field[ny * GRID + nx] += e * (1 - d / SPREAD);
    }
  }
  for (let i = 0; i < city.tiles.length; i++) {
    city.tiles[i].pollution = Math.min(1, field[i]);
  }
}
