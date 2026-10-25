/**
 * Footways: where a person may walk. Every frontage road tile has a kerb
 * line along each edge that does not face another road, inset FOOT_IN from
 * the edge (the strip `roadart.ts` paints). A walker follows legs: a foot
 * leg along one kerb line, a cross leg over a junction arm at the ladder,
 * or a short corner link across the inside of a bend. All points are world
 * tile units (u east, v south); a leg is a straight line from p0 to p1.
 *
 * Pure: nothing here touches the canvas or the walkers themselves.
 */
import { idx, inBounds } from '../sim/grid';
import { drivable, frontage } from '../sim/roads';
import { CityState, GRID } from '../sim/types';
import { EDGE_DIR, opposite, type Edge } from './lanegeom';

export type { Edge } from './lanegeom';

/** Inset of the kerb line from the tile edge, in tiles. */
export const FOOT_IN = 0.12;

export type Pt = [number, number];

/** Along each edge, clockwise on screen (y down): N→E→S→W. */
export const ALONG: Pt[] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];
/** The corner each edge starts from, tile-local. Edge k runs corner k → corner k+1. */
const CORNER: Pt[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

/** A kerb line and a direction along it: `dir` +1 walks clockwise round the tile. */
export interface Kerb {
  tile: number;
  edge: Edge;
  dir: 1 | -1;
}

export type LegKind = 'foot' | 'cross' | 'corner' | 'back';

export interface Leg {
  kind: LegKind;
  /** The road tile the leg lies in, for bucketing and the demolition check. */
  on: number;
  p0: Pt;
  p1: Pt;
  len: number;
  /** The kerb whose far end this leg arrives at; successors are read from it. */
  ctx: Kerb;
  /** When set, the only successor is the foot leg along `ctx` from p1. */
  onto?: boolean;
  /** For links: the kerb the leg left, so it can be walked back. */
  from?: Kerb;
}

export interface Option {
  leg: Leg;
  weight: number;
}

const rot = (e: Edge, d: number): Edge => ((((e + d) % 4) + 4) % 4) as Edge;
const tileOf = (x: number, y: number): number => (inBounds(x, y) ? idx(x, y) : -1);
const isRoad = (city: CityState, t: number): boolean => t !== -1 && drivable(city.tiles[t]);
const walkable = (city: CityState, t: number): boolean => t !== -1 && frontage(city.tiles[t]);
const dist = (a: Pt, b: Pt): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** How many drivable neighbours a road tile has. */
export function armCount(city: CityState, tile: number): number {
  const x = tile % GRID;
  const y = (tile / GRID) | 0;
  let n = 0;
  for (let k = 0; k < 4; k++) if (isRoad(city, tileOf(x + EDGE_DIR[k][0], y + EDGE_DIR[k][1]))) n++;
  return n;
}

/** Is there a kerb line along `edge` of `tile`: a walkable road whose neighbour that way is not road. */
export function hasKerb(city: CityState, tile: number, edge: Edge): boolean {
  if (!walkable(city, tile)) return false;
  const x = tile % GRID;
  const y = (tile / GRID) | 0;
  return !isRoad(city, tileOf(x + EDGE_DIR[edge][0], y + EDGE_DIR[edge][1]));
}

/** The point `s` (0..1, clockwise) along the kerb line of `edge`, world units. */
export function kerbPoint(tile: number, edge: Edge, s: number): Pt {
  const x = tile % GRID;
  const y = (tile / GRID) | 0;
  return [
    x + CORNER[edge][0] + ALONG[edge][0] * s - EDGE_DIR[edge][0] * FOOT_IN,
    y + CORNER[edge][1] + ALONG[edge][1] * s - EDGE_DIR[edge][1] * FOOT_IN,
  ];
}

/** The kerb point in front of a lot's door: the midpoint of the street edge. */
export function midpointOf(tile: number, edge: Edge): Pt {
  return kerbPoint(tile, edge, 0.5);
}

/** The tile a world point lies in. */
export function tileAt(p: Pt): number {
  const x = Math.min(GRID - 1, Math.max(0, Math.floor(p[0])));
  const y = Math.min(GRID - 1, Math.max(0, Math.floor(p[1])));
  return idx(x, y);
}

function makeLeg(kind: LegKind, on: number, p0: Pt, p1: Pt, ctx: Kerb, extra: Partial<Leg> = {}): Leg {
  return { kind, on, p0, p1, len: dist(p0, p1), ctx, ...extra };
}

/**
 * The leg along a kerb line, trimmed to the kerb corner at either end where
 * the next edge round is also a kerb, and to the tile boundary where it is
 * not (so the next tile's kerb line carries straight on). `from` overrides
 * the start, for a walker joining the line part-way along.
 */
export function footLeg(city: CityState, tile: number, edge: Edge, dir: 1 | -1, from?: Pt): Leg {
  const startIn = hasKerb(city, tile, rot(edge, -dir)) ? FOOT_IN : 0;
  const endIn = hasKerb(city, tile, rot(edge, dir)) ? FOOT_IN : 0;
  const s0 = dir > 0 ? startIn : 1 - startIn;
  const s1 = dir > 0 ? 1 - endIn : endIn;
  const p0 = from ?? kerbPoint(tile, edge, s0);
  return makeLeg('foot', tile, p0, kerbPoint(tile, edge, s1), { tile, edge, dir });
}

/**
 * What a walker standing at `p`, the `dir` end of kerb line (tile, edge),
 * may do next. Weights: carry on 0.6, round a corner 0.25, cross 0.1.
 * Empty only when there is nowhere to go but back.
 */
function atEnd(city: CityState, k: Kerb, p: Pt, avoid?: Pt): Option[] {
  const { tile, edge, dir } = k;
  const x = tile % GRID;
  const y = (tile / GRID) | 0;
  const f: Pt = [ALONG[edge][0] * dir, ALONG[edge][1] * dir];
  const o = EDGE_DIR[edge];
  const c = dir > 0 ? CORNER[rot(edge, 1)] : CORNER[edge];
  const cw: Pt = [x + c[0], y + c[1]];
  const out: Option[] = [];

  // round a convex corner onto this tile's next kerb
  const kNext = rot(edge, dir);
  if (hasKerb(city, tile, kNext)) out.push({ leg: footLeg(city, tile, kNext, dir, p), weight: 0.25 });

  const J = tileOf(x + f[0], y + f[1]);
  if (walkable(city, J)) {
    if (hasKerb(city, J, edge)) {
      out.push({ leg: footLeg(city, J, edge, dir, p), weight: 0.6 });
    } else {
      const jx = J % GRID;
      const jy = (J / GRID) | 0;
      const D = tileOf(jx + o[0], jy + o[1]);
      if (isRoad(city, D)) {
        // across the arm on my side, along the ladder inset in J
        const eF = rot(edge, dir);
        const L = hasKerb(city, J, eF) ? 1 - FOOT_IN : 1;
        const pf: Pt = [cw[0] + f[0] * L - o[0] * FOOT_IN, cw[1] + f[1] * L - o[1] * FOOT_IN];
        out.push({ leg: makeLeg('cross', J, p, pf, { tile: J, edge, dir }, { from: k }), weight: 0.1 });
        // or round the inside of the bend onto the side road's kerb
        const eD = opposite(eF);
        if (walkable(city, D) && hasKerb(city, D, eD)) {
          const dirD = (ALONG[eD][0] * o[0] + ALONG[eD][1] * o[1] > 0 ? 1 : -1) as 1 | -1;
          const q: Pt = [cw[0] + f[0] * FOOT_IN, cw[1] + f[1] * FOOT_IN];
          out.push({
            leg: makeLeg('corner', J, p, q, { tile: D, edge: eD, dir: dirD }, { onto: true, from: k }),
            weight: 0.25,
          });
        }
      }
    }
    // across my own road at the junction mouth, to its other kerb
    const back = tileOf(x - o[0], y - o[1]);
    if (!isRoad(city, back) && armCount(city, J) >= 3) {
      const p2: Pt = [cw[0] - o[0] * (1 - FOOT_IN), cw[1] - o[1] * (1 - FOOT_IN)];
      out.push({
        leg: makeLeg('cross', J, p, p2, { tile, edge: opposite(edge), dir: -dir as 1 | -1 }, { from: k }),
        weight: 0.1,
      });
    }
  }
  return avoid ? out.filter((opt) => dist(opt.leg.p1, avoid) > 1e-6) : out;
}

/** The walker's reverse of a leg: back the way it came, then along the kerb it left. */
function reverse(leg: Leg): Leg {
  if (leg.kind === 'foot') return { ...leg, kind: 'back', p0: leg.p1, p1: leg.p0, ctx: { ...leg.ctx, dir: -leg.ctx.dir as 1 | -1 }, onto: true };
  const from = leg.from ?? leg.ctx;
  return makeLeg('back', leg.on, leg.p1, leg.p0, { ...from, dir: -from.dir as 1 | -1 }, { onto: true });
}

/**
 * Where a walker at the end of `leg` may go. Never empty while the leg's
 * road still stands: at worst the walker turns round.
 */
export function successors(city: CityState, leg: Leg): Option[] {
  if (leg.onto) return [{ leg: footLeg(city, leg.ctx.tile, leg.ctx.edge, leg.ctx.dir, leg.p1), weight: 1 }];
  const out = atEnd(city, leg.ctx, leg.p1, leg.p0);
  return out.length ? out : [{ leg: reverse(leg), weight: 1 }];
}

/**
 * The kerb in front of a lot's door, if a frontage road touches it: the
 * first of N, E, S, W, the order the lot art uses for its street side.
 */
export function doorOf(city: CityState, lot: number): { tile: number; edge: Edge; at: Pt } | null {
  const x = lot % GRID;
  const y = (lot / GRID) | 0;
  for (let k = 0; k < 4; k++) {
    const n = tileOf(x + EDGE_DIR[k][0], y + EDGE_DIR[k][1]);
    if (!walkable(city, n)) continue;
    const edge = opposite(k as Edge);
    return { tile: n, edge, at: midpointOf(n, edge) };
  }
  return null;
}
