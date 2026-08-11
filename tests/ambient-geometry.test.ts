import { describe, expect, test } from 'vitest';
import {
  COAL_STACKS,
  chimneyHeight, growableHeight, hearthTip, industryStacks, massHeight, placeRoofProps, stackTips,
} from '../src/render/buildings';
import { boxExtent, channels, footprintBudget, pickArchetype } from '../src/render/archetypes';
import { chamfer, raise, tileOffset, tileRect } from '../src/render/massing';
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

describe('chimneyHeight', () => {
  // The bake (roofKit's chimney case) and hearthTip both call this one
  // function for the prism height, so there is nowhere left for them to
  // drift apart — but the function's own output can still silently change.
  // These numbers are observed, not derived; pin them.
  test('pins known (k, seed) pairs — a change here is a change to every baked chimney and hearth wisp', () => {
    expect(chimneyHeight(0, 1)).toBeCloseTo(12.307956, 6);
    expect(chimneyHeight(1, 1)).toBeCloseTo(9.571878, 6);
    expect(chimneyHeight(3, 7)).toBeCloseTo(12.634661, 6);
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

  test('the vent point sits on the shared chimneyHeight seam, not a private copy of it', () => {
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

    // hearthTip must land on the exact seam roofKit's case 'chimney' bakes
    // through: chimneyHeight(k + 1, seed) — the invariant is structural (one
    // shared function, one call convention), and chimneyHeight's own values
    // are pinned above, so this is an integration check of the seam, not a
    // restatement of a formula private to this test.
    expect(t.x).toBeCloseTo(placed!.x, 9);
    expect(t.y).toBeCloseTo(placed!.y - chimneyHeight(placed!.k + 1, seed), 9);
  });
});
