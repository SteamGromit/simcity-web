/**
 * Where a car is inside a road tile.
 *
 * A tile is the unit square; a car enters across one edge and leaves across
 * another, keeping to the right of its direction of travel by `LANE_OFF`.
 * Straight through is a line; a turn is a quadratic Bezier whose control
 * point is where the two lane lines cross, so a right turn is tight and a
 * left turn sweeps across the junction box; a dead end is a cubic loop out
 * to the far side of the tile and back. Positions are by arc length, so a
 * car's speed is honest through a bend. Pure; the automata read it.
 */
import { GRID } from '../sim/types';

/** Tile edges: north (y−1), east (x+1), south (y+1), west (x−1). */
export type Edge = 0 | 1 | 2 | 3;

export const EDGE_DIR: readonly [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

const EDGE_MID: readonly [number, number][] = [
  [0.5, 0],
  [1, 0.5],
  [0.5, 1],
  [0, 0.5],
];

/** How far a lane sits from the centre line of a two-way street, in tiles. */
export const LANE_OFF = 0.21;

export function opposite(e: Edge): Edge {
  return ((e + 2) & 3) as Edge;
}

/** The edge of `from` that faces the 4-adjacent tile `to`. */
export function edgeToward(from: number, to: number): Edge {
  const dx = (to % GRID) - (from % GRID);
  const dy = ((to / GRID) | 0) - ((from / GRID) | 0);
  if (dy === -1 && dx === 0) return 0;
  if (dx === 1 && dy === 0) return 1;
  if (dy === 1 && dx === 0) return 2;
  if (dx === -1 && dy === 0) return 3;
  throw new Error(`tiles ${from} and ${to} are not neighbours`);
}

/** −1 a left turn, 1 a right turn, 0 straight on or back the way it came. */
export function isTurn(entry: Edge, exit: Edge): -1 | 0 | 1 {
  const d = EDGE_DIR[opposite(entry)];
  const e = EDGE_DIR[exit];
  const cross = d[0] * e[1] - d[1] * e[0];
  return cross > 0 ? 1 : cross < 0 ? -1 : 0;
}

export interface Segment {
  kind: 'line' | 'turn' | 'uturn';
  p0: [number, number];
  p1: [number, number];
  /** The quadratic control point of a turn (where the lane lines cross);
   * for the other kinds, the curve's midpoint. */
  c: [number, number];
  /** Cubic controls the curve is evaluated with. */
  c1: [number, number];
  c2: [number, number];
  /** Arc length in tiles. */
  length: number;
  /** Cumulative arc length at t = k / LUT_N. */
  lut: Float64Array;
}

const LUT_N = 32;

type P = [number, number];
const add = (a: P, b: P, k = 1): P => [a[0] + b[0] * k, a[1] + b[1] * k];

function cubic(seg: Pick<Segment, 'p0' | 'c1' | 'c2' | 'p1'>, t: number): P {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [
    a * seg.p0[0] + b * seg.c1[0] + c * seg.c2[0] + d * seg.p1[0],
    a * seg.p0[1] + b * seg.c1[1] + c * seg.c2[1] + d * seg.p1[1],
  ];
}

function cubicTangent(seg: Pick<Segment, 'p0' | 'c1' | 'c2' | 'p1'>, t: number): P {
  const u = 1 - t;
  return [
    3 * u * u * (seg.c1[0] - seg.p0[0]) + 6 * u * t * (seg.c2[0] - seg.c1[0]) + 3 * t * t * (seg.p1[0] - seg.c2[0]),
    3 * u * u * (seg.c1[1] - seg.p0[1]) + 6 * u * t * (seg.c2[1] - seg.c1[1]) + 3 * t * t * (seg.p1[1] - seg.c2[1]),
  ];
}

const memo = new Map<string, Segment>();

/** The curve a car follows from `entry` to `exit`, keeping `laneOff` to the right. */
export function segment(entry: Edge, exit: Edge, laneOff: number): Segment {
  const key = `${entry}.${exit}.${laneOff}`;
  const hit = memo.get(key);
  if (hit) return hit;

  const dIn = EDGE_DIR[opposite(entry)];
  const dOut = EDGE_DIR[exit];
  const rIn: P = [-dIn[1], dIn[0]];
  const rOut: P = [-dOut[1], dOut[0]];
  const p0 = add(EDGE_MID[entry], rIn, laneOff);
  const p1 = add(EDGE_MID[exit], rOut, laneOff);

  let kind: Segment['kind'];
  let c: P;
  let c1: P;
  let c2: P;
  if (exit === opposite(entry)) {
    kind = 'line';
    c1 = add(p0, add(p1, p0, -1), 1 / 3);
    c2 = add(p0, add(p1, p0, -1), 2 / 3);
    c = add(p0, add(p1, p0, -1), 0.5);
  } else if (exit === entry) {
    kind = 'uturn';
    c1 = add(p0, dIn, 0.7);
    c2 = add(p1, dIn, 0.7);
    c = cubic({ p0, c1, c2, p1 }, 0.5);
  } else {
    kind = 'turn';
    // the entry lane line and the exit lane line are perpendicular and
    // axis-aligned, so they cross at one coordinate from each
    c = dIn[0] !== 0 ? [p1[0], p0[1]] : [p0[0], p1[1]];
    // exact degree elevation of the quadratic
    c1 = add(p0, add(c, p0, -1), 2 / 3);
    c2 = add(p1, add(c, p1, -1), 2 / 3);
  }

  const seg: Segment = { kind, p0, p1, c, c1, c2, length: 0, lut: new Float64Array(LUT_N + 1) };
  let prev = p0;
  for (let k = 1; k <= LUT_N; k++) {
    const p = cubic(seg, k / LUT_N);
    seg.lut[k] = seg.lut[k - 1] + Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    prev = p;
  }
  seg.length = seg.lut[LUT_N];
  memo.set(key, seg);
  return seg;
}

/** Curve parameter for an arc-length fraction `s` in 0..1. */
function paramAt(seg: Segment, s: number): number {
  const target = Math.min(1, Math.max(0, s)) * seg.length;
  let lo = 0;
  let hi = LUT_N;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (seg.lut[mid] <= target) lo = mid;
    else hi = mid;
  }
  const span = seg.lut[hi] - seg.lut[lo];
  const frac = span > 0 ? (target - seg.lut[lo]) / span : 0;
  return (lo + frac) / LUT_N;
}

/** Tile-local position at arc-length fraction `s`. */
export function pointAt(seg: Segment, s: number): [number, number] {
  return cubic(seg, paramAt(seg, s));
}

/** Direction of travel at arc-length fraction `s`, grid radians (0 = +x). */
export function headingAt(seg: Segment, s: number): number {
  const d = cubicTangent(seg, paramAt(seg, s));
  return Math.atan2(d[1], d[0]);
}
