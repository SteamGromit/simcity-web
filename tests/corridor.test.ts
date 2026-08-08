import { describe, expect, test } from 'vitest';
import { idx } from '../src/sim/grid';
import {
  MAX_CORRIDOR_SPAN,
  corridorAt,
  corridorLowSide,
  isOuterEdge,
  travelDir,
} from '../src/sim/corridor';
import type { RoadClass } from '../src/sim/roads';
import { CityState, Zone } from '../src/sim/types';
import { makeCity } from './helpers';

/** Lay a rectangular slab of one road class, inclusive of both corners. */
function slab(
  city: CityState,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cls: RoadClass,
) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const t = city.tiles[idx(x, y)];
      t.zone = Zone.Road;
      t.road = cls;
      t.median = false;
    }
  }
}

describe('corridorAt', () => {
  test('a plain street is never a corridor — it is one lane, not a carriageway', () => {
    const city = makeCity();
    slab(city, 10, 20, 40, 20, 0);
    expect(corridorAt(city, 25, 20)).toBeNull();
  });

  test('an east–west highway band runs along x and spans its four tiles', () => {
    const city = makeCity();
    slab(city, 10, 20, 40, 23, 3);
    const c = corridorAt(city, 25, 21);
    expect(c).not.toBeNull();
    expect(c!.axis).toBe(0);
    expect(c!.span).toBe(4);
  });

  test('cross-position counts up from the low-coordinate edge', () => {
    const city = makeCity();
    slab(city, 10, 20, 40, 23, 3);
    for (let k = 0; k < 4; k++) {
      expect(corridorAt(city, 25, 20 + k)!.pos).toBe(k);
    }
  });

  test('a north–south band runs along y, and position counts from the west', () => {
    const city = makeCity();
    slab(city, 20, 10, 23, 40, 3);
    for (let k = 0; k < 4; k++) {
      const c = corridorAt(city, 20 + k, 25)!;
      expect(c.axis).toBe(1);
      expect(c.span).toBe(4);
      expect(c.pos).toBe(k);
    }
  });

  test('a two-wide route is a corridor too — one lane each way', () => {
    const city = makeCity();
    slab(city, 10, 20, 40, 21, 1);
    expect(corridorAt(city, 25, 20)).toMatchObject({ axis: 0, span: 2, pos: 0 });
    expect(corridorAt(city, 25, 21)).toMatchObject({ axis: 0, span: 2, pos: 1 });
  });

  test('a six-wide Highway II spans all six', () => {
    const city = makeCity();
    slab(city, 10, 20, 40, 25, 4);
    expect(corridorAt(city, 25, 22)).toMatchObject({ axis: 0, span: 6, pos: 2 });
  });

  test('a square of asphalt has no direction of travel, so it stays a junction', () => {
    const city = makeCity();
    slab(city, 20, 20, 23, 23, 3);
    expect(corridorAt(city, 21, 21)).toBeNull();
  });

  test('a different class alongside does not widen the corridor', () => {
    const city = makeCity();
    slab(city, 10, 20, 40, 23, 3); // highway
    slab(city, 10, 24, 40, 24, 0); // a frontage street hard against it
    expect(corridorAt(city, 25, 23)).toMatchObject({ span: 4, pos: 3 });
  });

  test('a street crossing a highway does not break the corridor', () => {
    const city = makeCity();
    slab(city, 10, 20, 40, 23, 3);
    slab(city, 25, 10, 25, 30, 0); // a street straight across it
    // the crossing squares were re-laid as street, but either side is untouched
    expect(corridorAt(city, 30, 21)).toMatchObject({ axis: 0, span: 4, pos: 1 });
  });

  test("a boulevard's median counts toward the span, so each carriageway knows its side", () => {
    const city = makeCity();
    slab(city, 10, 20, 40, 22, 2);
    for (let x = 10; x <= 40; x++) city.tiles[idx(x, 21)].median = true;
    expect(corridorAt(city, 25, 20)).toMatchObject({ axis: 0, span: 3, pos: 0 });
    expect(corridorAt(city, 25, 22)).toMatchObject({ axis: 0, span: 3, pos: 2 });
  });

  test('the median tile itself is landscaping, not a lane', () => {
    const city = makeCity();
    slab(city, 10, 20, 40, 22, 2);
    for (let x = 10; x <= 40; x++) city.tiles[idx(x, 21)].median = true;
    expect(corridorAt(city, 25, 21)).toBeNull();
  });

  test('a tile that is not road at all has no corridor', () => {
    const city = makeCity();
    expect(corridorAt(city, 25, 25)).toBeNull();
    city.tiles[idx(25, 25)].zone = Zone.Residential;
    expect(corridorAt(city, 25, 25)).toBeNull();
  });

  test('an expanse wider than any carriageway is a plaza, not a corridor', () => {
    const city = makeCity();
    slab(city, 10, 20, 60, 20 + MAX_CORRIDOR_SPAN, 3); // one row too wide
    expect(corridorAt(city, 35, 24)).toBeNull();
  });

  test('a band right against the map edge still reads correctly', () => {
    const city = makeCity();
    slab(city, 0, 0, 40, 3, 3);
    expect(corridorAt(city, 20, 0)).toMatchObject({ axis: 0, span: 4, pos: 0 });
  });

  test('it never reports a position outside its own span', () => {
    const city = makeCity();
    for (const span of [2, 3, 4, 5, 6]) {
      slab(city, 10, 40, 60, 40 + span - 1, 3);
      for (let k = 0; k < span; k++) {
        const c = corridorAt(city, 30, 40 + k)!;
        expect(c.pos).toBeGreaterThanOrEqual(0);
        expect(c.pos).toBeLessThan(c.span);
      }
      slab(city, 10, 40, 60, 40 + span - 1, 0); // reset for the next span
      for (let y = 40; y < 40 + span; y++) {
        for (let x = 10; x <= 60; x++) city.tiles[idx(x, y)].zone = Zone.None;
      }
    }
  });
});

describe('corridorLowSide', () => {
  test('an east–west carriageway counts from its northern edge', () => {
    expect(corridorLowSide(0)).toBe(0); // SIDE_DIRS[0] is north, −y
  });

  test('a north–south carriageway counts from its western edge', () => {
    expect(corridorLowSide(1)).toBe(3); // SIDE_DIRS[3] is west, −x
  });
});

describe('travelDir', () => {
  test('traffic keeps right: on an east–west road the southern half runs east', () => {
    expect(travelDir({ axis: 0, span: 4, pos: 3 })).toBe(1);
    expect(travelDir({ axis: 0, span: 4, pos: 2 })).toBe(1);
  });

  test('and the northern half runs west', () => {
    expect(travelDir({ axis: 0, span: 4, pos: 0 })).toBe(-1);
    expect(travelDir({ axis: 0, span: 4, pos: 1 })).toBe(-1);
  });

  test('on a north–south road the eastern half runs north', () => {
    expect(travelDir({ axis: 1, span: 4, pos: 3 })).toBe(-1);
    expect(travelDir({ axis: 1, span: 4, pos: 2 })).toBe(-1);
  });

  test('and the western half runs south', () => {
    expect(travelDir({ axis: 1, span: 4, pos: 0 })).toBe(1);
    expect(travelDir({ axis: 1, span: 4, pos: 1 })).toBe(1);
  });

  test("a boulevard's two carriageways run opposite ways around the median", () => {
    expect(travelDir({ axis: 0, span: 3, pos: 0 })).toBe(-1);
    expect(travelDir({ axis: 0, span: 3, pos: 2 })).toBe(1);
  });

  test('every half of every span picks a side, and the two halves disagree', () => {
    for (const axis of [0, 1] as const) {
      for (const span of [2, 3, 4, 5, 6]) {
        const first = travelDir({ axis, span, pos: 0 });
        const last = travelDir({ axis, span, pos: span - 1 });
        expect(first).toBe(-last);
      }
    }
  });
});

describe('isOuterEdge', () => {
  test('the first and last lanes are the outside of the carriageway', () => {
    expect(isOuterEdge({ axis: 0, span: 4, pos: 0 })).toBe(true);
    expect(isOuterEdge({ axis: 0, span: 4, pos: 3 })).toBe(true);
  });

  test('the lanes in between are not', () => {
    expect(isOuterEdge({ axis: 0, span: 4, pos: 1 })).toBe(false);
    expect(isOuterEdge({ axis: 0, span: 4, pos: 2 })).toBe(false);
  });

  test('a single-lane carriageway is outside on both flanks', () => {
    expect(isOuterEdge({ axis: 0, span: 1, pos: 0 })).toBe(true);
  });
});
