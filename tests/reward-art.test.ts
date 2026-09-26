import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { drawBuilding } from '../src/render/buildings';
import { blockGeom, setViewAngle } from '../src/render/iso';
import { centre, halfExtent, tileRect } from '../src/render/massing';
import { ensureCoreContent } from '../src/sim/content';
import { Stage, Tier, Zone } from '../src/sim/types';
import { strictCtx, stubCanvasFactory } from './stubctx';
import { clearSprites, setCanvasFactory, spriteStats } from '../src/render/spritecache';

/**
 * Every slot the reward painter owns: footprint from the pack, and whether
 * its art is built on ellipses (a stadium bowl, a campus lawn, a reactor
 * ring). Only those can be checked for having collapsed to a point.
 */
const REWARDS: { zone: Zone; size: number; discs: boolean }[] = [
  { zone: Zone.Ballpark, size: 2, discs: true },
  { zone: Zone.Arena, size: 3, discs: true },
  { zone: Zone.Stadium, size: 4, discs: true },
  { zone: Zone.Colosseum, size: 5, discs: true },
  { zone: Zone.Library, size: 2, discs: false },
  { zone: Zone.Museum, size: 3, discs: false },
  { zone: Zone.Monument, size: 2, discs: false },
  { zone: Zone.College, size: 3, discs: true },
  { zone: Zone.University, size: 4, discs: true },
  { zone: Zone.ResearchUniversity, size: 5, discs: true },
  { zone: Zone.FusionPlant, size: 4, discs: true },
];

const QUARTERS = [0, 1, 2, 3];

beforeEach(() => {
  setCanvasFactory(stubCanvasFactory().factory);
  clearSprites();
});

afterEach(() => {
  setViewAngle(0);
  setCanvasFactory(null);
});

describe('halfExtent', () => {
  test('a tile measures the same however the camera is turned', () => {
    const seen = QUARTERS.map((q) => {
      setViewAngle((q * Math.PI) / 2);
      return halfExtent(blockGeom(46, 46, 3, 0).corners);
    });
    for (const [hw, hh] of seen) {
      expect(hw).toBeCloseTo(seen[0][0], 6);
      expect(hh).toBeCloseTo(seen[0][1], 6);
      expect(hw).toBeGreaterThan(0);
      expect(hh).toBeGreaterThan(0);
    }
  });

  test('it is the same measurement the unrotated view always used', () => {
    // corner 1 is the right-hand one and corner 2 the bottom one at rest, so
    // the old arithmetic and the new agree exactly where the old one worked —
    // which is what makes the unrotated view pixel-identical after the fix
    setViewAngle(0);
    for (const g of [blockGeom(20, 30, 4, 0), blockGeom(5, 5, 1, 0), blockGeom(60, 12, 5, 2)]) {
      const [hw, hh] = halfExtent(g.corners);
      const [cx, cy] = centre(g.corners);
      expect(hw).toBeCloseTo(g.corners[1][0] - cx, 9);
      expect(hh).toBeCloseTo(g.corners[2][1] - cy, 9);
    }
  });

  test('slab footprints measure the same way, square or not', () => {
    // tileRect builds in screen space, so roofs over a slab were never the
    // broken case — but they go through the same measurement now, and must
    // come out where they always did
    for (const [a, b] of [
      [1, 1],
      [2, 0.6],
      [0.4, 1.8],
    ]) {
      const q = tileRect(100, 100, a, b);
      const [hw, hh] = halfExtent(q);
      const [cx, cy] = centre(q);
      expect(hw).toBeCloseTo(q[1][0] - cx, 9);
      expect(hh).toBeCloseTo(q[2][1] - cy, 9);
    }
  });

  test('elevation lifts a tile without flattening it', () => {
    setViewAngle(0);
    const [hw, hh] = halfExtent(blockGeom(10, 10, 1, 3).corners);
    expect(hw).toBeGreaterThan(0);
    expect(hh).toBeGreaterThan(0);
  });
});

describe('rewards survive a rotated camera', () => {
  ensureCoreContent();

  for (const { zone, size, discs } of REWARDS) {
    test(`${Zone[zone]} draws at every quarter turn`, () => {
      for (const q of QUARTERS) {
        setViewAngle((q * Math.PI) / 2);
        clearSprites();
        const bake = stubCanvasFactory();
        setCanvasFactory(bake.factory);
        const { ctx, radii } = strictCtx();
        const geom = blockGeom(46, 46, size, 0);
        expect(() =>
          drawBuilding(ctx, geom, zone, 3 as Stage, 2 as Tier, false, true, 0.5, 0, 2, size),
        ).not.toThrow();
        // and it must not collapse to a point: a quarter turn that zeroed the
        // half-extents drew the campus and the stadium bowl as nothing at all.
        // The art bakes into a sprite now, so the radii to check are the
        // bake's — the live context only sees a blit.
        if (discs) expect([...radii, ...bake.radii.flat()].some((r) => r > 1)).toBe(true);
      }
    });
  }

  test('an unpowered reward still draws turned around', () => {
    setViewAngle(Math.PI); // the turn that used to throw
    const { ctx } = strictCtx();
    const geom = blockGeom(46, 46, 3, 0);
    expect(() =>
      drawBuilding(ctx, geom, Zone.College, 3 as Stage, 2 as Tier, false, false, 0.5, 0, 2, 3),
    ).not.toThrow();
  });
});

describe('rewards bake', () => {
  test('a reward bakes once per zone, power state and size, and blits after', () => {
    ensureCoreContent();
    const { ctx, trace } = strictCtx();
    const before = spriteStats().bakes;
    const geom = blockGeom(46, 46, 3, 0);
    drawBuilding(ctx, geom, Zone.Museum, 3 as Stage, 2 as Tier, false, true, 0.5, 0, 2, 3);
    const afterFirst = spriteStats().bakes;
    drawBuilding(ctx, geom, Zone.Museum, 3 as Stage, 2 as Tier, false, true, 0.5, 0, 2, 3);
    // the second identical draw bakes nothing at all
    expect(spriteStats().bakes).toBe(afterFirst);
    drawBuilding(ctx, geom, Zone.Museum, 3 as Stage, 2 as Tier, false, false, 0.5, 0, 2, 3);
    expect(trace.filter((t) => t.startsWith('drawImage')).length).toBe(3);
    expect(spriteStats().bakes - before).toBeGreaterThanOrEqual(2);
  });
  test('the colonnade paints the same picture at every quarter', () => {
    ensureCoreContent();
    const pictures: string[] = [];
    for (const q of [0, 1, 2, 3]) {
      setViewAngle((q * Math.PI) / 2);
      clearSprites();
      const bake = stubCanvasFactory();
      setCanvasFactory(bake.factory);
      const g = blockGeom(46, 46, 2, 0);
      drawBuilding(strictCtx().ctx, { cx: 0, cy: 0, corners: g.corners.map(([x, y]) => [x - g.cx, y - g.cy] as [number, number]) }, Zone.Library, 3 as Stage, 2 as Tier, false, true, 0.5, 0, 2, 2);
      pictures.push(bake.traces[0].join('\n'));
    }
    expect(new Set(pictures).size).toBe(1);
  });
});
