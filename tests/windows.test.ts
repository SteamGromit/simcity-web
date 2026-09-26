import { describe, expect, test } from 'vitest';
import { paintWindows, paneState, windowGrid, windowPlan } from '../src/render/windows';
import { hsl, material } from '../src/render/palette';
import { strictCtx } from './stubctx';

describe('windowGrid', () => {
  test('no panes on a wall under one floor', () => {
    expect(windowGrid(20, 8, windowPlan('punched', 8))).toEqual([]);
  });
  test('a starter house wall of 10 to 13 px still gets one row', () => {
    for (const h of [10, 11, 11.5, 12, 12.8, 13]) {
      const g = windowGrid(30, h, windowPlan('punched', h));
      expect(g.length, `h=${h}`).toBeGreaterThan(0);
      for (const p of g) expect(p.v + p.h).toBeLessThanOrEqual(h - 1.5 + 1e-9);
    }
  });
  test('every pane lies inside the face', () => {
    for (const pattern of ['punched', 'ribbon', 'curtain'] as const) {
      for (const [len, h] of [
        [24, 30],
        [60, 120],
        [12, 9.5],
      ] as const) {
        for (const p of windowGrid(len, h, windowPlan(pattern, h))) {
          expect(p.u).toBeGreaterThanOrEqual(0);
          expect(p.u + p.w).toBeLessThanOrEqual(1.0001);
          expect(p.v).toBeGreaterThanOrEqual(0);
          expect(p.v + p.h).toBeLessThanOrEqual(h);
        }
      }
    }
  });
  test('a podium base pushes the first row up', () => {
    const a = windowGrid(40, 60, windowPlan('punched', 60));
    const b = windowGrid(40, 60, windowPlan('punched', 60), 14);
    expect(b[0].v).toBeGreaterThan(a[0].v);
  });
  test('rows come in floor steps', () => {
    const plan = windowPlan('punched', 60);
    const g = windowGrid(40, 60, plan);
    const rows = [...new Set(g.map((p) => p.row))];
    expect(rows.length).toBeGreaterThan(3);
    const v0 = g.find((p) => p.row === 0)!.v;
    const v1 = g.find((p) => p.row === 1)!.v;
    expect(v1 - v0).toBeCloseTo(plan.floor, 5);
  });
});

describe('paneState', () => {
  test('is deterministic and covers every state over a big grid', () => {
    const seen = new Set<string>();
    for (let r = 0; r < 30; r++) for (let c = 0; c < 30; c++) seen.add(paneState(r, c, 7, 'punched'));
    expect(seen).toEqual(new Set(['clear', 'blind', 'curtain', 'dark', 'lit']));
    expect(paneState(3, 4, 7, 'punched')).toBe(paneState(3, 4, 7, 'punched'));
  });
});

describe('paintWindows', () => {
  test('glow mode paints only pane fills, never frames or reflections', () => {
    const { ctx, trace } = strictCtx();
    paintWindows(ctx, 40, 60, material('brick', hsl(10, 30, 40)), windowPlan('punched', 60), 1, 3, true, true);
    expect(trace.some((t) => t.startsWith('createLinearGradient'))).toBe(false);
    expect(trace.filter((t) => t.startsWith('fillRect')).length).toBeGreaterThan(0);
  });
  test('short walls draw nothing', () => {
    const { ctx, trace } = strictCtx();
    paintWindows(ctx, 40, 8, material('brick', hsl(10, 30, 40)), windowPlan('punched', 8), 1, 3, false, true);
    expect(trace.filter((t) => t.startsWith('fillRect')).length).toBe(0);
  });
});
