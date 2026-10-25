import { describe, expect, test } from 'vitest';
import { channels, footprintBudget } from '../src/render/archetypes';
import {
  DOOR_COLORS,
  frontWallFor,
  letteringDashes,
  SIGN_PALETTE,
  terracePlan,
  terraceRecipe,
} from '../src/render/frontage';
import type { Pt } from '../src/render/sun';
import { Zone } from '../src/sim/types';

// the two camera-facing walls of a diamond: left (S) and right (E)
const left: [Pt, Pt] = [[0, 16], [-32, 0]];
const right: [Pt, Pt] = [[32, 0], [0, 16]];

describe('frontage', () => {
  test('the front wall follows the street side, else the lowest wall', () => {
    expect(frontWallFor([left, right], 1)).toBe(1);
    expect(frontWallFor([left, right], 2)).toBe(0);
    expect(frontWallFor([right, left], 2)).toBe(1);
    // behind the building: the lowest wall (both tie at y 16, the first wins)
    expect(frontWallFor([left, right], 0)).toBe(0);
    expect(frontWallFor([left, right], -1)).toBe(0);
    expect(frontWallFor([], 1)).toBe(-1);
  });

  test('palettes', () => {
    expect(SIGN_PALETTE).toHaveLength(14);
    expect(new Set(SIGN_PALETTE).size).toBe(14);
    expect(DOOR_COLORS).toHaveLength(6);
  });

  test('a terrace plan reaches the lot edge on party sides and stays inside the budget elsewhere', () => {
    const budget = footprintBudget(2);
    // street to the north (side 0), partners east and west
    const mid = terracePlan(budget, (1 << 1) | (1 << 3), 0);
    expect(mid.cx - mid.a).toBeCloseTo(-0.5, 9);
    expect(mid.cx + mid.a).toBeCloseTo(0.5, 9);
    expect(mid.cy - mid.b).toBeGreaterThanOrEqual(-0.5);
    expect(mid.cy).toBeLessThan(0); // pulled toward the street
    // west end: free to the west, to the edge on the east
    const end = terracePlan(budget, 1 << 1, 0);
    expect(end.cx + end.a).toBeCloseTo(0.5, 9);
    expect(end.cx - end.a).toBeGreaterThan(-0.5);
    expect(end.cx - end.a).toBeCloseTo(-0.45 * budget, 9);
    // street to the east (side 1): the row runs along y and the house leans +x
    const e = terracePlan(budget, (1 << 0) | (1 << 2), 1);
    expect(e.cy - e.b).toBeCloseTo(-0.5, 9);
    expect(e.cy + e.b).toBeCloseTo(0.5, 9);
    expect(e.cx).toBeGreaterThan(0);
    expect(e.cx + e.a).toBeLessThanOrEqual(0.5);
    // a lone house (no partners) is inside the budget both ways
    const lone = terracePlan(budget, 0, 2);
    expect(lone.a * 2).toBeLessThanOrEqual(budget);
    expect(lone.b * 2).toBeLessThanOrEqual(budget);
  });

  test('the shared recipe: one full-width box, gabled houses, flat shops', () => {
    for (const zone of [Zone.Residential, Zone.Commercial]) {
      for (const tier of [1, 2, 3] as const) {
        const r = terraceRecipe(zone, tier);
        expect(r.boxes).toHaveLength(1);
        expect(r.boxes[0].hf).toBe(1);
        expect(r.boxes[0].w).toBe(1);
        expect(r.swatches.length).toBeGreaterThan(0);
      }
    }
    expect(terraceRecipe(Zone.Residential, 2).roof).toBe('gabled');
    expect(terraceRecipe(Zone.Commercial, 2).roof).toBe('parapet');
    expect(terraceRecipe(Zone.Commercial, 2).facade?.podium).toBe(1);
  });

  test('lettering dashes stay short and sum under the fascia', () => {
    for (let v = 0; v < 1; v += 0.05) {
      const d = letteringDashes(channels(v), 8);
      expect(d.length).toBeGreaterThan(0);
      for (const x of d) {
        expect(x).toBeGreaterThanOrEqual(0.04);
        expect(x).toBeLessThan(0.16);
      }
      expect(d.reduce((s, x) => s + x, 0)).toBeLessThanOrEqual(0.8);
    }
  });
});
