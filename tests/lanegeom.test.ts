import { describe, expect, test } from 'vitest';
import {
  EDGE_DIR,
  edgeToward,
  headingAt,
  isTurn,
  LANE_OFF,
  opposite,
  pointAt,
  segment,
  type Edge,
} from '../src/render/lanegeom';
import { idx } from '../src/sim/grid';

const EDGES: Edge[] = [0, 1, 2, 3];
const MID: [number, number][] = [
  [0.5, 0],
  [1, 0.5],
  [0.5, 1],
  [0, 0.5],
];
const angle = (d: [number, number]) => Math.atan2(d[1], d[0]);
const angleDiff = (a: number, b: number) => {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d);
};

describe('edges', () => {
  test('opposites and the edge toward a neighbour', () => {
    expect(EDGES.map(opposite)).toEqual([2, 3, 0, 1]);
    expect(edgeToward(idx(10, 10), idx(10, 9))).toBe(0);
    expect(edgeToward(idx(10, 10), idx(11, 10))).toBe(1);
    expect(edgeToward(idx(10, 10), idx(10, 11))).toBe(2);
    expect(edgeToward(idx(10, 10), idx(9, 10))).toBe(3);
  });

  test('turn sense: travelling east, south is on the right and north on the left', () => {
    expect(isTurn(3, 2)).toBe(1);
    expect(isTurn(3, 0)).toBe(-1);
    expect(isTurn(3, 1)).toBe(0);
    expect(isTurn(3, 3)).toBe(0);
    expect(isTurn(0, 3)).toBe(1); // southbound, west is on the right
  });
});

describe('segment', () => {
  test('entry and exit points sit on their edges, on the right of travel', () => {
    for (const entry of EDGES) {
      for (const exit of EDGES) {
        const seg = segment(entry, exit, LANE_OFF);
        const dIn = EDGE_DIR[opposite(entry)];
        const dOut = EDGE_DIR[exit];
        // right perpendicular of travel (dx, dy) is (−dy, dx)
        const rIn = [-dIn[1], dIn[0]];
        const rOut = [-dOut[1], dOut[0]];
        const m0 = MID[entry];
        const m1 = MID[exit];
        expect(seg.p0[0]).toBeCloseTo(m0[0] + rIn[0] * LANE_OFF, 9);
        expect(seg.p0[1]).toBeCloseTo(m0[1] + rIn[1] * LANE_OFF, 9);
        expect(seg.p1[0]).toBeCloseTo(m1[0] + rOut[0] * LANE_OFF, 9);
        expect(seg.p1[1]).toBeCloseTo(m1[1] + rOut[1] * LANE_OFF, 9);
      }
    }
  });

  test('straight through is one tile long and a lane width to the side', () => {
    const seg = segment(3, 1, LANE_OFF);
    expect(seg.kind).toBe('line');
    expect(seg.length).toBeCloseTo(1, 6);
    expect(seg.p0[1]).toBeCloseTo(0.5 + LANE_OFF, 9);
    expect(segment(3, 1, 0).p0[1]).toBeCloseTo(0.5, 9);
  });

  test('a right turn hugs the near corner; a left turn sweeps across', () => {
    const right = segment(3, 2, LANE_OFF); // east in, south out
    const left = segment(3, 0, LANE_OFF); // east in, north out
    expect(right.kind).toBe('turn');
    expect(right.c[0]).toBeLessThan(0.5);
    expect(right.c[1]).toBeGreaterThan(0.5);
    // the left turn's lane lines cross in the far quadrant, so the car
    // sweeps past the centre of the box before it comes round
    expect(left.c[0]).toBeGreaterThan(0.5);
    expect(left.c[1]).toBeGreaterThan(0.5);
    expect(right.length).toBeLessThan(left.length);
  });

  test('a dead end turns the car round inside the tile', () => {
    const u = segment(3, 3, LANE_OFF);
    expect(u.kind).toBe('uturn');
    let maxX = 0;
    for (let k = 0; k <= 32; k++) maxX = Math.max(maxX, pointAt(u, k / 32)[0]);
    expect(maxX).toBeGreaterThan(0.4);
    expect(maxX).toBeLessThan(1);
    expect(u.p1[1]).toBeCloseTo(0.5 - LANE_OFF, 9);
  });

  test('pointAt spans the curve and headingAt matches the edges', () => {
    for (const entry of EDGES) {
      for (const exit of EDGES) {
        for (const off of [0, LANE_OFF]) {
          const seg = segment(entry, exit, off);
          const a = pointAt(seg, 0);
          const b = pointAt(seg, 1);
          expect(a[0]).toBeCloseTo(seg.p0[0], 6);
          expect(a[1]).toBeCloseTo(seg.p0[1], 6);
          expect(b[0]).toBeCloseTo(seg.p1[0], 6);
          expect(b[1]).toBeCloseTo(seg.p1[1], 6);
          const hIn = angle(EDGE_DIR[opposite(entry)]);
          const hOut = angle(EDGE_DIR[exit]);
          expect(angleDiff(headingAt(seg, 0), hIn), `${entry}->${exit} start`).toBeLessThan(0.02);
          expect(angleDiff(headingAt(seg, 1), hOut), `${entry}->${exit} end`).toBeLessThan(0.02);
          // arc-length parametrisation: equal steps in s are equal steps in distance
          let prev = pointAt(seg, 0);
          const steps: number[] = [];
          for (let k = 1; k <= 16; k++) {
            const p = pointAt(seg, k / 16);
            steps.push(Math.hypot(p[0] - prev[0], p[1] - prev[1]));
            prev = p;
          }
          const mean = steps.reduce((x, y) => x + y, 0) / steps.length;
          for (const st of steps) expect(Math.abs(st - mean) / mean).toBeLessThan(0.06);
        }
      }
    }
  });

  test('length is within 2% of a fine integral', () => {
    for (const entry of EDGES) {
      for (const exit of EDGES) {
        const seg = segment(entry, exit, LANE_OFF);
        let len = 0;
        let prev = pointAt(seg, 0);
        for (let k = 1; k <= 1024; k++) {
          const p = pointAt(seg, k / 1024);
          len += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
          prev = p;
        }
        expect(Math.abs(len - seg.length) / seg.length).toBeLessThan(0.02);
      }
    }
  });

  test('segments are memoised', () => {
    expect(segment(0, 1, LANE_OFF)).toBe(segment(0, 1, LANE_OFF));
  });
});
