/**
 * Building safety: structures age, and a very old, unmaintained one can fall.
 *
 * The fifth field→roll→incident feature (fire, garbage, crime, accidents), and
 * the gentlest by far. Collapse is impossible until a building is a century
 * old and, even then, a tiny monthly chance that grows with age and is cut by
 * the Building Permits and Infrastructure Inspectors programmes. A collapse is
 * a raze — the same stage→0 + rubble the disasters already use.
 *
 * On any normal save nothing ever collapses; the mechanic is really about the
 * programmes and the Repair choice, not destruction.
 */

import { modifier } from './content';
import { COLLAPSE_AGE, CityState, GRID, RUBBLE_MONTHS, Zone } from './types';
import { capacityFor } from './tiers';

/** Base monthly collapse chance one ramp-span past the age gate, unmodified. */
const COLLAPSE_BASE = 0.004;
/** Years past the gate over which the chance ramps up to the base and beyond. */
const RAMP_MONTHS = 20 * 12;

const isBuilding = (zone: Zone): boolean =>
  zone === Zone.Residential || zone === Zone.Commercial || zone === Zone.Industrial;

/**
 * The monthly chance the building on tile `i` collapses. Zero for anything not
 * a standing building, and for anything younger than the age gate. Exported so
 * Query and the tests read exactly what the roll uses.
 */
export function collapseChance(city: CityState, i: number): number {
  const t = city.tiles[i];
  if (!isBuilding(t.zone) || t.stage === 0 || t.abandoned) return 0;
  if (t.age < COLLAPSE_AGE) return 0;
  const over = (t.age - COLLAPSE_AGE) / RAMP_MONTHS; // 0 at the gate, 1 a ramp later
  return Math.min(0.05, COLLAPSE_BASE * over * modifier(city, 'collapse.rate'));
}

/** Monthly: age every standing building by one month. */
export function ageBuildings(city: CityState): void {
  for (const t of city.tiles) {
    if (isBuilding(t.zone) && t.stage > 0 && !t.abandoned) t.age += 1;
  }
}

/** Monthly: roll each eligible building; a hit razes it. */
export function collapseRoll(city: CityState, rand: () => number): void {
  for (let i = 0; i < city.tiles.length; i++) {
    const p = collapseChance(city, i);
    if (p <= 0) continue;
    if (rand() < p) {
      const t = city.tiles[i];
      const lost = Math.max(1, Math.round(capacityFor(t.zone, t.tier, t.stage) / 4));
      t.stage = 0;
      t.abandoned = false;
      t.rubble = RUBBLE_MONTHS;
      t.age = 0;
      t.collapseFlash = 90;
      city.notices.push(
        `A building collapsed at (${i % GRID}, ${(i / GRID) | 0}) — ${lost} casualties reported.`,
      );
    }
  }
}
