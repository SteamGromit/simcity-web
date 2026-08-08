import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  boundaryKind,
  drawBridge,
  drawRoad,
  drawStreetFurniture,
  roadMask,
  rotateMask,
  screenCorridor,
} from '../src/render/roadart';
import { setViewAngle, tileGeom } from '../src/render/iso';
import { clearSprites, setCanvasFactory, spriteStats } from '../src/render/spritecache';
import { idx } from '../src/sim/grid';
import type { RoadClass } from '../src/sim/roads';
import { CityState, Zone } from '../src/sim/types';
import { makeCity } from './helpers';
import { stubCanvasFactory, strictCtx } from './stubctx';

const QUARTERS = [0, 1, 2, 3] as const;

function slab(city: CityState, x0: number, y0: number, x1: number, y1: number, cls: RoadClass) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const t = city.tiles[idx(x, y)];
      t.zone = Zone.Road;
      t.road = cls;
      t.median = false;
    }
  }
}

beforeEach(() => {
  setCanvasFactory(stubCanvasFactory().factory);
  clearSprites();
});

afterEach(() => {
  setCanvasFactory(null);
  clearSprites();
  setViewAngle(0);
});

describe('screenCorridor', () => {
  test('an east–west carriageway counts from its northern edge at rest', () => {
    const city = makeCity();
    slab(city, 10, 20, 40, 23, 3);
    expect(screenCorridor(city, 25, 20, 0)).toEqual({ lowSide: 0, span: 4, pos: 0 });
  });

  test('a quarter turn moves the low edge onto the next screen side', () => {
    const city = makeCity();
    slab(city, 10, 20, 40, 23, 3);
    for (const q of QUARTERS) {
      expect(screenCorridor(city, 25, 21, q)!.lowSide).toBe(q % 4);
    }
  });

  test('a north–south carriageway starts from the west and turns with the camera', () => {
    const city = makeCity();
    slab(city, 20, 10, 23, 40, 3);
    for (const q of QUARTERS) {
      expect(screenCorridor(city, 21, 25, q)!.lowSide).toBe((3 + q) % 4);
    }
  });

  test('turning never changes how wide the road is or which lane you are in', () => {
    const city = makeCity();
    slab(city, 10, 20, 40, 25, 4);
    for (const q of QUARTERS) {
      const c = screenCorridor(city, 25, 22, q)!;
      expect(c.span).toBe(6);
      expect(c.pos).toBe(2);
    }
  });

  test('the low side is always a real side, whatever turn it is given', () => {
    const city = makeCity();
    slab(city, 10, 20, 40, 23, 3);
    for (let q = -8; q <= 8; q++) {
      const c = screenCorridor(city, 25, 21, q)!;
      expect(c.lowSide).toBeGreaterThanOrEqual(0);
      expect(c.lowSide).toBeLessThan(4);
    }
  });

  test('a plain street has no carriageway at any angle', () => {
    const city = makeCity();
    slab(city, 10, 20, 40, 20, 0);
    for (const q of QUARTERS) expect(screenCorridor(city, 25, 20, q)).toBeNull();
  });
});

describe('boundaryKind', () => {
  test('the first and last boundaries are the outside of the road', () => {
    expect(boundaryKind(4, 0)).toBe('outer');
    expect(boundaryKind(4, 4)).toBe('outer');
  });

  test('an even carriageway divides at its centre, where oncoming traffic is', () => {
    expect(boundaryKind(4, 2)).toBe('centre');
    expect(boundaryKind(2, 1)).toBe('centre');
    expect(boundaryKind(6, 3)).toBe('centre');
  });

  test('everything else is a lane divider', () => {
    expect(boundaryKind(4, 1)).toBe('lane');
    expect(boundaryKind(4, 3)).toBe('lane');
    expect(boundaryKind(6, 1)).toBe('lane');
  });

  test('an odd carriageway has no centre boundary to draw', () => {
    for (const span of [3, 5]) {
      for (let b = 1; b < span; b++) expect(boundaryKind(span, b)).toBe('lane');
    }
  });

  test('every boundary of every span classifies as something', () => {
    for (let span = 1; span <= 8; span++) {
      for (let b = 0; b <= span; b++) {
        expect(['outer', 'centre', 'lane']).toContain(boundaryKind(span, b));
      }
    }
  });
});

describe('painting a carriageway', () => {
  /**
   * The sweep TODO #8 asks for, aimed at the road painter: every class, every
   * width, every lane and every quarter turn, through a context that throws on
   * the radius bug that stopped the game once already.
   */
  test('every class, lane and quarter paints without throwing', () => {
    const { ctx } = strictCtx();
    for (const cls of [0, 1, 2, 3, 4] as RoadClass[]) {
      for (const span of [1, 2, 3, 4, 6]) {
        for (let pos = 0; pos < span; pos++) {
          for (const q of QUARTERS) {
            setViewAngle((q * Math.PI) / 2);
            const geom = tileGeom(20, 20, 0);
            for (let mask = 0; mask < 16; mask++) {
              const cor = cls === 0 ? null : { lowSide: q, span, pos };
              expect(() => drawRoad(ctx, geom, cls, mask, 3, cor)).not.toThrow();
              expect(() => drawBridge(ctx, geom, cls, mask, 3, cor)).not.toThrow();
              expect(() =>
                drawStreetFurniture(ctx, geom, mask, 7, 2, 0.6, 1000, cor),
              ).not.toThrow();
            }
          }
        }
      }
    }
  });

  test('a real four-lane highway paints at every angle, end to end', () => {
    const { ctx } = strictCtx();
    const city = makeCity();
    slab(city, 10, 20, 40, 23, 3);
    for (const q of QUARTERS) {
      setViewAngle((q * Math.PI) / 2);
      for (let y = 20; y <= 23; y++) {
        for (let x = 10; x <= 40; x++) {
          const mask = rotateMask(roadMask(city, x, y), q);
          const cor = screenCorridor(city, x, y, q);
          const geom = tileGeom(x, y, 0);
          expect(() => drawRoad(ctx, geom, city.tiles[idx(x, y)].road, mask, x + y, cor))
            .not.toThrow();
        }
      }
    }
  });

  test('a carriageway and a junction do not share a baked sprite', () => {
    const { ctx } = strictCtx();
    const geom = tileGeom(20, 20, 0);
    // both are class 3 with road on all four sides; only the corridor differs
    drawRoad(ctx, geom, 3, 0b1111, 0, null);
    const afterJunction = spriteCount();
    drawRoad(ctx, geom, 3, 0b1111, 0, { lowSide: 0, span: 4, pos: 1 });
    expect(spriteCount()).toBeGreaterThan(afterJunction);
  });

  test('two lanes of the same carriageway do not share one either', () => {
    const { ctx } = strictCtx();
    const geom = tileGeom(20, 20, 0);
    drawRoad(ctx, geom, 3, 0b1111, 0, { lowSide: 0, span: 4, pos: 0 });
    const afterFirst = spriteCount();
    drawRoad(ctx, geom, 3, 0b1111, 0, { lowSide: 0, span: 4, pos: 1 });
    expect(spriteCount()).toBeGreaterThan(afterFirst);
  });
});

/** How many distinct sprites the cache is holding. */
function spriteCount(): number {
  return spriteStats().count;
}
