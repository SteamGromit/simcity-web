import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  beginSpriteFrame,
  clearSprites,
  getSpriteScale,
  setCanvasFactory,
  setSpriteScale,
  sprite,
  spriteStats,
  PIXEL_BUDGET,
} from '../src/render/spritecache';

/** A canvas stand-in: the cache only ever asks for a 2d context and a size. */
function fakeFactory() {
  const calls: { w: number; h: number }[] = [];
  const factory = (w: number, h: number) => {
    calls.push({ w, h });
    const ctx = { setTransform: () => {} };
    return { width: w, height: h, getContext: () => ctx } as unknown as HTMLCanvasElement;
  };
  return { factory, calls };
}

const SPEC = { w: 20, h: 10, ax: 10, ay: 5 };

let made: ReturnType<typeof fakeFactory>;

beforeEach(() => {
  made = fakeFactory();
  setCanvasFactory(made.factory);
  setSpriteScale(1);
  clearSprites();
});

afterEach(() => {
  setCanvasFactory(null);
});

describe('sprite caching', () => {
  test('paints once and reuses after', () => {
    let painted = 0;
    const paint = () => {
      painted++;
    };
    const a = sprite('k', SPEC, paint);
    const b = sprite('k', SPEC, paint);
    expect(painted).toBe(1);
    expect(b).toBe(a);
    expect(spriteStats().count).toBe(1);
  });

  test('different keys are different sprites', () => {
    const before = spriteStats().bakes; // a lifetime counter, not per-cache
    sprite('a', SPEC, () => {});
    sprite('b', SPEC, () => {});
    expect(spriteStats().count).toBe(2);
    expect(spriteStats().bakes - before).toBe(2);
  });

  test('the sprite reports the logical size and anchor it was asked for', () => {
    const s = sprite('k', SPEC, () => {});
    expect(s.w).toBe(20);
    expect(s.h).toBe(10);
    expect(s.ax).toBe(10);
    expect(s.ay).toBe(5);
  });

  test('the backing canvas is the logical size times the bake scale', () => {
    setSpriteScale(2);
    sprite('k', SPEC, () => {});
    expect(made.calls.at(-1)).toEqual({ w: 40, h: 20 });
  });

  test('a per-call scale overrides the global one', () => {
    setSpriteScale(2);
    sprite('k', SPEC, () => {}, 1);
    expect(made.calls.at(-1)).toEqual({ w: 20, h: 10 });
  });

  test('clearSprites empties the cache and its pixel count', () => {
    sprite('a', SPEC, () => {});
    clearSprites();
    expect(spriteStats().count).toBe(0);
    expect(spriteStats().pixels).toBe(0);
  });

  test('changing the bake scale throws the cache away', () => {
    sprite('a', SPEC, () => {});
    expect(spriteStats().count).toBe(1);
    setSpriteScale(2);
    expect(spriteStats().count).toBe(0);
    expect(getSpriteScale()).toBe(2);
  });

  test('setting the same scale is a no-op, not a flush', () => {
    setSpriteScale(1);
    sprite('a', SPEC, () => {});
    setSpriteScale(1);
    expect(spriteStats().count).toBe(1);
  });

  test('the scale is clamped to something drawable', () => {
    setSpriteScale(99);
    expect(getSpriteScale()).toBeLessThanOrEqual(3);
    setSpriteScale(0);
    expect(getSpriteScale()).toBeGreaterThanOrEqual(0.5);
  });
});

describe('eviction', () => {
  test('sprites from an earlier frame are trimmed once the budget is passed', () => {
    beginSpriteFrame();
    // 1600×1600 = 2.56M pixels each: six of them overrun any sane budget
    const big = { w: 1600, h: 1600, ax: 0, ay: 0 };
    for (let k = 0; k < 8; k++) {
      if (k === 4) beginSpriteFrame();
      sprite(`big${k}`, big, () => {});
    }
    const stats = spriteStats();
    expect(stats.count).toBeLessThan(8);
    expect(stats.pixels).toBeLessThanOrEqual(PIXEL_BUDGET);
  });

  test('the most recently used sprite survives a trim', () => {
    const big = { w: 1600, h: 1600, ax: 0, ay: 0 };
    for (let k = 0; k < 6; k++) sprite(`big${k}`, big, () => {});
    sprite('big0', big, () => {}); // touch the oldest so it is now the newest
    let painted = 0;
    sprite('big0', big, () => {
      painted++;
    });
    expect(painted).toBe(0);
  });

  test('sustained thrashing steps the bake scale down instead of re-baking forever', () => {
    setSpriteScale(2);
    const big = { w: 1200, h: 1200, ax: 0, ay: 0 };
    for (let k = 0; k < 500; k++) sprite(`t${k}`, big, () => {});
    expect(getSpriteScale()).toBeLessThan(2);
  });
});

describe('eviction and the working set', () => {
  test('a sprite used this frame is never evicted, even over budget; the last frame can go', () => {
    const big = { w: 2000, h: 2000, ax: 0, ay: 0 }; // 4 M px each; the budget is 20 M
    const paint = () => {};
    beginSpriteFrame();
    for (let k = 0; k < 4; k++) sprite(`old${k}`, big, paint); // 16 M, under budget
    beginSpriteFrame();
    const before = spriteStats().bakes;
    for (let k = 0; k < 6; k++) sprite(`now${k}`, big, paint); // 24 M on its own
    // everything from this frame is still cached: asking again bakes nothing
    for (let k = 0; k < 6; k++) sprite(`now${k}`, big, paint);
    expect(spriteStats().bakes - before).toBe(6);
    // and the old frame's sprites were the ones dropped
    const oldBakes = spriteStats().bakes;
    sprite('old0', big, paint);
    expect(spriteStats().bakes).toBe(oldBakes + 1);
    expect(spriteStats().pixels).toBeGreaterThan(PIXEL_BUDGET); // ran over rather than thrash
  });
});
