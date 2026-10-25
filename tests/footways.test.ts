import { describe, expect, test } from 'vitest';
import { idx } from '../src/sim/grid';
import { GRID, Zone } from '../src/sim/types';
import {
  armCount,
  doorOf,
  FOOT_IN,
  footLeg,
  hasKerb,
  kerbPoint,
  successors,
  tileAt,
  type Edge,
  type Leg,
} from '../src/render/footways';
import { makeCity, road, zone } from './helpers';

const EDGES: Edge[] = [0, 1, 2, 3];
const close = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-9;

/** Every point of a leg lies inside the tile it is on, and foot legs sit on their kerb line. */
function checkLeg(leg: Leg) {
  const x = leg.on % GRID;
  const y = Math.floor(leg.on / GRID);
  for (const p of [leg.p0, leg.p1]) {
    expect(p[0]).toBeGreaterThanOrEqual(x - 1e-9);
    expect(p[0]).toBeLessThanOrEqual(x + 1 + 1e-9);
    expect(p[1]).toBeGreaterThanOrEqual(y - 1e-9);
    expect(p[1]).toBeLessThanOrEqual(y + 1 + 1e-9);
  }
  if (leg.kind === 'foot') {
    const e = leg.ctx.edge;
    for (const p of [leg.p0, leg.p1]) {
      const inset = e === 0 ? p[1] - y : e === 1 ? x + 1 - p[0] : e === 2 ? y + 1 - p[1] : p[0] - x;
      expect(inset).toBeCloseTo(FOOT_IN, 9);
    }
  }
}

describe('kerbs', () => {
  test('a straight street has kerbs on its two long sides only', () => {
    const city = makeCity();
    road(city, 10, 10, 30, 10);
    const t = idx(20, 10);
    expect(EDGES.map((e) => hasKerb(city, t, e))).toEqual([true, false, true, false]);
    // the end tile also has a kerb across the dead end
    expect(EDGES.map((e) => hasKerb(city, idx(30, 10), e))).toEqual([true, true, true, false]);
    // a lot has no kerb; a motorway has none either
    expect(hasKerb(city, idx(20, 11), 0)).toBe(false);
    city.tiles[t].road = 3;
    expect(hasKerb(city, t, 0)).toBe(false);
  });

  test('kerb points sit FOOT_IN inside their edge', () => {
    const t = idx(5, 7);
    for (const e of EDGES) {
      for (const s of [0, 0.5, 1]) {
        const p = kerbPoint(t, e, s);
        const inset = e === 0 ? p[1] - 7 : e === 1 ? 6 - p[0] : e === 2 ? 8 - p[1] : p[0] - 5;
        expect(inset).toBeCloseTo(FOOT_IN, 9);
        if (s === 0.5) expect(tileAt(p)).toBe(t); // the ends sit on the tile boundary
      }
    }
    // clockwise: the north kerb runs east, the east kerb runs south
    expect(kerbPoint(t, 0, 1)[0]).toBeGreaterThan(kerbPoint(t, 0, 0)[0]);
    expect(kerbPoint(t, 1, 1)[1]).toBeGreaterThan(kerbPoint(t, 1, 0)[1]);
  });

  test('a junction tile has no kerbs on its arms; a T keeps the top', () => {
    const city = makeCity();
    road(city, 10, 20, 30, 20);
    road(city, 20, 21, 20, 30);
    expect(armCount(city, idx(20, 20))).toBe(3);
    expect(EDGES.map((e) => hasKerb(city, idx(20, 20), e))).toEqual([true, false, false, false]);
    road(city, 20, 10, 20, 19);
    expect(armCount(city, idx(20, 20))).toBe(4);
    expect(EDGES.map((e) => hasKerb(city, idx(20, 20), e))).toEqual([false, false, false, false]);
  });
});

describe('foot legs', () => {
  test('a mid-block leg spans the tile; a dead end trims to the kerb corner', () => {
    const city = makeCity();
    road(city, 10, 10, 30, 10);
    const mid = footLeg(city, idx(20, 10), 0, 1);
    expect(mid.len).toBeCloseTo(1, 9);
    expect(mid.p0).toEqual([20, 10 + FOOT_IN]);
    expect(mid.p1).toEqual([21, 10 + FOOT_IN]);
    const end = footLeg(city, idx(30, 10), 0, 1);
    expect(end.len).toBeCloseTo(1 - FOOT_IN, 9);
    // and the leg round the dead end starts where that one stops
    const round = footLeg(city, idx(30, 10), 1, 1);
    expect(close(round.p0, end.p1)).toBe(true);
    expect(round.len).toBeCloseTo(1 - 2 * FOOT_IN, 9);
    checkLeg(mid);
    checkLeg(end);
    checkLeg(round);
  });

  test('walking the other way reverses the ends', () => {
    const city = makeCity();
    road(city, 10, 10, 30, 10);
    const a = footLeg(city, idx(20, 10), 2, 1);
    const b = footLeg(city, idx(20, 10), 2, -1);
    expect(close(a.p0, b.p1)).toBe(true);
    expect(close(a.p1, b.p0)).toBe(true);
  });
});

describe('successors', () => {
  const cityWith = (lay: (c: ReturnType<typeof makeCity>) => void) => {
    const city = makeCity();
    lay(city);
    return city;
  };

  test('on a straight street the only way on is the next tile, with no seam', () => {
    const city = cityWith((c) => road(c, 10, 10, 30, 10));
    const leg = footLeg(city, idx(20, 10), 0, 1);
    const next = successors(city, leg);
    expect(next).toHaveLength(1);
    expect(next[0].leg.kind).toBe('foot');
    expect(next[0].leg.on).toBe(idx(21, 10));
    expect(close(next[0].leg.p0, leg.p1)).toBe(true);
  });

  test('a dead end is walked round, kerb to kerb', () => {
    const city = cityWith((c) => road(c, 10, 10, 30, 10));
    const north = footLeg(city, idx(30, 10), 0, 1);
    const [a] = successors(city, north);
    expect(a.leg.kind).toBe('foot');
    expect(a.leg.ctx).toEqual({ tile: idx(30, 10), edge: 1, dir: 1 });
    const [b] = successors(city, a.leg);
    expect(b.leg.ctx).toEqual({ tile: idx(30, 10), edge: 2, dir: 1 });
    const [c] = successors(city, b.leg);
    expect(c.leg.on).toBe(idx(29, 10)); // back along the south kerb
  });

  test('a crossroads approach offers two crossings and the block corner, no way straight on', () => {
    const city = cityWith((c) => {
      road(c, 10, 20, 30, 20);
      road(c, 20, 10, 20, 30);
    });
    const leg = footLeg(city, idx(19, 20), 0, 1); // north kerb, heading east
    const next = successors(city, leg);
    expect(next.map((o) => o.leg.kind).sort()).toEqual(['corner', 'cross', 'cross']);
    // the corner turns left up the north arm's west kerb, round the block
    expect(next.find((o) => o.leg.kind === 'corner')!.leg.ctx).toEqual({ tile: idx(20, 19), edge: 3, dir: 1 });
    const across = next.find((o) => o.leg.p1[0] > 20.5)!.leg; // over the north arm
    expect(across.p1).toEqual([21, 20 + FOOT_IN]);
    expect(across.on).toBe(idx(20, 20));
    const over = next.find((o) => o.leg.p1[1] > 20.5)!.leg; // over my own street
    expect(over.p1).toEqual([20, 21 - FOOT_IN]);
    // after crossing the arm, the far corner's kerb carries on east
    const after = successors(city, across);
    expect(after.some((o) => o.leg.kind === 'foot' && o.leg.on === idx(21, 20))).toBe(true);
    // and nobody crosses straight back
    expect(after.some((o) => close(o.leg.p1, across.p0))).toBe(false);
    // after crossing my street, the stem's kerb is round the inside corner
    const afterOver = successors(city, over);
    const corner = afterOver.find((o) => o.leg.kind === 'corner')!.leg;
    expect(corner.ctx).toEqual({ tile: idx(20, 21), edge: 3, dir: -1 });
    const [onto] = successors(city, corner);
    expect(onto.leg.kind).toBe('foot');
    expect(close(onto.leg.p0, corner.p1)).toBe(true);
    expect(onto.leg.p1[1]).toBeGreaterThan(onto.leg.p0[1]); // southward, down the stem
  });

  test('on the top of a T the kerb runs through; the near side crosses', () => {
    const city = cityWith((c) => {
      road(c, 10, 20, 30, 20);
      road(c, 20, 21, 20, 30);
    });
    const top = successors(city, footLeg(city, idx(19, 20), 0, 1));
    expect(top.map((o) => o.leg.kind).sort()).toEqual(['cross', 'foot']);
    expect(top.find((o) => o.leg.kind === 'foot')!.weight).toBeGreaterThan(top.find((o) => o.leg.kind === 'cross')!.weight);
    const near = successors(city, footLeg(city, idx(19, 20), 2, -1)); // south kerb, heading east
    expect(near.map((o) => o.leg.kind).sort()).toEqual(['corner', 'cross', 'cross']);
  });

  test('a bend: outer kerb carries on, inner kerb links across the corner', () => {
    const city = cityWith((c) => {
      road(c, 10, 10, 20, 10);
      road(c, 20, 11, 20, 20);
    });
    const outer = successors(city, footLeg(city, idx(19, 10), 0, 1));
    expect(outer).toHaveLength(1);
    expect(outer[0].leg.on).toBe(idx(20, 10));
    const inner = successors(city, footLeg(city, idx(19, 10), 2, -1));
    const link = inner.find((o) => o.leg.kind === 'corner')!.leg;
    expect(link.len).toBeLessThan(0.2);
    expect(link.ctx).toEqual({ tile: idx(20, 11), edge: 3, dir: -1 });
    const [onto] = successors(city, link);
    expect(close(onto.leg.p0, link.p1)).toBe(true);
    checkLeg(onto.leg);
    // no crossing of the through road at a mere bend
    expect(inner.filter((o) => o.leg.kind === 'cross' && o.leg.ctx.tile === idx(19, 10))).toHaveLength(0);
  });

  test('a walker is never stuck and never leaves the road: every kerb on four layouts', () => {
    const layouts = [
      (c: ReturnType<typeof makeCity>) => road(c, 10, 10, 30, 10),
      (c: ReturnType<typeof makeCity>) => {
        road(c, 10, 20, 30, 20);
        road(c, 20, 10, 20, 30);
      },
      (c: ReturnType<typeof makeCity>) => {
        road(c, 10, 5, 10, 15);
        road(c, 11, 5, 11, 15);
      },
      (c: ReturnType<typeof makeCity>) => {
        road(c, 10, 10, 20, 10);
        road(c, 20, 10, 20, 20);
        road(c, 20, 20, 30, 20);
        c.tiles[idx(15, 10)].road = 3; // a motorway tile in the run: no kerbs, a dead point
      },
    ];
    for (const lay of layouts) {
      const city = cityWith(lay);
      for (let i = 0; i < city.tiles.length; i++) {
        if (city.tiles[i].zone !== Zone.Road) continue;
        for (const e of EDGES) {
          if (!hasKerb(city, i, e)) continue;
          for (const dir of [1, -1] as const) {
            const leg = footLeg(city, i, e, dir);
            checkLeg(leg);
            const next = successors(city, leg);
            expect(next.length).toBeGreaterThan(0);
            for (const o of next) {
              expect(close(o.leg.p0, leg.p1)).toBe(true);
              checkLeg(o.leg);
              const after = successors(city, o.leg);
              expect(after.length).toBeGreaterThan(0);
              for (const q of after) {
                expect(close(q.leg.p0, o.leg.p1)).toBe(true);
                checkLeg(q.leg);
              }
            }
          }
        }
      }
    }
  });
});

describe('doors', () => {
  test('a building site has no door until it is finished', () => {
    const city = makeCity();
    road(city, 10, 10, 20, 10);
    zone(city, 14, 11, Zone.Residential, 3);
    city.tiles[idx(14, 11)].grew = 0;
    expect(doorOf(city, idx(14, 11))).toBeNull();
    city.tiles[idx(14, 11)].grew = 6;
    expect(doorOf(city, idx(14, 11))).not.toBeNull();
  });

  test('a lot beside a street has its door on the facing kerb; one two tiles away has none', () => {
    const city = makeCity();
    road(city, 10, 10, 30, 10);
    zone(city, 15, 9, Zone.Residential, 2);
    zone(city, 15, 8, Zone.Residential, 2);
    const d = doorOf(city, idx(15, 9))!;
    expect(d.tile).toBe(idx(15, 10));
    expect(d.edge).toBe(0);
    expect(d.at).toEqual([15.5, 10 + FOOT_IN]);
    expect(doorOf(city, idx(15, 8))).toBeNull();
    // a lot south of the street uses that street's south kerb
    zone(city, 16, 11, Zone.Commercial, 1);
    expect(doorOf(city, idx(16, 11))).toMatchObject({ tile: idx(16, 10), edge: 2 });
  });
});
