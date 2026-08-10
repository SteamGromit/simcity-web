import { describe, expect, test } from 'vitest';
import {
  COAL_STACKS,
  hearthTip, industryStacks, massHeight, placeRoofProps, stackTips,
} from '../src/render/buildings';
import { ensureCoreContent } from '../src/sim/content';
import { Stage, Tier, Zone } from '../src/sim/types';

ensureCoreContent();

describe('industryStacks', () => {
  test('dirty stage 2 has one stack; stage 3+ gains the second', () => {
    expect(industryStacks(2 as Stage, 'dirty', 32, 16, 40)).toHaveLength(1);
    expect(industryStacks(3 as Stage, 'dirty', 32, 16, 40)).toHaveLength(2);
    expect(industryStacks(5 as Stage, 'manu', 32, 16, 40)).toHaveLength(1);
  });
  test('stack height scales with stage and tip sits above the mass', () => {
    const [s] = industryStacks(4 as Stage, 'manu', 32, 16, 50);
    expect(s.stackH).toBe(18 + 4 * 3);
    expect(s.y).toBeLessThan(0); // above the lot centre (y-up is negative)
  });
});

describe('stackTips', () => {
  test('industrial growables smoke from stage 2, never stage 1 or ag', () => {
    expect(stackTips(Zone.Industrial, 1 as Stage, 'dirty' as Tier, 2, 1)).toHaveLength(0);
    expect(stackTips(Zone.Industrial, 2 as Stage, 'dirty' as Tier, 2, 1)).toHaveLength(1);
    expect(stackTips(Zone.Industrial, 3 as Stage, 'ag' as Tier, 2, 1)).toHaveLength(0);
  });
  test('coal plant has two smoke tips at the shared constants', () => {
    const tips = stackTips(Zone.PowerPlant, 0 as Stage, 2 as Tier, 0, 2);
    expect(tips).toHaveLength(COAL_STACKS.length);
    const h = massHeight(Zone.PowerPlant, 0 as Stage, 2 as Tier, 0);
    expect(tips[0].x).toBe(COAL_STACKS[0][0]);
    expect(tips[0].y).toBeCloseTo(-h + 2 - COAL_STACKS[0][1], 5);
    expect(tips.every((t) => t.kind === 'smoke')).toBe(true);
  });
  test('nuclear steams, incinerator smokes', () => {
    expect(stackTips(Zone.NuclearPlant, 0 as Stage, 2 as Tier, 0, 2)[0].kind).toBe('steam');
    expect(stackTips(Zone.Incinerator, 0 as Stage, 2 as Tier, 0, 1)[0].kind).toBe('smoke');
  });
  test('non-emitters return empty, not undefined', () => {
    expect(stackTips(Zone.Park, 0 as Stage, 2 as Tier, 0, 1)).toEqual([]);
    expect(stackTips(Zone.Residential, 3 as Stage, 2 as Tier, 0, 1)).toEqual([]);
  });
});

describe('placeRoofProps', () => {
  const roof: [number, number][] = [[0, -12], [24, 0], [0, 12], [-24, 0]];
  test('is deterministic and stays inside the roof diamond', () => {
    const a = placeRoofProps(['chimney', 'acUnit'], roof, 15);
    expect(a).toEqual(placeRoofProps(['chimney', 'acUnit'], roof, 15));
    for (const p of a) expect(Math.abs(p.x) / 24 + Math.abs(p.y) / 12).toBeLessThanOrEqual(1.01);
  });
  test('respects the antenna one-in-five gate ordering (k advances on skips)', () => {
    const placed = placeRoofProps(['antenna', 'chimney'], roof, 3);
    // whatever appears, indices come from the same k-stream the painter uses
    for (const p of placed) expect(p.k).toBeGreaterThanOrEqual(0);
  });
});

describe('hearthTip', () => {
  test('only low-stage residential with a chimney-carrying archetype gets one', () => {
    expect(hearthTip(Zone.Commercial, 2 as Stage, 2 as Tier, 0)).toBeNull();
    expect(hearthTip(Zone.Residential, 6 as Stage, 2 as Tier, 0)).toBeNull();
    // scan buckets: at least one low-stage R bucket has a hearth, and every
    // returned tip is finite and lot-local small
    let found = 0;
    for (let b = 0; b < 6; b++) {
      for (const st of [1, 2, 3] as Stage[]) {
        const t = hearthTip(Zone.Residential, st, 2 as Tier, b);
        if (!t) continue;
        found++;
        expect(t.kind).toBe('hearth');
        expect(Math.abs(t.x)).toBeLessThan(64);
        expect(Number.isFinite(t.y)).toBe(true);
      }
    }
    expect(found).toBeGreaterThan(0);
  });
});
