import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  chimneyHeight,
  eaveOutline,
  effectiveRoofStyle,
  placeRoofProps,
  ridgeOf,
  roofCap,
  wantsHatch,
} from '../src/render/roofs';
import {
  chimneyHeight as chViaBuildings,
  placeRoofProps as viaBuildings,
} from '../src/render/buildings';
import { chamfer, tileRect } from '../src/render/massing';
import { hsl } from '../src/render/palette';
import { setViewAngle } from '../src/render/iso';
import { clearSprites, setCanvasFactory } from '../src/render/spritecache';
import { stubCanvasFactory, strictCtx } from './stubctx';

/** Point-in-convex-polygon for a clockwise (y-down) winding. */
const inside = (p: [number, number], poly: [number, number][]) => {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    if (cross < -1e-6) return false;
  }
  return true;
};

describe('eaveOutline', () => {
  test('contains the roof it grew from', () => {
    const roof = tileRect(0, -20, 0.3, 0.3);
    const eave = eaveOutline(roof, 3);
    for (const p of roof) expect(inside(p, eave)).toBe(true);
    expect(eave.length).toBe(4);
  });
  test('zero overhang is the identity', () => {
    const roof = tileRect(0, 0, 0.3, 0.2);
    expect(eaveOutline(roof, 0)).toEqual(roof);
  });
});

describe('ridgeOf', () => {
  test('ridge endpoints sit inside the roof and above it', () => {
    const roof = tileRect(0, 0, 0.4, 0.25);
    const [a, b] = ridgeOf(roof, 8);
    const top = Math.min(...roof.map((p) => p[1]));
    expect(a[1]).toBeLessThan(top + 8);
    expect(b[1]).toBeLessThan(top + 8);
    expect(inside([a[0], a[1] + 8], roof)).toBe(true);
    expect(inside([b[0], b[1] + 8], roof)).toBe(true);
  });
});

describe('roofCap', () => {
  beforeEach(() => {
    setCanvasFactory(stubCanvasFactory().factory);
    clearSprites();
  });
  afterEach(() => {
    setCanvasFactory(null);
    setViewAngle(0);
  });
  test('a chamfered plan takes a flat cap, never a ridge', () => {
    const { ctx, trace } = strictCtx();
    roofCap(ctx, chamfer(tileRect(0, 0, 0.3, 0.3), 0.25), 'gabled', hsl(20, 20, 50), 3);
    expect(trace.some((t) => t.startsWith('lineWidth=1.25'))).toBe(false); // the ridge cap's stroke width
  });
  test('a long slab under a gable falls back to flat', () => {
    const { ctx, trace } = strictCtx();
    roofCap(ctx, tileRect(0, 0, 0.45, 0.12), 'gabled', hsl(20, 20, 50), 3);
    expect(trace.some((t) => t.startsWith('lineWidth=1.25'))).toBe(false);
  });
  test('a square plan under a gable does get a ridge', () => {
    const { ctx, trace } = strictCtx();
    roofCap(ctx, tileRect(0, 0, 0.3, 0.3), 'gabled', hsl(20, 20, 50), 3);
    expect(trace.some((t) => t.startsWith('lineWidth=1.25'))).toBe(true);
  });
  test('gable, hip and mansard paint the same trace at every quarter', () => {
    for (const style of ['gabled', 'hipped', 'mansard'] as const) {
      const traces: string[] = [];
      for (const q of [0, 1, 2, 3]) {
        setViewAngle((q * Math.PI) / 2);
        const { ctx, trace } = strictCtx();
        roofCap(ctx, tileRect(0, 0, 0.3, 0.3), style, hsl(20, 20, 50), 3);
        traces.push(trace.join('\n'));
      }
      expect(new Set(traces).size).toBe(1);
    }
  });
});

describe('moved geometry keeps its values', () => {
  test('placeRoofProps and chimneyHeight are the same functions from either module', () => {
    expect(viaBuildings).toBe(placeRoofProps);
    expect(chViaBuildings).toBe(chimneyHeight);
    const h = chimneyHeight(1, 8);
    expect(h).toBeGreaterThanOrEqual(9);
    expect(h).toBeLessThanOrEqual(13);
  });
});

describe('effectiveRoofStyle', () => {
  test('a slab or a chamfered plan demotes a pitch to flat, a parapet stays', () => {
    expect(effectiveRoofStyle(tileRect(0, 0, 0.45, 0.12), 'gabled')).toBe('flat');
    expect(effectiveRoofStyle(chamfer(tileRect(0, 0, 0.3, 0.3), 0.25), 'hipped')).toBe('flat');
    expect(effectiveRoofStyle(tileRect(0, 0, 0.45, 0.12), 'parapet')).toBe('parapet');
    expect(effectiveRoofStyle(tileRect(0, 0, 0.3, 0.3), 'gabled')).toBe('gabled');
    expect(effectiveRoofStyle(tileRect(0, 0, 0.45, 0.12), 'sawtooth')).toBe('sawtooth');
  });
  test('only flat and parapet decks carry a hatch', () => {
    expect(wantsHatch('flat')).toBe(true);
    expect(wantsHatch('parapet')).toBe(true);
    for (const s of ['gabled', 'hipped', 'mansard', 'sawtooth'] as const) expect(wantsHatch(s)).toBe(false);
  });
});
