import { describe, expect, test } from 'vitest';
import {
  Archetype,
  channels,
  footprintBudget,
  pickArchetype,
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
        expect(Math.abs(sb.ox) + sb.f / 2).toBeLessThanOrEqual(0.5 + 1e-9);
        expect(Math.abs(sb.oy) + sb.f / 2).toBeLessThanOrEqual(0.5 + 1e-9);
        expect(sb.hf).toBeGreaterThan(0);
        expect(sb.hf).toBeLessThanOrEqual(1);
      }
    });
  });
});
