/**
 * Refuse: what the city throws out, and whether anyone takes it away.
 *
 * Every other city service is pure coverage — inside the radius you're
 * served, outside you aren't. Garbage has a second constraint: the trash has
 * to physically go somewhere, and that somewhere has a monthly limit. So a
 * city can fail here two different ways, and the fixes differ:
 *
 *   - a district outside every radius is never picked up, however much spare
 *     capacity the city has;
 *   - a city over its total capacity leaves a share behind *everywhere* that
 *     is covered, however well-sited the dumps are.
 *
 * Keeping those separate is the whole point of the mechanic, so the shortfall
 * is shared proportionally across covered tiles rather than starving whichever
 * tile the loop happens to reach last.
 */

import { allBuildings, buildingBySlot } from '../content/registry';
import { modifier } from './content';
import { CityState, Tile, Zone } from './types';

/** Tonnes a month per stage, by what sits on the lot. */
const PER_STAGE: Partial<Record<Zone, number>> = {
  [Zone.Residential]: 3,
  [Zone.Commercial]: 2,
  [Zone.Industrial]: 4,
};

/** Dirty industry throws out more than a clean campus does. */
const INDUSTRY_SCALE: Record<string, number> = {
  ag: 0.5,
  dirty: 1.4,
  manu: 1.1,
  tech: 0.6,
};

/** However good the programme, a city never recycles all of it. */
const MAX_DIVERT = 0.6;

/** Tonnes one month of a full heap represents — sets how fast piles build. */
const HEAP_TONNES = 24;

/** How much of a heap a month of spare capacity can haul away. */
const HEAP_CLEARANCE = 0.15;

/**
 * What this tile puts out in a month, after the city's production modifier.
 * Exported so the Query panel and the tests can ask the same question the
 * monthly pass does.
 */
export function garbageOf(city: CityState, t: Tile): number {
  if (t.stage === 0 || t.abandoned) return 0;
  const per = PER_STAGE[t.zone];
  if (per === undefined) return 0;
  const kind = t.zone === Zone.Industrial ? INDUSTRY_SCALE[String(t.tier)] ?? 1 : 1;
  return per * t.stage * kind * modifier(city, 'garbage.production');
}

/** Every powered disposal building's contribution, summed. */
function disposal(city: CityState): { capacity: number; divert: number } {
  let capacity = 0;
  let divert = 0;
  for (const t of city.tiles) {
    if (!t.powered) continue;
    const waste = buildingBySlot(t.zone)?.waste;
    if (!waste) continue;
    capacity += waste.capacity;
    divert += waste.divert ?? 0;
  }
  return { capacity, divert: Math.min(MAX_DIVERT, divert) };
}

/** True when any registered building disposes of waste (used by the advisor). */
export function cityHasDisposal(): boolean {
  return allBuildings().some((b) => b.waste !== undefined);
}

/**
 * One month of refuse: produce, recycle, collect what the radius reaches and
 * the capacity allows, and pile the rest on the kerb.
 */
export function updateWasteMonthly(city: CityState): void {
  const { capacity, divert } = disposal(city);

  // 1. what everyone put out, and which of it a truck could even reach
  let produced = 0;
  let reachable = 0;
  const output = new Float64Array(city.tiles.length);
  for (let i = 0; i < city.tiles.length; i++) {
    const t = city.tiles[i];
    const g = garbageOf(city, t);
    if (g === 0) continue;
    output[i] = g;
    produced += g;
    if (t.garbageCov > 0) reachable += g;
  }

  // 2. recycling takes its share off the top, before anything needs burying
  const diverted = produced * divert;
  const afterDivert = 1 - divert;

  // 3. capacity is shared across everything the trucks can reach: if the city
  //    is over its limit, every covered tile keeps the same fraction
  const wantsDisposal = reachable * afterDivert;
  const served = wantsDisposal === 0 ? 1 : Math.min(1, capacity / wantsDisposal);

  let collected = 0;
  let uncollected = 0;

  for (let i = 0; i < city.tiles.length; i++) {
    const t = city.tiles[i];
    const g = output[i];

    if (g > 0) {
      const needing = g * afterDivert;
      const taken = t.garbageCov > 0 ? needing * served : 0;
      collected += taken;
      uncollected += needing - taken;
      // what nobody took becomes a heap; a full heap is HEAP_TONNES of refuse
      t.garbage = Math.min(1, t.garbage + (needing - taken) / HEAP_TONNES);
    }

    // 4. spare capacity works off the standing piles, gradually — a fixed
    //    problem should visibly clear over months rather than blink away
    if (t.garbage > 0 && t.garbageCov > 0 && served >= 1 && capacity > 0) {
      t.garbage = Math.max(0, t.garbage - HEAP_CLEARANCE);
    }
  }

  city.waste = {
    produced,
    diverted,
    capacity,
    collected,
    uncollected,
  };
}
