import { describe, expect, test } from 'vitest';
import {
  LIGHT,
  Pt,
  SUN_DX,
  SUN_DY,
  convexHull,
  shadowOffset,
  shadowQuad,
  wallLight,
} from '../src/render/sun';
import { TILE_H, TILE_W, setViewAngle, tileGeom } from '../src/render/iso';

const area = (pts: Pt[]) => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
};

describe('the sun', () => {
  test('throws shadows down and to the right, the way the light is set', () => {
    const [dx, dy] = shadowOffset(100);
    expect(dx).toBeGreaterThan(0);
    expect(dy).toBeGreaterThan(0);
  });

  test('the shadow lies along the ground plane rather than diving into it', () => {
    // a ground direction projects with |Δy/Δx| between the tile's own slope
    // (0.5) and roughly twice it; anything steeper reads as pasted on
    const slope = SUN_DY / SUN_DX;
    expect(slope).toBeGreaterThan(0.4);
    expect(slope).toBeLessThan(1.1);
  });

  test('shadow length scales with height', () => {
    const short = shadowOffset(10);
    const tall = shadowOffset(100);
    expect(tall[0]).toBeCloseTo(short[0] * 10, 6);
    expect(tall[1]).toBeCloseTo(short[1] * 10, 6);
  });

  test('a ground-level mass casts nothing', () => {
    expect(shadowOffset(0)).toEqual([0, 0]);
  });
});

describe('convexHull', () => {
  test('returns the corners of a square, dropping interior points', () => {
    const hull = convexHull([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [5, 5],
      [3, 7],
    ]);
    expect(hull).toHaveLength(4);
    expect(area(hull)).toBeCloseTo(100, 6);
  });

  test('passes degenerate inputs through untouched', () => {
    expect(convexHull([])).toEqual([]);
    expect(convexHull([[1, 2]])).toEqual([[1, 2]]);
    expect(convexHull([[1, 2], [3, 4]])).toHaveLength(2);
  });

  test('drops collinear points on an edge', () => {
    const hull = convexHull([
      [0, 0],
      [5, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]);
    expect(hull).toHaveLength(4);
  });
});

describe('shadowQuad', () => {
  const foot: Pt[] = [
    [0, -TILE_H / 2],
    [TILE_W / 2, 0],
    [0, TILE_H / 2],
    [-TILE_W / 2, 0],
  ];

  test('a zero-height mass casts exactly its own footprint', () => {
    expect(area(shadowQuad(foot, 0))).toBeCloseTo(area(foot), 6);
  });

  test('a taller mass casts a strictly larger shadow', () => {
    let last = area(shadowQuad(foot, 0));
    for (const h of [10, 40, 90, 160]) {
      const next = area(shadowQuad(foot, h));
      expect(next).toBeGreaterThan(last);
      last = next;
    }
  });

  test('the shadow contains the footprint it comes from', () => {
    const quad = shadowQuad(foot, 80);
    const xs = quad.map((p) => p[0]);
    const ys = quad.map((p) => p[1]);
    for (const [fx, fy] of foot) {
      expect(fx).toBeGreaterThanOrEqual(Math.min(...xs) - 1e-9);
      expect(fx).toBeLessThanOrEqual(Math.max(...xs) + 1e-9);
      expect(fy).toBeGreaterThanOrEqual(Math.min(...ys) - 1e-9);
      expect(fy).toBeLessThanOrEqual(Math.max(...ys) + 1e-9);
    }
  });

  test('it reaches away from the light, never back toward it', () => {
    const quad = shadowQuad(foot, 100);
    const [dx, dy] = shadowOffset(100);
    expect(Math.max(...quad.map((p) => p[0]))).toBeCloseTo(TILE_W / 2 + dx, 6);
    expect(Math.max(...quad.map((p) => p[1]))).toBeCloseTo(TILE_H / 2 + dy, 6);
  });
});

describe('wallLight', () => {
  test('the screen-left wall of a tile takes more light than the right one', () => {
    setViewAngle(0);
    const g = tileGeom(10, 10);
    const [n, e, s, w] = g.corners;
    const right = wallLight(e[0], e[1], s[0], s[1]); // E→S, grid +x normal
    const left = wallLight(s[0], s[1], w[0], w[1]); // S→W, grid +y normal
    expect(left).toBe(LIGHT.left);
    expect(right).toBe(LIGHT.right);
    expect(left).toBeGreaterThan(right);
    void n;
  });

  test('roofs are the brightest surface and ambient the dimmest', () => {
    expect(LIGHT.roof).toBeGreaterThan(LIGHT.left);
    expect(LIGHT.left).toBeGreaterThan(LIGHT.right);
    expect(LIGHT.right).toBeGreaterThan(LIGHT.ambient);
  });
});
