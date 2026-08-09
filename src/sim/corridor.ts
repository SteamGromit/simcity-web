/**
 * Carriageways: which way a wide road actually runs.
 *
 * The road ladder stamps a class-3 highway as four tiles across, but until now
 * that was all it was — four ordinary road tiles that happened to be beside
 * each other. Nothing recorded that they form a *corridor*, so every consumer
 * treated the band as a blob of street: the painter saw a tile with road on all
 * four sides and drew a junction (crosswalk ladders, no lane lines, a traffic
 * signal on top), and the automata picked a random neighbour each step, so cars
 * wandered sideways across the carriageway. Between them that is a parking lot,
 * not a motorway.
 *
 * This module supplies the missing fact. For any road tile it derives, from
 * purely local same-class adjacency:
 *
 *   - `axis`  which way the traffic runs — east–west (x) or north–south (y),
 *   - `span`  how many tiles the carriageway is across,
 *   - `pos`   where this tile sits across it, counting from the low edge.
 *
 * It is derived rather than stored, so saves need no new field and editing —
 * bulldozing a lane, punching a street across — re-reads correctly the moment
 * the tile changes.
 *
 * The direction of travel falls out of `pos`: traffic keeps right, so the two
 * halves of the cross-section run opposite ways, which is what turns a milling
 * crowd of cars into two streams.
 */

import { idx, inBounds } from './grid';
import type { RoadClass } from './roads';
import { CityState, Zone } from './types';

/**
 * The widest carriageway we will read as one corridor. Anything broader is
 * someone's asphalt plaza — two motorways laid side by side, say — and there
 * is no single direction of travel to give it, so it falls back to the plain
 * junction treatment.
 */
export const MAX_CORRIDOR_SPAN = 8;

export interface Corridor {
  /** Which way the traffic runs: 0 east–west (along x), 1 north–south (along y). */
  axis: 0 | 1;
  /** Tiles the carriageway occupies across the direction of travel. */
  span: number;
  /** This tile's index across the span, 0 at the low-coordinate edge. */
  pos: number;
}

/**
 * A tile counts toward a carriageway when it is road of the same class. A
 * planted median counts too — it is the middle of a boulevard's cross-section,
 * so leaving it out would tell each carriageway it stood alone and rob it of
 * the side of the road it is on.
 */
function sameClass(city: CityState, x: number, y: number, cls: RoadClass): boolean {
  if (!inBounds(x, y)) return false;
  const t = city.tiles[idx(x, y)];
  return t.zone === Zone.Road && t.road === cls;
}

/**
 * The contiguous run of same-class road through (x, y) along one grid axis.
 * Returns its length and how far into it the tile sits, counting from the low
 * coordinate. The walk stops at `MAX_CORRIDOR_SPAN + 1` in each direction —
 * long enough to tell a carriageway from a plaza, and short enough that this
 * stays a fixed handful of tile reads however long the motorway is.
 */
function runThrough(
  city: CityState,
  x: number,
  y: number,
  cls: RoadClass,
  dx: number,
  dy: number,
): { len: number; pos: number } {
  const cap = MAX_CORRIDOR_SPAN + 1;
  let back = 0;
  while (back < cap && sameClass(city, x - dx * (back + 1), y - dy * (back + 1), cls)) back++;
  let fwd = 0;
  while (fwd < cap && sameClass(city, x + dx * (fwd + 1), y + dy * (fwd + 1), cls)) fwd++;
  return { len: back + fwd + 1, pos: back };
}

/**
 * The carriageway this tile belongs to, or null when it is not part of one:
 * a plain street (one lane is not a carriageway), a planted median, a square
 * of asphalt with no longer axis, or an expanse too wide to read as a road.
 */
export function corridorAt(city: CityState, x: number, y: number): Corridor | null {
  if (!inBounds(x, y)) return null;
  const t = city.tiles[idx(x, y)];
  if (t.zone !== Zone.Road || t.median) return null;
  // A street is a single lane: it has no cross-section to describe, and every
  // junction rule the painter already has is the right one for it.
  if (t.road === 0) return null;

  const alongX = runThrough(city, x, y, t.road, 1, 0);
  const alongY = runThrough(city, x, y, t.road, 0, 1);
  // Equal reach both ways is a crossing or a square — no direction of travel.
  if (alongX.len === alongY.len) return null;

  const axis: 0 | 1 = alongX.len > alongY.len ? 0 : 1;
  const across = axis === 0 ? alongY : alongX;
  if (across.len > MAX_CORRIDOR_SPAN) return null;
  return { axis, span: across.len, pos: across.pos };
}

/**
 * The side (a `SIDE_DIRS` index) that cross-position 0 faces — north for an
 * east–west carriageway, west for a north–south one. The painter rotates this
 * with the camera, which is all it takes to keep the markings on the right
 * edges at any view angle.
 */
export function corridorLowSide(axis: 0 | 1): 0 | 3 {
  return axis === 0 ? 0 : 3;
}

/**
 * Which way traffic on this tile runs, as the sign of movement along the
 * corridor's axis. Traffic keeps right: heading east your right hand points
 * south, so the southern half of an east–west road is the eastbound one;
 * heading south your right hand points west, so the western half of a
 * north–south road is the southbound one.
 */
export function travelDir(c: Corridor): 1 | -1 {
  const highHalf = c.pos >= c.span / 2;
  if (c.axis === 0) return highHalf ? 1 : -1;
  return highHalf ? -1 : 1;
}

/** Is this the outside lane — the one that gets a shoulder or a kerb? */
export function isOuterEdge(c: Corridor): boolean {
  return c.pos === 0 || c.pos === c.span - 1;
}

/**
 * Is the boundary on the *low* side of this tile the centre of the road —
 * the line oncoming traffic sits behind? True only where the cross-section
 * divides evenly and this tile starts the high half.
 */
export function isCentreBoundary(c: Corridor, boundary: number): boolean {
  return c.span % 2 === 0 && boundary === c.span / 2;
}
