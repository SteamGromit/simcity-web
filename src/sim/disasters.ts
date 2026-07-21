import { idx, inBounds, neighbors4, tilesWithin } from './grid';
import { Season, seasonOf } from './weather';
import {
  CityState,
  DisasterKind,
  FIRE_BURN_TICKS,
  GRID,
  HURRICANE_TICKS,
  PANDEMIC_MONTHS,
  RUBBLE_MONTHS,
  Terrain,
  TORNADO_TICKS,
  Zone,
} from './types';

const isBuilding = (z: Zone) =>
  z === Zone.Residential || z === Zone.Commercial || z === Zone.Industrial;

/** Monthly odds of each disaster striking a real city (pop gate applies). */
export const DISASTER_ODDS: Record<DisasterKind, number> = {
  tornado: 0.002,
  hurricane: 0.0015,
  pandemic: 0.002,
};
/** No random disasters until the town is worth destroying. */
export const DISASTER_MIN_POP = 500;

export function anyDisasterActive(city: CityState): boolean {
  const d = city.disasters;
  return d.tornado !== null || d.hurricaneTicks > 0 || d.pandemicMonths > 0;
}

export function spawnDisaster(city: CityState, kind: DisasterKind, rand: () => number): void {
  if (kind === 'tornado') {
    const x = 4 + Math.floor(rand() * (GRID - 8));
    const y = 4 + Math.floor(rand() * (GRID - 8));
    city.disasters.tornado = { x, y, ticksLeft: TORNADO_TICKS };
    city.notices.push('Tornado! A funnel has touched down — it grinds up everything it crosses.');
  } else if (kind === 'hurricane') {
    city.disasters.hurricaneTicks = HURRICANE_TICKS;
    city.notices.push('Hurricane! High winds batter the city — waterfront blocks take the worst.');
  } else {
    city.disasters.pandemicMonths = PANDEMIC_MONTHS;
    city.notices.push('Pandemic! Residents are falling ill — hospital coverage blunts the toll.');
  }
}

/** Knock one stage off a developed building; stage-1 shacks are flattened. */
function damage(city: CityState, i: number): void {
  const t = city.tiles[i];
  if (!isBuilding(t.zone) || t.stage === 0) return;
  const next = t.stage - 1;
  t.stage = next as typeof t.stage;
  t.rubble = RUBBLE_MONTHS;
  if (next === 0) t.abandoned = false;
}

/** Per-tick disaster physics: the tornado wanders and grinds, the
 * hurricane lashes the whole map (waterfront worst). */
export function updateDisasters(city: CityState, rand: () => number): void {
  const d = city.disasters;

  if (d.tornado) {
    const tor = d.tornado;
    for (const [nx, ny] of [[tor.x, tor.y] as [number, number], ...neighbors4(tor.x, tor.y)]) {
      if (!inBounds(nx, ny)) continue;
      const ni = idx(nx, ny);
      if (rand() < 0.5) damage(city, ni);
      const t = city.tiles[ni];
      if (isBuilding(t.zone) && t.stage > 0 && t.burning === 0 && rand() < 0.08) {
        t.burning = FIRE_BURN_TICKS; // shredded gas lines
      }
    }
    tor.x = Math.max(0, Math.min(GRID - 1, tor.x + Math.floor(rand() * 3) - 1));
    tor.y = Math.max(0, Math.min(GRID - 1, tor.y + Math.floor(rand() * 3) - 1));
    tor.ticksLeft -= 1;
    if (tor.ticksLeft <= 0) d.tornado = null;
  }

  if (d.hurricaneTicks > 0) {
    for (let i = 0; i < city.tiles.length; i++) {
      const t = city.tiles[i];
      if (!isBuilding(t.zone) || t.stage === 0) continue;
      const x = i % GRID;
      const y = (i / GRID) | 0;
      const surge = tilesWithin(x, y, 2).some(
        ([nx, ny]) => city.tiles[idx(nx, ny)].terrain === Terrain.Water,
      );
      if (rand() < (surge ? 0.05 : 0.02)) damage(city, i);
    }
    d.hurricaneTicks -= 1;
  }
}

/** Monthly cleanup: crews carry off one step of debris per month. */
export function rubbleMonthly(city: CityState): void {
  for (const t of city.tiles) {
    if (t.rubble > 0) t.rubble -= 1;
  }
}

/** Monthly pandemic toll: demand craters and uncovered homes empty out. */
export function pandemicMonthly(city: CityState, rand: () => number): void {
  if (city.disasters.pandemicMonths <= 0) return;
  // the Public Health Campaign blunts both the panic and the toll
  const relief = city.ordinances.healthDrive ? 0.5 : 1;
  city.demand.r = Math.max(-1, city.demand.r - 0.5 * relief);
  for (const t of city.tiles) {
    if (t.zone !== Zone.Residential || t.stage === 0 || t.abandoned) continue;
    if (rand() < 0.15 * relief * (1 - t.healthCov)) t.abandoned = true;
  }
  city.disasters.pandemicMonths -= 1;
}

/** Rare random strikes, one at a time, only once the city matters. */
/** Seasonal odds multipliers: tornado season is spring, hurricanes
 * peak in autumn, pandemics ride the winter. */
const SEASON_ODDS: Record<DisasterKind, Record<Season, number>> = {
  tornado: { spring: 2, summer: 1.5, autumn: 0.5, winter: 0.5 },
  hurricane: { spring: 0.3, summer: 1.5, autumn: 2, winter: 0.3 },
  pandemic: { spring: 0.6, summer: 0.6, autumn: 1.25, winter: 2 },
};

export function rollForDisaster(city: CityState, rand: () => number): void {
  if (city.population < DISASTER_MIN_POP || anyDisasterActive(city)) return;
  const season = seasonOf(city.month);
  for (const kind of Object.keys(DISASTER_ODDS) as DisasterKind[]) {
    let odds = DISASTER_ODDS[kind] * SEASON_ODDS[kind][season];
    // vaccination drives make outbreaks rarer, not the weather calmer
    if (kind === 'pandemic' && city.ordinances.healthDrive) odds /= 2;
    if (rand() < odds) {
      spawnDisaster(city, kind, rand);
      return;
    }
  }
}
