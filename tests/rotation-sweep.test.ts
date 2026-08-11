import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  drawAccident,
  drawBuilding,
  nearCorner,
  nearEdge,
  quadOf,
  drawCastShadow,
  drawCollapse,
  drawCrimeFlash,
  drawFire,
  drawLotApron,
  drawRubble,
  hearthTip,
} from '../src/render/buildings';
import { drawAmbient } from '../src/render/ambientfx';
import { drawHedge, drawRock, drawTree } from '../src/render/scenery';
import { paintCliff, paintGround, paintShore, paintWater } from '../src/render/ground';
import { hsl } from '../src/render/palette';
import { blockGeom, setViewAngle, tileGeom, type TileGeom } from '../src/render/iso';
import { clearSprites, setCanvasFactory } from '../src/render/spritecache';
import { ensureCoreContent } from '../src/sim/content';
import { pickArchetype } from '../src/render/archetypes';
import { Stage, Tier, Zone } from '../src/sim/types';
import { stubCanvasFactory, strictCtx } from './stubctx';

/**
 * The rotation sweep TODO #8 asks for, widened past the reward set.
 *
 * A tile projects to the same diamond at every quarter turn and the sun is
 * fixed to the screen, so a painter handed a tile centred on the origin must
 * paint *the same picture* however the camera is turned — the corners arrive
 * in a rotated order, and nothing may depend on which index they arrive at.
 *
 * That is exactly the assumption v0.59.0 broke: the reward painter read corner
 * 1 for the right-hand edge and corner 2 for the bottom, corners are held in
 * grid order rather than screen order, and half a turn later those extents came
 * out negative and `ctx.ellipse` threw inside the render loop. This file holds
 * every other painter to the same rule, so the next one to assume it cannot
 * ship.
 */

const QUARTERS = [0, 1, 2, 3] as const;

/**
 * A tile's geometry with its centre moved to the origin. At every quarter the
 * four corners are then the same four points in a rotated order — which is the
 * precise condition that catches a fixed-index read.
 */
function centredGeom(x: number, y: number, elevation = 0): TileGeom {
  const g = tileGeom(x, y, elevation);
  return {
    cx: 0,
    cy: 0,
    corners: g.corners.map(([px, py]) => [px - g.cx, py - g.cy] as [number, number]),
  };
}

function centredBlockGeom(x: number, y: number, size: number): TileGeom {
  const g = blockGeom(x, y, size, 0);
  return {
    cx: 0,
    cy: 0,
    corners: g.corners.map(([px, py]) => [px - g.cx, py - g.cy] as [number, number]),
  };
}

/** Paint once at each quarter turn and return the four traces. */
function atEveryQuarter(
  paint: (ctx: CanvasRenderingContext2D, geom: TileGeom) => void,
  geomFor: (q: number) => TileGeom,
) {
  return QUARTERS.map((q) => {
    setViewAngle((q * Math.PI) / 2);
    clearSprites(); // a cached sprite would hide a re-bake that differs
    const { ctx, trace } = strictCtx();
    paint(ctx, geomFor(q));
    // A painter may reach the sprite cache, and those bakes are keyed without
    // the angle by design — so what is compared is what lands on this context,
    // which is exactly the part that can depend on the camera.
    return trace;
  });
}

/**
 * A closed polygon traced from a different vertex is the same polygon, and
 * that is the one difference a quarter turn legitimately makes: `corners` is
 * held in grid order, so `moveTo(corners[0])` starts at the north point at
 * rest and the east point a quarter later, then walks the identical quad.
 *
 * So each straight-sided closed path is rewritten to start at its smallest
 * vertex before the traces are compared. Everything else keeps its order —
 * this normalises where a loop begins, not what it draws or in what sequence.
 */
function canonical(trace: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < trace.length; i++) {
    if (trace[i] !== 'beginPath()') {
      out.push(trace[i]);
      continue;
    }
    // gather a run of moveTo/lineTo up to a closePath, and only rewrite when
    // that is all it is — a path with curves in it keeps its own order
    let j = i + 1;
    const pts: string[] = [];
    while (j < trace.length && /^(moveTo|lineTo)\(/.test(trace[j])) {
      pts.push(trace[j].replace(/^(moveTo|lineTo)/, ''));
      j++;
    }
    if (pts.length < 3 || trace[j] !== 'closePath()') {
      out.push(trace[i]);
      continue;
    }
    let at = 0;
    for (let k = 1; k < pts.length; k++) if (pts[k] < pts[at]) at = k;
    const rotated = [...pts.slice(at), ...pts.slice(0, at)];
    out.push('beginPath()', `moveTo${rotated[0]}`, ...rotated.slice(1).map((p) => `lineTo${p}`));
    i = j - 1; // the closePath is pushed on the next pass
  }
  return out;
}

/** Assert the four traces agree, and say which quarter broke ranks if not. */
function expectSameEveryQuarter(what: string, rawTraces: string[][]) {
  const traces = rawTraces.map(canonical);
  for (let q = 1; q < 4; q++) {
    if (traces[q].join('\n') === traces[0].join('\n')) continue;
    const at = traces[q].findIndex((line, i) => line !== traces[0][i]);
    throw new Error(
      `${what} paints differently at ${q * 90}°:\n` +
        `  0°:   ${traces[0][at] ?? '(nothing)'}\n` +
        `  ${q * 90}°: ${traces[q][at] ?? '(nothing)'}`,
    );
  }
  // Drawing nothing at *every* angle is consistent — an agricultural lot has
  // no apron, because the field is its own ground. Drawing nothing at only
  // some angles would have failed the comparison above.
  if (traces.some((t) => t.length > 0)) {
    for (let q = 0; q < 4; q++) expect(traces[q].length).toBeGreaterThan(0);
  }
}

/**
 * Not every painter *should* be screen-invariant. A sub-mass placed at a grid
 * offset — a plant's cooling tower on the north of its plot, a wing on the
 * east — is positioned through `tileOffset`, which is built from the grid
 * basis vectors, so it genuinely moves across the screen as the camera turns.
 * That is the point of it: the tower stays on the north side of the plot.
 *
 * Those get the check that actually matters for the crash class instead —
 * every number finite, and nothing flung a mile off the tile. A collapsed
 * extent, a NaN or a negative radius all fail here or throw in the context.
 */
function expectSaneEveryQuarter(what: string, traces: string[][]) {
  const BOUND = 2000; // a 5×5 block spans ~320px; this is only a sanity rail
  for (let q = 0; q < 4; q++) {
    expect(traces[q].length, `${what} draws nothing at ${q * 90}°`).toBeGreaterThan(0);
    for (const line of traces[q]) {
      const call = /^\w+\((.*)\)$/.exec(line);
      if (!call) continue; // a style assignment carries no geometry
      for (const arg of call[1].split(',')) {
        if (!/^-?\d+(\.\d+)?$/.test(arg)) continue; // colours, fonts, labels
        const v = Number(arg);
        if (!Number.isFinite(v) || Math.abs(v) > BOUND) {
          throw new Error(`${what} draws ${v} at ${q * 90}° — ${line}`);
        }
      }
    }
  }
}

const GROWABLE: Zone[] = [Zone.Residential, Zone.Commercial, Zone.Industrial];
const TIERS: Tier[] = [1, 2, 3, 'ag', 'dirty', 'manu', 'tech'];
const CIVIC: Zone[] = [
  Zone.PowerPlant,
  Zone.SolarPlant,
  Zone.WindTurbine,
  Zone.HydroPlant,
  Zone.NuclearPlant,
  Zone.PowerLine,
  Zone.Park,
  Zone.FireStation,
  Zone.PoliceStation,
  Zone.School,
  Zone.Hospital,
  Zone.BusStop,
  Zone.WaterPump,
  Zone.WaterPipe,
  Zone.StreetcarStop,
  Zone.MonorailStation,
  Zone.SubwayStation,
  Zone.RailTerminal,
  Zone.Landfill,
  Zone.Incinerator,
  Zone.RecyclingCentre,
  Zone.Prison,
];

beforeEach(() => {
  ensureCoreContent();
  setCanvasFactory(stubCanvasFactory().factory);
  clearSprites();
});

afterEach(() => {
  setCanvasFactory(null);
  clearSprites();
  setViewAngle(0);
});

describe('the growables survive a turned camera', () => {
  test('every zone, stage and tier paints the same picture at every quarter', () => {
    for (const zone of GROWABLE) {
      for (const stage of [1, 3, 5, 7] as Stage[]) {
        for (const tier of TIERS) {
          expectSameEveryQuarter(
            `${Zone[zone]} stage ${stage} tier ${tier}`,
            atEveryQuarter(
              (ctx, geom) => drawBuilding(ctx, geom, zone, stage, tier, false, true, 0.37, 0, 2),
              () => centredGeom(40, 40),
            ),
          );
        }
      }
    }
  });

  test('their cast shadows do too — the shadow is where the massing bug showed', () => {
    for (const zone of GROWABLE) {
      for (const stage of [2, 4, 6] as Stage[]) {
        expectSameEveryQuarter(
          `${Zone[zone]} stage ${stage} shadow`,
          atEveryQuarter(
            (ctx, geom) => drawCastShadow(ctx, geom, zone, stage, 2, 0.61),
            () => centredGeom(40, 40),
          ),
        );
      }
    }
  });

  test('and so does the ground each one stands on', () => {
    for (const zone of GROWABLE) {
      for (const tier of TIERS) {
        expectSameEveryQuarter(
          `${Zone[zone]} apron, tier ${tier}`,
          atEveryQuarter(
            (ctx, geom) => drawLotApron(ctx, geom, zone, 4, tier, 0.23),
            () => centredGeom(40, 40),
          ),
        );
      }
    }
  });

  test('an abandoned, unpowered lot at night is no different', () => {
    expectSameEveryQuarter(
      'abandoned residence at night',
      atEveryQuarter(
        (ctx, geom) => drawBuilding(ctx, geom, Zone.Residential, 5, 2, true, false, 0.8, 0.9, 2),
        () => centredGeom(40, 40),
      ),
    );
  });
});

describe('the civic set survives a turned camera', () => {
  test('every civic building draws sane geometry at every quarter', () => {
    for (const zone of CIVIC) {
      expectSaneEveryQuarter(
        Zone[zone],
        atEveryQuarter(
          (ctx, geom) => drawBuilding(ctx, geom, zone, 1, 2, false, true, 0.44, 0, 2),
          () => centredGeom(40, 40),
        ),
      );
    }
  });

  test('unpowered and at night, too', () => {
    for (const zone of CIVIC) {
      expectSaneEveryQuarter(
        `${Zone[zone]} unpowered at night`,
        atEveryQuarter(
          (ctx, geom) => drawBuilding(ctx, geom, zone, 1, 2, false, false, 0.12, 0.85, 2),
          () => centredGeom(40, 40),
        ),
      );
    }
  });
});

describe('multi-tile blocks survive a turned camera', () => {
  test('a block of every size draws sane geometry at every quarter', () => {
    for (const size of [2, 3, 4, 5]) {
      expectSaneEveryQuarter(
        `a ${size}×${size} block`,
        atEveryQuarter(
          (ctx, geom) => drawBuilding(ctx, geom, Zone.Prison, 1, 2, false, true, 0.5, 0, 2, size),
          () => centredBlockGeom(40, 40, size),
        ),
      );
    }
  });
});

describe('scenery and ground survive a turned camera', () => {
  test('terrain fills paint the same at every quarter', () => {
    for (const kind of ['meadow', 'desert', 'rock', 'snow'] as const) {
      expectSameEveryQuarter(
        `${kind} ground`,
        atEveryQuarter(
          (ctx, geom) => paintGround(ctx, geom, kind, '#3a5', 11, 2),
          () => centredGeom(40, 40),
        ),
      );
    }
  });

  test('water paints the same at every quarter, shallow to deep', () => {
    for (const depth of [0, 0.5, 1]) {
      expectSameEveryQuarter(
        `water at depth ${depth}`,
        atEveryQuarter(
          (ctx, geom) => paintWater(ctx, geom, 40, 40, depth, 1000, 2),
          () => centredGeom(40, 40),
        ),
      );
    }
  });

  test('a shoreline draws sane geometry on whichever side it lies', () => {
    for (let side = 0; side < 4; side++) {
      // a shoreline is given a *grid* edge, so it is meant to sit on a
      // different screen edge once the camera turns
      expectSaneEveryQuarter(
        `shore on side ${side}`,
        atEveryQuarter(
          (ctx, geom) => paintShore(ctx, geom, side, 1000, 0),
          () => centredGeom(40, 40),
        ),
      );
    }
  });

  test('trees, rocks and hedges are unmoved by the camera', () => {
    expectSameEveryQuarter(
      'a broadleaf tree',
      atEveryQuarter((ctx) => drawTree(ctx, 0, 0, 'broadleaf', 16, 3, 'summer', 0), () =>
        centredGeom(40, 40),
      ),
    );
    expectSameEveryQuarter(
      'a rock',
      atEveryQuarter((ctx) => drawRock(ctx, 0, 0, 7, 2), () => centredGeom(40, 40)),
    );
    expectSameEveryQuarter(
      'a hedge',
      atEveryQuarter((ctx) => drawHedge(ctx, 0, 0, 12, 'summer'), () => centredGeom(40, 40)),
    );
  });
});

describe('the transient markers survive a turned camera', () => {
  test('rubble, collapse dust, a crash, a crime flash and fire all paint the same', () => {
    const cases: [string, (c: CanvasRenderingContext2D, g: TileGeom) => void][] = [
      ['rubble', (c, g) => drawRubble(c, g, 5)],
      ['a collapse', (c, g) => drawCollapse(c, g, 0.5)],
      ['a crash', (c, g) => drawAccident(c, g, 1000)],
      ['a crime flash', (c, g) => drawCrimeFlash(c, g, 1000, 0.6)],
      ['fire', (c, g) => drawFire(c, g, 1000, 4)],
    ];
    for (const [what, paint] of cases) {
      expectSameEveryQuarter(what, atEveryQuarter(paint, () => centredGeom(40, 40)));
    }
  });
});

describe('nothing throws at any angle', () => {
  /** The blunt half of the sweep: the crash class, over everything at once. */
  test('every painter, every zone, every stage, every quarter', () => {
    const { ctx } = strictCtx();
    for (const q of QUARTERS) {
      setViewAngle((q * Math.PI) / 2);
      const geom = tileGeom(40, 40, 2);
      for (let zone = 0; zone <= Zone.FusionPlant; zone++) {
        // empty land is never handed to a building painter, and a road tile
        // goes to roadart — neither has a stage or a tier to draw
        if (zone === Zone.None || zone === Zone.Road) continue;
        for (const stage of [0, 1, 4, 7] as Stage[]) {
          for (const tier of TIERS) {
            expect(() =>
              drawBuilding(ctx, geom, zone as Zone, stage, tier, false, true, 0.5, 0.5, 2),
            ).not.toThrow();
            expect(() =>
              drawCastShadow(ctx, geom, zone as Zone, stage, tier, 0.5),
            ).not.toThrow();
            expect(() => drawLotApron(ctx, geom, zone as Zone, stage, tier, 0.5)).not.toThrow();
          }
        }
      }
      for (const cliffSide of [0, 1, 2, 3]) {
        const c1 = geom.corners[cliffSide];
        const c2 = geom.corners[(cliffSide + 1) % 4];
        expect(() => paintCliff(ctx, c1, c2, 2, true, hsl(104, 30, 40), 7)).not.toThrow();
        expect(() => paintCliff(ctx, c1, c2, 0, false, hsl(104, 30, 40), 7)).not.toThrow();
      }
    }
  });
});

describe('the front of a lot is measured, not assumed', () => {
  /**
   * The three bugs this file found were all the same shape: a fixed grid-corner
   * index standing in for a screen position. `nearCorner` is what replaced
   * them, so it is what has to hold.
   */
  test('it finds the corner lowest on screen, at every quarter', () => {
    for (const q of QUARTERS) {
      setViewAngle((q * Math.PI) / 2);
      const q4 = quadOf(tileGeom(40, 40, 0));
      const n = nearCorner(q4);
      for (let i = 0; i < 4; i++) {
        expect(q4[n][1]).toBeGreaterThanOrEqual(q4[i][1]);
      }
    }
  });

  test('at rest that is corner 2, so the unrotated view is unchanged', () => {
    setViewAngle(0);
    expect(nearCorner(quadOf(tileGeom(40, 40, 0)))).toBe(2);
    const [a, b] = nearEdge(quadOf(tileGeom(40, 40, 0)));
    const q4 = quadOf(tileGeom(40, 40, 0));
    expect(a).toEqual(q4[2]);
    expect(b).toEqual(q4[3]);
  });

  test('the near edge always starts at the near corner', () => {
    for (const q of QUARTERS) {
      setViewAngle((q * Math.PI) / 2);
      const q4 = quadOf(tileGeom(40, 40, 0));
      expect(nearEdge(q4)[0]).toEqual(q4[nearCorner(q4)]);
    }
  });

  test('it works on a block as well as a tile', () => {
    for (const q of QUARTERS) {
      setViewAngle((q * Math.PI) / 2);
      const q4 = quadOf(blockGeom(40, 40, 4, 0));
      const n = nearCorner(q4);
      for (let i = 0; i < 4; i++) expect(q4[n][1]).toBeGreaterThanOrEqual(q4[i][1]);
    }
  });
});

describe('an archetype exists for every lot', () => {
  /**
   * `familyKey` builds its key from the zone and the tier, and `normalizeTier`
   * only coerces the tier for zones it recognises as R, C or I — so a civic
   * lot carrying an industry tier used to build 'Cdirty' and index undefined.
   * A frame is allowed to look odd; it is not allowed to throw.
   */
  test('no zone and tier combination indexes off the table', () => {
    for (let zone = 0; zone <= Zone.FusionPlant; zone++) {
      for (const tier of TIERS) {
        for (const stage of [1, 2, 3, 4, 5, 6, 7] as Stage[]) {
          expect(() => pickArchetype(zone as Zone, tier, stage, 0.5)).not.toThrow();
          expect(pickArchetype(zone as Zone, tier, stage, 0.99)).toBeTruthy();
        }
      }
    }
  });
});

describe('ambient painters at every quarter', () => {
  const ENV = { clock: 3456, wind: -2, night: 0.4, detail: 1 as const, winter: true };

  // A hardcoded (stage, bucket) for the winter-hearth case risks landing on
  // an archetype with no chimney, which draws nothing at every quarter and
  // passes the comparison below vacuously. Scan for one that actually vents,
  // the same bucket-outer/stage-inner order ambient-geometry.test.ts uses.
  let hearthStage: Stage = 2 as Stage;
  let hearthBucket = 0;
  outer: for (let b = 0; b < 6; b++) {
    for (const st of [1, 2, 3] as Stage[]) {
      if (hearthTip(Zone.Residential, st, 2 as Tier, b)) {
        hearthStage = st;
        hearthBucket = b;
        break outer;
      }
    }
  }

  const cases: [string, Zone, Stage, Tier, number][] = [
    ['dirty industry', Zone.Industrial, 3 as Stage, 'dirty' as Tier, 0.4],
    ['coal plant', Zone.PowerPlant, 0 as Stage, 2 as Tier, 0.1],
    ['nuclear steam', Zone.NuclearPlant, 0 as Stage, 2 as Tier, 0.1],
    ['winter hearth', Zone.Residential, hearthStage, 2 as Tier, (hearthBucket + 0.5) / 6],
    ['park fountain', Zone.Park, 0 as Stage, 2 as Tier, (2 + 0.5) / 6],
    ['stadium flag', Zone.Stadium, 0 as Stage, 2 as Tier, 0.1],
  ];
  for (const [name, zone, stage, tier, variant] of cases) {
    test(name, () => {
      const traces = atEveryQuarter(
        (ctx, geom) => drawAmbient(ctx, geom, zone, stage, tier, variant, 1, true, false, 0.6, ENV),
        () => centredGeom(3, 4),
      );
      // a case that draws nothing would pass the comparison below trivially
      // and guard nothing — fail loudly instead
      expect(traces[0].length).toBeGreaterThan(0);
      for (const t of traces.slice(1)) expect(canonical(t)).toEqual(canonical(traces[0]));
    });
  }
});
