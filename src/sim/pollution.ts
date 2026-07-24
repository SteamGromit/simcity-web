import { buildingBySlot } from '../content/registry';
import { modifier } from './content';
import { isPlant } from './energy';
import { tilesWithin } from './grid';
import { pollutionScaleFor } from './tiers';
import { CityState, GRID, Zone } from './types';

// Deliberately NOT map-scaled: plumes sum across emitters, so a wider
// radius inflates dense-district pollution quadratically (the 10-year
// harness run saturated land value at mapScaled(5)). Pollution is local
// physics — the per-tile 64-era balance holds by keeping it absolute.
const SPREAD = 5; // Chebyshev radius an emitter reaches
/** What a full heap of uncollected refuse emits, on the same scale. */
const GARBAGE_EMISSION = 0.35;

function emission(city: CityState, i: number, industryScrub: number, trafficScrub: number): number {
  const t = city.tiles[i];
  // Clean Air Act scrubs industry and traffic (the coal plant is exempt —
  // replace it, don't regulate it)
  if (isPlant(t.zone)) return buildingBySlot(t.zone)?.power?.pollution ?? 0;
  // A tip stinks whether or not anything is piled on the streets nearby.
  const waste = buildingBySlot(t.zone)?.waste;
  if (waste?.pollution) return waste.pollution;
  // Refuse nobody collected: rotting in the street is its own emitter, and
  // it stacks with whatever the tile was already putting out.
  const heap = t.garbage * GARBAGE_EMISSION;
  if (t.abandoned && t.stage > 0) return 0.1 + heap;
  if (t.zone === Zone.Industrial && t.stage > 0) {
    return (0.3 + 0.15 * t.stage) * industryScrub * pollutionScaleFor(t.tier) + heap;
  }
  // Roads are line sources — plumes from adjacent tiles stack, so the
  // per-tile cap must stay small or busy corridors saturate to 1.0.
  if (t.zone === Zone.Road && t.traffic > 0) {
    return Math.min(0.06, t.traffic * 0.005) * trafficScrub + heap;
  }
  return heap;
}

/** Splat each emitter with linear falloff; sum overlapping plumes, clamp to 1. */
export function updatePollution(city: CityState): void {
  const field = new Float64Array(GRID * GRID);
  const industryScrub = modifier(city, 'pollution.industry');
  const trafficScrub = modifier(city, 'pollution.traffic');
  for (let i = 0; i < city.tiles.length; i++) {
    const e = emission(city, i, industryScrub, trafficScrub);
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
