/**
 * Pure helpers for what a lot shows the street: which visible wall faces the
 * road, the terrace recipe a row of houses shares, sign and door colours.
 * No canvas here; the painting is in buildings.ts.
 */

import { pickArchetype, type Archetype } from './archetypes';
import type { Pt } from './sun';
import { Stage, Tier, Zone } from '../sim/types';

/**
 * Index into `walls` (the camera-facing walls of a prism) of the one on
 * screen side 1 (the right-hand visible wall) or 2 (the left-hand one). Any
 * other side means the street is behind the building, and the lowest wall
 * carries the door as it always did, so the player still sees a front.
 */
export function frontWallFor(walls: [Pt, Pt][], side: number): number {
  if (walls.length === 0) return -1;
  const xs = walls.map(([a, b]) => a[0] + b[0]);
  if (side === 1) return xs.indexOf(Math.max(...xs));
  if (side === 2) return xs.indexOf(Math.min(...xs));
  let best = 0;
  let bestY = -Infinity;
  walls.forEach(([a, b], i) => {
    if (a[1] + b[1] > bestY) {
      bestY = a[1] + b[1];
      best = i;
    }
  });
  return best;
}

/** Fascia hues for shop signs: fourteen, far enough apart to read as different trades. */
export const SIGN_PALETTE: number[] = [4, 18, 32, 46, 62, 88, 120, 150, 172, 196, 214, 238, 268, 320];

/** Front doors, as css colours. */
export const DOOR_COLORS: string[] = ['#8e2f2a', '#1f3a5f', '#2d5a3c', '#c9a227', '#2a2a2e', '#e9e4d8'];

/**
 * Every house in a row uses one height bucket and one stage, so the
 * roofline is level: `growableHeight` otherwise jitters ±10 % by the lot's
 * own bucket and steps with the stage, and neighbours in a row rarely share
 * a stage. The row's stage is the middle of its band.
 */
export const TERRACE_BUCKET = 3;
export function terraceStage(zone: Zone): Stage {
  return zone === Zone.Commercial ? 3 : 2;
}

/** Depth of a terrace house as a fraction of the budgeted footprint. */
const TERRACE_DEPTH = 0.55;

/**
 * The recipe a row shares. One box the full width of the lot along the
 * street; houses are gabled with chimneys, shops flat with a cornice over a
 * one-floor shopfront.
 */
export function terraceRecipe(zone: Zone, tier: Tier): Archetype {
  const box = { ox: 0, oy: 0, f: 1, hf: 1, w: 1, d: TERRACE_DEPTH };
  // the row is built of what its family builds with
  const swatches = pickArchetype(zone, tier, terraceStage(zone), 0).swatches;
  if (zone === Zone.Commercial) {
    return {
      boxes: [box], roof: 'parapet', windows: 'punched',
      props: ['acUnit', 'vent'], facade: { cornice: true, podium: 1 }, swatches,
    };
  }
  return {
    boxes: [box], roof: 'gabled', windows: 'punched',
    props: ['chimney'], facade: tier === 1 ? { cornice: true, fireEscape: true } : { cornice: true }, swatches,
  };
}

export interface Plan {
  /** Centre in tile units from the tile centre, along grid x and y. */
  cx: number;
  cy: number;
  /** Half extents along grid x and y, tile units. */
  a: number;
  b: number;
}

/**
 * Where a terrace house stands: to the lot edge on each party side, the
 * budgeted width on a free side, and pulled toward the street so a strip of
 * yard is left behind. `side` is the street's screen side, `party` the
 * bitmask of screen sides with a partner, `budget` the footprint budget.
 */
export function terracePlan(budget: number, party: number, side: number): Plan {
  const alongX = side === 0 || side === 2; // the street runs along grid x
  const free = 0.45 * budget;
  // extents along the street: −lo .. +hi in tile units from the centre
  const lo = party & (1 << (alongX ? 3 : 0)) ? 0.5 : free;
  const hi = party & (1 << (alongX ? 1 : 2)) ? 0.5 : free;
  const along = (hi - lo) / 2;
  const half = (hi + lo) / 2;
  const depth = (TERRACE_DEPTH * budget) / 2;
  // toward the street: screen sides 0 (−y) and 3 (−x) are negative directions
  const toward = side === 0 || side === 3 ? -1 : 1;
  const shift = toward * (0.5 - depth - 0.1 * budget);
  return alongX
    ? { cx: along, cy: shift, a: half, b: depth }
    : { cx: shift, cy: along, a: depth, b: half };
}

/** Dash lengths for a fascia's lettering, fractions of its width, summing under 0.8. */
export function letteringDashes(chan: () => number, n: number): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let k = 0; k < n; k++) {
    const d = 0.04 + chan() * 0.12;
    if (sum + d > 0.8) break;
    out.push(d);
    sum += d;
  }
  return out;
}
