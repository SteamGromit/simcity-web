/**
 * Traffic accidents: the one hazard the road network was missing.
 *
 * Busy roads occasionally throw a crash that blocks the tile for a handful of
 * ticks. The routing already in place (roadDistanceTo in traffic.ts) does the
 * rest — traffic detours, commutes through the blockage lengthen or break
 * until it clears. Driver Education makes crashes rarer; fire coverage and the
 * EMT Program clear them faster.
 *
 * The fourth field→roll→incident feature (fire, garbage, crime), split the same
 * way fire is: a monthly roll (accidentRoll, like fireRisk) and a per-tick
 * countdown (updateAccidents, like updateFires).
 */

import { modifier } from './content';
import { ACCIDENT_MAX, CityState, GRID, ROAD_CAPACITY, Zone } from './types';

/** Per-unit-of-capacity monthly chance a busy road throws a crash. */
const ACCIDENT_RISK = 0.06;
/** A fresh wreck blocks the road this many ticks before any response. */
const BASE_TICKS = 24;
/** Share of the block fire coverage at the scene clears on its own. */
const EMS_RESPONSE = 0.5;

/** How long a crash at tile `i` would block the road, given the response it
 * gets. Exported so the roll and the tests agree on one formula. */
export function accidentDuration(city: CityState, i: number): number {
  const t = city.tiles[i];
  let ticks = BASE_TICKS * modifier(city, 'accident.duration');
  // Fire crews respond to crashes; coverage at the scene shortens the block,
  // and the EMT Program (via accident.duration) sharpens that response further.
  ticks *= 1 - EMS_RESPONSE * Math.min(1, t.fireCov);
  return Math.max(1, Math.min(ACCIDENT_MAX, Math.round(ticks)));
}

/** Monthly: each road tile carrying traffic may throw a crash, more likely the
 * busier it is, rarer with Driver Education. */
export function accidentRoll(city: CityState, rand: () => number): void {
  const rate = modifier(city, 'accident.rate');
  for (let i = 0; i < city.tiles.length; i++) {
    const t = city.tiles[i];
    if (t.zone !== Zone.Road || t.traffic <= 0 || t.accident > 0) continue;
    const p = ACCIDENT_RISK * (t.traffic / ROAD_CAPACITY) * rate;
    if (rand() < p) {
      t.accident = accidentDuration(city, i);
      city.notices.push(`A traffic accident is blocking the road at (${i % GRID}, ${(i / GRID) | 0}).`);
    }
  }
}

/** Per tick: count every block down; a tile hitting 0 is clear. */
export function updateAccidents(city: CityState): void {
  for (const t of city.tiles) {
    if (t.accident > 0) t.accident -= 1;
  }
}
