import { describe, expect, test } from 'vitest';
import {
  Archetype,
  boxExtent,
  channels,
  FARM_LAYOUTS,
  footprintBudget,
  paletteFamily,
  pickArchetype,
  pickFarmLayout,
} from '../src/render/archetypes';
import { Stage, Tier, Zone } from '../src/sim/types';

describe('channels', () => {
  test('same variant yields the same stream', () => {
    const a = channels(0.375);
    const b = channels(0.375);
    for (let i = 0; i < 8; i++) expect(a()).toBe(b());
  });

  test('different variants diverge', () => {
    const a = channels(0.2);
    const b = channels(0.8);
    expect([a(), a(), a()]).not.toEqual([b(), b(), b()]);
  });

  test('values stay in [0, 1)', () => {
    for (const seed of [0, 0.001, 0.5, 0.9999]) {
      const c = channels(seed);
      for (let i = 0; i < 100; i++) {
        const v = c();
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    }
  });
});

const STAGES: Stage[] = [1, 2, 3, 4, 5, 6, 7];
const PICKS = Array.from({ length: 20 }, (_, i) => i / 20);
const COMBOS: [Zone, Tier][] = [
  [Zone.Residential, 1], [Zone.Residential, 2], [Zone.Residential, 3],
  [Zone.Commercial, 1], [Zone.Commercial, 2], [Zone.Commercial, 3],
  [Zone.Industrial, 'dirty'], [Zone.Industrial, 'manu'], [Zone.Industrial, 'tech'],
];

function everyArchetype(cb: (a: Archetype, zone: Zone, tier: Tier, stage: Stage) => void) {
  for (const [zone, tier] of COMBOS) {
    for (const stage of STAGES) {
      for (const p of PICKS) cb(pickArchetype(zone, tier, stage, p), zone, tier, stage);
    }
  }
}

describe('pickArchetype', () => {
  test('deterministic per (zone, tier, stage, pick)', () => {
    expect(pickArchetype(Zone.Residential, 2, 4, 0.37))
      .toBe(pickArchetype(Zone.Residential, 2, 4, 0.37));
  });

  test('every legal combination resolves to 1-3 boxes with one full-height mass', () => {
    everyArchetype((a) => {
      expect(a.boxes.length).toBeGreaterThanOrEqual(1);
      expect(a.boxes.length).toBeLessThanOrEqual(3);
      expect(a.boxes.filter((b) => b.hf === 1)).toHaveLength(1);
    });
  });

  test('a pick sweep reaches more than one archetype per family', () => {
    const seen = new Set(PICKS.map((p) => pickArchetype(Zone.Residential, 2, 4, p)));
    expect(seen.size).toBeGreaterThan(1);
  });

  test('mismatched tier falls back via normalization instead of throwing', () => {
    expect(() => pickArchetype(Zone.Residential, 'dirty' as Tier, 4, 0.5)).not.toThrow();
    expect(() => pickArchetype(Zone.Industrial, 3 as Tier, 4, 0.5)).not.toThrow();
    expect(() => pickArchetype(Zone.Industrial, 'ag', 2, 0.5)).not.toThrow();
  });
});

describe('geometry invariant', () => {
  test('footprintBudget matches the single-box curve', () => {
    expect(footprintBudget(1)).toBeCloseTo(0.6);
    expect(footprintBudget(6)).toBeCloseTo(0.85);
    expect(footprintBudget(7)).toBeCloseTo(0.85);
  });

  test('every sub-box of every archetype stays inside the footprint budget', () => {
    everyArchetype((a) => {
      for (const sb of a.boxes) {
        // the invariant runs on the *plan*, so a slab is checked on the axis
        // it is actually long on rather than on its nominal size
        const { w, d } = boxExtent(sb);
        expect(Math.abs(sb.ox) + w / 2).toBeLessThanOrEqual(0.5 + 1e-9);
        expect(Math.abs(sb.oy) + d / 2).toBeLessThanOrEqual(0.5 + 1e-9);
        expect(sb.hf).toBeGreaterThan(0);
        expect(sb.hf).toBeLessThanOrEqual(1);
        if (sb.chamfer !== undefined) {
          expect(sb.chamfer).toBeGreaterThan(0);
          expect(sb.chamfer).toBeLessThan(0.5);
        }
      }
    });
  });

  test('boxExtent falls back to the single size when no plan is given', () => {
    expect(boxExtent({ ox: 0, oy: 0, f: 0.7, hf: 1 })).toEqual({ w: 0.7, d: 0.7 });
    expect(boxExtent({ ox: 0, oy: 0, f: 0.7, hf: 1, w: 0.9, d: 0.3 })).toEqual({ w: 0.9, d: 0.3 });
  });
});

describe('typologies', () => {
  test('a family band offers more than one plan shape, not just one box resized', () => {
    // slabs and squares in the same band are what stop a district looking
    // like one building repeated
    const shapes = new Set<string>();
    for (const p of PICKS) {
      const a = pickArchetype(Zone.Commercial, 3, 7, p);
      for (const sb of a.boxes) {
        const { w, d } = boxExtent(sb);
        shapes.add((w / d).toFixed(2));
      }
    }
    expect(shapes.size).toBeGreaterThan(1);
  });

  test('tall commercial bands include a chamfered plan', () => {
    const chamfered = PICKS.map((p) => pickArchetype(Zone.Commercial, 3, 7, p)).some((a) =>
      a.boxes.some((b) => (b.chamfer ?? 0) > 0),
    );
    expect(chamfered).toBe(true);
  });

  test('facades are declared where the typology calls for one', () => {
    const withFacade = PICKS.map((p) => pickArchetype(Zone.Commercial, 2, 6, p)).filter(
      (a) => a.facade,
    );
    expect(withFacade.length).toBeGreaterThan(0);
  });

  test('every archetype names a window treatment the painter understands', () => {
    const known = new Set(['punched', 'ribbon', 'curtain', 'none']);
    everyArchetype((a) => expect(known.has(a.windows)).toBe(true));
  });

  test('every archetype names a roof form the painter understands', () => {
    const known = new Set(['flat', 'parapet', 'gabled', 'sawtooth', 'hipped', 'mansard']);
    everyArchetype((a) => expect(known.has(a.roof)).toBe(true));
  });
});

describe('palette families', () => {
  test('deterministic and drawn from the family list', () => {
    const a = paletteFamily(Zone.Residential, 2, 0.4);
    expect(paletteFamily(Zone.Residential, 2, 0.4)).toEqual(a);
    expect(a).toHaveLength(3);
    for (const d of a) expect(Number.isFinite(d)).toBe(true);
  });

  test('a pick sweep reaches more than one family per tier', () => {
    const seen = new Set(PICKS.map((p) => JSON.stringify(paletteFamily(Zone.Commercial, 3, p))));
    expect(seen.size).toBeGreaterThan(1);
  });

  test('every combo resolves, including normalized fallbacks', () => {
    for (const [zone, tier] of COMBOS) expect(paletteFamily(zone, tier, 0.5)).toHaveLength(3);
    expect(paletteFamily(Zone.Industrial, 'ag', 0.5)).toHaveLength(3);
  });
});

describe('farm layouts', () => {
  test('every pick resolves and the sweep covers multiple layouts', () => {
    const seen = new Set(PICKS.map((p) => pickFarmLayout(p)));
    expect(seen.size).toBeGreaterThan(1);
    for (const l of seen) expect(FARM_LAYOUTS).toContain(l);
  });

  test('layouts keep the barn inside the tile', () => {
    for (const l of FARM_LAYOUTS) {
      expect(Math.abs(l.barnOx)).toBeLessThanOrEqual(0.25);
      expect(Math.abs(l.barnOy)).toBeLessThanOrEqual(0.25);
    }
  });
});
