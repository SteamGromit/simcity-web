import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { paintGround, textureSprite } from '../src/render/ground';
import { tileGeom } from '../src/render/iso';
import { clearSprites, setCanvasFactory, spriteStats } from '../src/render/spritecache';
import { strictCtx, stubCanvasFactory } from './stubctx';

describe('ground texture', () => {
  beforeEach(() => {
    setCanvasFactory(stubCanvasFactory().factory);
    clearSprites();
  });
  afterEach(() => setCanvasFactory(null));
  test('desert and dirt no longer share a sprite', () => {
    textureSprite('desert', 0);
    textureSprite('dirt', 0);
    expect(spriteStats().count).toBe(2);
  });
  test('paintGround composites the texture with multiply and restores the mode', () => {
    const { ctx, trace } = strictCtx();
    paintGround(ctx, tileGeom(2, 2, 0), 'meadow', 'hsl(100 30% 40%)', 3, 1);
    const i = trace.indexOf('globalCompositeOperation=multiply');
    expect(i).toBeGreaterThan(-1);
    expect(trace.slice(i).some((t) => t === 'globalCompositeOperation=source-over')).toBe(true);
  });
  test('at detail 0 no texture is blitted', () => {
    const { ctx, trace } = strictCtx();
    paintGround(ctx, tileGeom(2, 2, 0), 'meadow', 'hsl(100 30% 40%)', 3, 0);
    expect(trace.some((t) => t.startsWith('drawImage'))).toBe(false);
  });
});
