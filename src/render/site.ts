/**
 * A lot's *site*: which way its street lies, whether the lots either side
 * along that street are terrace partners, and whether it is a corner. Pure:
 * no canvas, so the rules are testable. Screen sides follow `roadSideOf` in
 * lots.ts: a quarter turn moves grid side k to screen side k + quarter.
 */

import { underConstruction } from '../sim/develop';
import { idx, inBounds } from '../sim/grid';
import { frontage } from '../sim/roads';
import { normalizeTier } from '../sim/tiers';
import { CityState, GRID, Stage, Tile, Zone } from '../sim/types';

export interface Site {
  /** Screen side (0..3) of the nearest frontage road, or −1. */
  side: number;
  /** Screen side of a second frontage road on an adjacent side (a corner lot), or −1. */
  corner: number;
  /** Bitmask of screen sides (1 << side) whose neighbour is a terrace partner. */
  party: number;
}

export const NO_SITE: Site = { side: -1, corner: -1, party: 0 };

/** Grid sides in `roadSideOf` order: N, E, S, W. */
const DIRS: [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/** The stages at which a lot can be one house of a row. */
export function terraceBand(zone: Zone, stage: Stage): boolean {
  if (zone === Zone.Residential) return stage >= 1 && stage <= 3;
  if (zone === Zone.Commercial) return stage >= 1 && stage <= 4;
  return false;
}

function roadOn(city: CityState, x: number, y: number, k: number): boolean {
  const nx = x + DIRS[k][0];
  const ny = y + DIRS[k][1];
  return inBounds(nx, ny) && frontage(city.tiles[idx(nx, ny)]);
}

/** Grid side (0..3) of a frontage road touching the lot, first of N, E, S, W; −1 if none. */
export function streetSide(city: CityState, i: number): number {
  const x = i % GRID;
  const y = (i / GRID) | 0;
  for (let k = 0; k < 4; k++) if (roadOn(city, x, y, k)) return k;
  return -1;
}

function rowable(t: Tile): boolean {
  return t.anchor === -1 && !t.abandoned && terraceBand(t.zone, t.stage) && !underConstruction(t);
}

/**
 * Two lots are terrace partners when they are neighbours along the same
 * street, both single-tile, the same zone and tier, both in the row band,
 * both standing, and neither still a building site. The band, not the
 * stage: on a real street of houses almost no two neighbours share a stage
 * (18 of 997 on the demo city) while 382 share the band, and the row paints
 * at one height for its band so the roofline is level anyway.
 */
export function partners(city: CityState, i: number, j: number): boolean {
  if (!inBounds(j % GRID, (j / GRID) | 0)) return false;
  const a = city.tiles[i];
  const b = city.tiles[j];
  if (a.zone !== b.zone) return false;
  if (normalizeTier(a.zone, a.tier) !== normalizeTier(b.zone, b.tier)) return false;
  if (!rowable(a) || !rowable(b)) return false;
  const sa = streetSide(city, i);
  if (sa < 0 || sa !== streetSide(city, j)) return false;
  // j must be the neighbour along the street: perpendicular to the road's side
  const ax = i % GRID;
  const ay = (i / GRID) | 0;
  const bx = j % GRID;
  const by = (j / GRID) | 0;
  const dx = DIRS[sa][0];
  return dx === 0 ? by === ay && Math.abs(bx - ax) === 1 : bx === ax && Math.abs(by - ay) === 1;
}

/** The site of lot `i` as seen at `quarter`; `roadSide` is the renderer's screen side for it. */
export function siteOf(city: CityState, i: number, quarter: number, roadSide: number): Site {
  const gs = streetSide(city, i);
  if (gs < 0) return { side: roadSide, corner: -1, party: 0 };
  const x = i % GRID;
  const y = (i / GRID) | 0;
  const q = ((quarter % 4) + 4) % 4;
  let party = 0;
  let corner = -1;
  for (const k of [(gs + 1) % 4, (gs + 3) % 4]) {
    if (corner < 0 && roadOn(city, x, y, k)) corner = (k + q) % 4;
    const nx = x + DIRS[k][0];
    const ny = y + DIRS[k][1];
    if (inBounds(nx, ny) && partners(city, i, idx(nx, ny))) party |= 1 << ((k + q) % 4);
  }
  return { side: roadSide, corner, party };
}
