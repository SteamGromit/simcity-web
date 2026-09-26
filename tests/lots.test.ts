import { describe, expect, test } from 'vitest';
import { layoutLot, roadSideOf, rotateFeature, type Feature } from '../src/render/lots';
import { Stage, Tier, Zone } from '../src/sim/types';
import { makeCity, road, zone } from './helpers';

const FAMILIES: [Zone, Tier][] = [
  [Zone.Residential, 1],
  [Zone.Residential, 2],
  [Zone.Residential, 3],
  [Zone.Commercial, 1],
  [Zone.Commercial, 2],
  [Zone.Commercial, 3],
  [Zone.Industrial, 'ag'],
  [Zone.Industrial, 'dirty'],
  [Zone.Industrial, 'manu'],
  [Zone.Industrial, 'tech'],
];

describe('rotateFeature', () => {
  test('four turns is the identity and one turn moves side 2 to side 3', () => {
    const f: Feature = { kind: 'driveway', u: 0.1, v: 0.3, w: 0.2, d: 0.4, along: 2 };
    expect(rotateFeature(f, 4)).toEqual(f);
    const r = rotateFeature(f, 1);
    expect(r.along).toBe(3);
    expect(r.u).toBeCloseTo(-0.3);
    expect(r.v).toBeCloseTo(0.1);
    expect(r.w).toBeCloseTo(0.4);
    expect(r.d).toBeCloseTo(0.2);
  });
});

describe('layoutLot', () => {
  test('every feature stays inside the block', () => {
    for (const [z, t] of FAMILIES) {
      for (const stage of [1, 2, 3, 4, 5, 6, 7] as Stage[]) {
        for (let bucket = 0; bucket < 6; bucket++) {
          for (const side of [-1, 0, 1, 2, 3]) {
            const lay = layoutLot(z, t, stage, bucket, 1, side, false);
            for (const f of lay.features) {
              expect(Math.abs(f.u) + (f.w ?? 0) / 2).toBeLessThanOrEqual(0.5001);
              expect(Math.abs(f.v) + (f.d ?? 0) / 2).toBeLessThanOrEqual(0.5001);
            }
          }
        }
      }
    }
  });
  test('a suburban house has a driveway that meets the road side', () => {
    for (const side of [0, 1, 2, 3]) {
      const lay = layoutLot(Zone.Residential, 2, 1, 0, 1, side, false);
      const d = lay.features.find((f) => f.kind === 'driveway')!;
      expect(d).toBeDefined();
      expect(d.along).toBe(side);
      const reach =
        side === 0
          ? -d.v + (d.d ?? 0) / 2
          : side === 1
            ? d.u + (d.w ?? 0) / 2
            : side === 2
              ? d.v + (d.d ?? 0) / 2
              : -d.u + (d.w ?? 0) / 2;
      expect(reach).toBeCloseTo(0.5, 2);
    }
  });
  test('no road within reach behaves like a road on the near-left side', () => {
    expect(layoutLot(Zone.Residential, 2, 1, 0, 1, -1, false)).toEqual(
      layoutLot(Zone.Residential, 2, 1, 0, 1, 2, false),
    );
  });
  test('desert lawns are xeriscape, and grounds match the family', () => {
    expect(layoutLot(Zone.Residential, 2, 1, 0, 1, 2, false).ground).toBe('lawn');
    expect(layoutLot(Zone.Residential, 2, 1, 0, 1, 2, true).ground).toBe('xeriscape');
    expect(layoutLot(Zone.Commercial, 1, 2, 0, 1, 2, false).ground).toBe('asphalt');
    expect(layoutLot(Zone.Commercial, 3, 7, 0, 1, 2, false).ground).toBe('plaza');
    expect(layoutLot(Zone.Industrial, 'dirty', 3, 0, 1, 2, false).ground).toBe('gravel');
    expect(layoutLot(Zone.Industrial, 'ag', 1, 0, 1, 2, false).ground).toBe('field');
  });
  test('a commercial strip has parking bays and some cars', () => {
    const lay = layoutLot(Zone.Commercial, 1, 2, 1, 1, 2, false);
    expect(lay.features.some((f) => f.kind === 'bays')).toBe(true);
    expect(lay.features.filter((f) => f.kind === 'car').length).toBeGreaterThanOrEqual(1);
  });
  test('layouts are stable per bucket and differ across buckets', () => {
    const a = layoutLot(Zone.Residential, 1, 1, 0, 1, 2, false);
    expect(layoutLot(Zone.Residential, 1, 1, 0, 1, 2, false)).toEqual(a);
    const looks = new Set(
      [0, 1, 2, 3, 4, 5].map((b) => JSON.stringify(layoutLot(Zone.Residential, 1, 1, b, 1, 2, false))),
    );
    expect(looks.size).toBeGreaterThanOrEqual(3);
  });
});

describe('roadSideOf', () => {
  test('finds the adjacent road and rotates it with the camera', () => {
    const city = makeCity();
    road(city, 10, 12, 14, 12); // a street south of (12, 11)
    zone(city, 12, 11, Zone.Residential, 1);
    expect(roadSideOf(city, 12, 11, 0)).toBe(2); // grid +y is screen side 2 at rest
    expect(roadSideOf(city, 12, 11, 1)).toBe(3);
    expect(roadSideOf(city, 12, 11, 3)).toBe(1);
  });
  test('reaches two tiles out, prefers the nearer, and reports -1 for none', () => {
    const city = makeCity();
    road(city, 10, 13, 14, 13); // two south
    zone(city, 12, 11, Zone.Residential, 1);
    expect(roadSideOf(city, 12, 11, 0)).toBe(2);
    expect(roadSideOf(city, 40, 40, 0)).toBe(-1);
  });
});

import { afterEach, beforeEach } from 'vitest';
import { drawLotGround, treePositions } from '../src/render/lots';
import { setViewAngle, tileGeom } from '../src/render/iso';
import { clearSprites, setCanvasFactory, spriteStats } from '../src/render/spritecache';
import { strictCtx, stubCanvasFactory } from './stubctx';

describe('drawLotGround', () => {
  beforeEach(() => {
    setCanvasFactory(stubCanvasFactory().factory);
    clearSprites();
  });
  afterEach(() => {
    setCanvasFactory(null);
    setViewAngle(0);
  });
  test('bakes once per key and blits every call', () => {
    const { ctx, trace } = strictCtx();
    const g = tileGeom(5, 5, 0);
    const before = spriteStats().bakes; // the counter is cumulative
    drawLotGround(ctx, g, Zone.Residential, 2, 1, 0, 1, 2, false, 'summer');
    drawLotGround(ctx, g, Zone.Residential, 2, 1, 0, 1, 2, false, 'summer');
    expect(spriteStats().bakes - before).toBe(1);
    expect(trace.filter((t) => t.startsWith('drawImage')).length).toBe(2);
  });
  test('lawns key on the season, paving does not', () => {
    const { ctx } = strictCtx();
    const g = tileGeom(5, 5, 0);
    let before = spriteStats().bakes;
    drawLotGround(ctx, g, Zone.Residential, 2, 1, 0, 1, 2, false, 'summer');
    drawLotGround(ctx, g, Zone.Residential, 2, 1, 0, 1, 2, false, 'winter');
    expect(spriteStats().bakes - before).toBe(2);
    clearSprites();
    before = spriteStats().bakes;
    drawLotGround(ctx, g, Zone.Commercial, 2, 5, 0, 1, 2, false, 'summer');
    drawLotGround(ctx, g, Zone.Commercial, 2, 5, 0, 1, 2, false, 'winter');
    expect(spriteStats().bakes - before).toBe(1);
  });
  test('every family, stage, side and season bakes without a negative radius at every quarter', () => {
    for (const q of [0, 1, 2, 3]) {
      setViewAngle((q * Math.PI) / 2);
      for (const [z, t] of FAMILIES) {
        for (const stage of [1, 4, 7] as Stage[]) {
          for (const side of [-1, 0, 1, 2, 3]) {
            clearSprites();
            const { ctx } = strictCtx();
            expect(() =>
              drawLotGround(ctx, tileGeom(3, 3, 0), z, t, stage, 2, 1, side, q === 3, 'autumn'),
            ).not.toThrow();
          }
        }
      }
    }
  });
  test('tree positions are screen offsets inside the tile diamond', () => {
    const lay = layoutLot(Zone.Residential, 3, 1, 0, 1, 2, false);
    expect(treePositions(lay, 1).length).toBeGreaterThan(0);
    for (const [dx, dy] of treePositions(lay, 1)) {
      expect(Math.abs(dx) / 32 + Math.abs(dy) / 16).toBeLessThanOrEqual(1.01);
    }
  });
});
