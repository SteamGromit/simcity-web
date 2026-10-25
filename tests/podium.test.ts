import { describe, expect, test } from 'vitest';
import { channels } from '../src/render/archetypes';
import { PLAN_SHAPES, podiumTower } from '../src/render/podium';

const EPS = 1e-9;

describe('podiumTower', () => {
  test('every box stays inside the footprint, exactly one reaches full height, every shape appears', () => {
    const shapes = new Set<string>();
    for (let v = 0; v < 1; v += 1 / 200) {
      for (const side of [-1, 0, 1, 2, 3]) {
        const { boxes, shape } = podiumTower(channels(v), side);
        shapes.add(shape);
        expect(boxes.filter((b) => b.hf === 1)).toHaveLength(1);
        for (const b of boxes) {
          const w = b.w ?? b.f;
          const d = b.d ?? b.f;
          expect(Math.abs(b.ox) + w / 2).toBeLessThanOrEqual(0.5 + EPS);
          expect(Math.abs(b.oy) + d / 2).toBeLessThanOrEqual(0.5 + EPS);
          expect(w).toBeGreaterThan(0.2);
          expect(d).toBeGreaterThan(0.2);
        }
      }
    }
    expect([...shapes].sort()).toEqual([...PLAN_SHAPES].sort());
  });

  test('the tower is flush with the street and set back on the far side', () => {
    const edge = (side: number) => (side === 1 || side === 2 ? 0.5 : -0.5);
    const perpOf = (side: number, b: { ox: number; oy: number; w?: number; d?: number; f: number }) =>
      side === 0 || side === 2 || side < 0 ? [b.oy, b.d ?? b.f] : [b.ox, b.w ?? b.f];
    for (let v = 0; v < 1; v += 1 / 60) {
      for (const side of [-1, 0, 1, 2, 3]) {
        const { boxes } = podiumTower(channels(v), side);
        const tower = boxes.filter((b) => b.hf > 0.5);
        const e = edge(side);
        // the nearest tower face to the street sits on the podium's street edge
        const near = Math.max(...tower.map((b) => { const [c, ext] = perpOf(side, b); return Math.sign(e) * (c + Math.sign(e) * (ext / 2)); }));
        expect(near).toBeCloseTo(0.5, 9);
        // and the far face is set back by at least a tenth of the lot
        const far = Math.min(...tower.map((b) => { const [c, ext] = perpOf(side, b); return Math.sign(e) * (c - Math.sign(e) * (ext / 2)); }));
        expect(far).toBeGreaterThan(-0.5 + 0.1 - EPS);
      }
    }
  });

  test('the podium is the whole footprint and a fifth to a third high', () => {
    for (let v = 0; v < 1; v += 0.07) {
      const [podium] = podiumTower(channels(v), 2).boxes;
      expect(podium.w).toBe(1);
      expect(podium.d).toBe(1);
      expect(podium.hf).toBeGreaterThanOrEqual(0.2);
      expect(podium.hf).toBeLessThanOrEqual(0.3);
    }
  });
});
