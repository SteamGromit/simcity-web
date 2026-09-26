import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { drawHedge, drawTree, drawUndergrowth, speciesOf, treeSprite } from '../src/render/scenery';
import { clearSprites, setCanvasFactory, spriteStats } from '../src/render/spritecache';
import { strictCtx, stubCanvasFactory } from './stubctx';

describe('trees', () => {
  beforeEach(() => {
    setCanvasFactory(stubCanvasFactory().factory);
    clearSprites();
  });
  afterEach(() => setCanvasFactory(null));
  test('spring and summer no longer share a sprite', () => {
    treeSprite('oak', 16, 1, 'spring');
    treeSprite('oak', 16, 1, 'summer');
    expect(spriteStats().count).toBe(2);
    drawHedge(strictCtx().ctx, 0, 0, 12, 'spring');
    drawHedge(strictCtx().ctx, 0, 0, 12, 'summer');
    expect(spriteStats().count).toBe(4);
  });
  test('generic kinds resolve to a species by variant, specific kinds stay', () => {
    const seen = new Set([0, 1, 2, 3, 4, 5].map((v) => speciesOf('broadleaf', v)));
    expect(seen.size).toBeGreaterThanOrEqual(3);
    for (const s of seen) expect(['oak', 'maple', 'birch']).toContain(s);
    const conifers = new Set([0, 1, 2, 3, 4, 5].map((v) => speciesOf('conifer', v)));
    for (const s of conifers) expect(['pine', 'spruce', 'cypress']).toContain(s);
    expect(speciesOf('pine', 3)).toBe('pine');
    expect(speciesOf('palm', 3)).toBe('palm');
  });
  test('every species bakes at every season without a negative radius', () => {
    for (const k of ['oak', 'maple', 'birch', 'pine', 'spruce', 'cypress', 'palm', 'dead', 'scrub'] as const) {
      for (const s of ['spring', 'summer', 'autumn', 'winter'] as const) {
        clearSprites();
        expect(() => drawTree(strictCtx().ctx, 0, 0, k, 18, 2, s)).not.toThrow();
        expect(() => drawTree(strictCtx().ctx, 0, 0, k, 9, 0, s)).not.toThrow();
      }
    }
  });
  test('undergrowth bakes once per variant and season', () => {
    const { ctx } = strictCtx();
    const before = spriteStats().bakes;
    drawUndergrowth(ctx, 0, 0, 1, 'summer');
    drawUndergrowth(ctx, 0, 0, 1, 'summer');
    drawUndergrowth(ctx, 0, 0, 2, 'summer');
    expect(spriteStats().bakes - before).toBe(2);
  });
});
