import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  faceLight,
  MODELS,
  paintVehicle,
  projectBoxes,
  spriteBounds,
  vehicleSprite,
  type BodyStyle,
} from '../src/render/vehiclemodel';
import { setViewAngle } from '../src/render/iso';
import { clearSprites, setCanvasFactory, spriteStats } from '../src/render/spritecache';
import { strictCtx, stubCanvasFactory } from './stubctx';

const QUARTERS: [number, number][] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];
const box = { x: 0, y: 0, z: 0, l: 9, w: 4, h: 2.5, paint: 'body' as const };

describe('projectBoxes', () => {
  test('a box shows exactly three faces at any heading', () => {
    for (const h of [0, 0.3, Math.PI / 2, 2.1, Math.PI, 5.0]) {
      const faces = projectBoxes([box], h, 1, 0);
      expect(faces, `heading ${h}`).toHaveLength(3);
      expect(faces.every((f) => f.pts.length === 4)).toBe(true);
    }
  });

  test('a quarter turn of the view equals a quarter turn of the heading', () => {
    const a = projectBoxes([box], 0.4, 1, 0);
    const b = projectBoxes([box], 0.4 - Math.PI / 2, 0, 1);
    expect(b).toHaveLength(a.length);
    const key = (f: { pts: [number, number][] }) =>
      f.pts
        .map(([x, y]) => `${x.toFixed(4)},${y.toFixed(4)}`)
        .sort()
        .join(' ');
    expect(b.map(key).sort()).toEqual(a.map(key).sort());
  });

  test('face light matches the building walls and stays in range', () => {
    expect(faceLight(0, 1, 1, 0)).toBeCloseTo(1.0, 5);
    expect(faceLight(1, 0, 1, 0)).toBeCloseTo(0.64, 5);
    for (let k = 0; k < 32; k++) {
      const a = (k / 32) * Math.PI * 2;
      const l = faceLight(Math.cos(a), Math.sin(a), 1, 0);
      expect(l).toBeGreaterThanOrEqual(0.64 - 1e-9);
      expect(l).toBeLessThanOrEqual(1.0 + 1e-9);
    }
  });

  test('the sprite bounds hold every corner of every model at every heading and quarter', () => {
    for (const style of Object.keys(MODELS) as BodyStyle[]) {
      for (let h16 = 0; h16 < 16; h16++) {
        for (const [c, s] of QUARTERS) {
          const faces = projectBoxes(MODELS[style], (h16 / 16) * Math.PI * 2, c, s);
          const spec = spriteBounds(faces);
          for (const f of faces) {
            for (const [x, y] of f.pts) {
              expect(x + spec.ax, `${style} h${h16}`).toBeGreaterThanOrEqual(1);
              expect(x + spec.ax, `${style} h${h16}`).toBeLessThanOrEqual(spec.w - 1);
              expect(y + spec.ay, `${style} h${h16}`).toBeGreaterThanOrEqual(1);
              expect(y + spec.ay, `${style} h${h16}`).toBeLessThanOrEqual(spec.h - 1);
            }
          }
        }
      }
    }
  });
});

describe('vehicle sprites', () => {
  beforeEach(() => {
    setCanvasFactory(stubCanvasFactory().factory);
    clearSprites();
  });
  afterEach(() => {
    setCanvasFactory(null);
    setViewAngle(0);
  });

  test('a vehicle bakes once per style, colour, heading step and quarter', () => {
    const before = spriteStats().bakes;
    vehicleSprite('saloon', '#c05045', 0.1, 0);
    vehicleSprite('saloon', '#c05045', 0.12, 0); // same 16th of a turn
    expect(spriteStats().bakes).toBe(before + 1);
    vehicleSprite('saloon', '#c05045', 0.1, 1);
    expect(spriteStats().bakes).toBe(before + 2);
    vehicleSprite('saloon', '#c05045', 0.1 + Math.PI / 8, 0);
    expect(spriteStats().bakes).toBe(before + 3);
  });

  test('painting live never asks for a negative radius and paints something', () => {
    const { ctx, trace, radii } = strictCtx();
    for (const style of Object.keys(MODELS) as BodyStyle[]) {
      paintVehicle(ctx, style, '#4a6fb0', 1.1, 1, 0);
    }
    expect(trace.some((t) => t.startsWith('fill('))).toBe(true);
    expect(radii.every((r) => r >= 0)).toBe(true);
  });
});
