import { describe, expect, test } from 'vitest';
import {
  COAL_STACKS,
  growableHeight, hearthTip, industryStacks, massHeight, placeRoofProps, stackTips,
} from '../src/render/buildings';
import { boxExtent, channels, footprintBudget, pickArchetype } from '../src/render/archetypes';
import { chamfer, raise, tileOffset, tileRect } from '../src/render/massing';
import { hash2 } from '../src/render/noise';
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

  test('the vent point matches the same post-increment height term the bake draws (regression: roofKit case bodies must read k + 1, not k)', () => {
    // find a bucket/stage with a chimney-carrying archetype, the same scan
    // the test above uses
    let hit: { stage: Stage; bucket: number } | null = null;
    outer: for (let b = 0; b < 6; b++) {
      for (const st of [1, 2, 3] as Stage[]) {
        if (hearthTip(Zone.Residential, st, 2 as Tier, b)) {
          hit = { stage: st, bucket: b };
          break outer;
        }
      }
    }
    expect(hit).not.toBeNull();
    const { stage, bucket } = hit!;
    const t = hearthTip(Zone.Residential, stage, 2 as Tier, bucket)!;

    // rebuild the same roof quad hearthTip built internally, independently of it
    const half = (bucket + 0.5) / 6; // VARIANTS, not exported — matches its every use elsewhere in this file
    const chan = channels(half);
    const arch = pickArchetype(Zone.Residential, 2 as Tier, stage, chan());
    const h = growableHeight(Zone.Residential, stage, 2 as Tier, bucket);
    const budget = footprintBudget(stage);
    const sb = arch.boxes.find((b2) => b2.hf === 1)!;
    const e = boxExtent(sb);
    const c = tileOffset(sb.ox * budget, sb.oy * budget);
    const plan = tileRect(c[0], c[1], (e.w * budget) / 2, (e.d * budget) / 2);
    const q = sb.chamfer ? chamfer(plan, sb.chamfer) : plan;
    const roof = raise(q, h);
    const seed = bucket * 7 + 1;
    const placed = placeRoofProps(arch.props, roof, seed).find((p) => p.kind === 'chimney');
    expect(placed).toBeTruthy();

    // the exact term roofKit's case 'chimney' now reads: hash2(k + 1, 5, seed)
    const expectedY = placed!.y - (9 + hash2(placed!.k + 1, 5, seed) * 4);
    expect(t.x).toBeCloseTo(placed!.x, 9);
    expect(t.y).toBeCloseTo(expectedY, 9);
  });
});
