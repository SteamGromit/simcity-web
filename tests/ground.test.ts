import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { paintGround, paintTone } from '../src/render/ground';
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
    const { ctx } = strictCtx();
    paintGround(ctx, tileGeom(2, 2, 0), 'desert', 'hsl(40 30% 60%)', 0, 1);
    paintGround(ctx, tileGeom(2, 2, 0), 'dirt', 'hsl(30 30% 40%)', 0, 1);
    expect(spriteStats().count).toBe(2);
  });
  test('the tone texture rides in the one detail blit — no composite switch per tile', () => {
    const { ctx, trace } = strictCtx();
    paintGround(ctx, tileGeom(2, 2, 0), 'meadow', 'hsl(100 30% 40%)', 3, 1);
    expect(trace.filter((t) => t.startsWith('drawImage')).length).toBe(1);
    expect(trace.some((t) => t.startsWith('globalCompositeOperation='))).toBe(false);
  });
  test('the tone field is black at some alpha, so it darkens under source-over', () => {
    const data = new Uint8ClampedArray(66 * 34 * 4);
    let written = false;
    const ctx = {
      getImageData: () => ({ data, width: 66, height: 34 }),
      putImageData: () => {
        written = true;
      },
      setTransform: () => {},
      canvas: { width: 66, height: 34 },
    } as unknown as CanvasRenderingContext2D;
    paintTone(ctx, 'meadow', 1);
    expect(written).toBe(true);
    let opaque = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 0) {
        opaque++;
        expect(data[i]).toBe(0);
        expect(data[i + 1]).toBe(0);
        expect(data[i + 2]).toBe(0);
      }
    }
    expect(opaque).toBeGreaterThan(100);
  });
  test('at detail 0 no texture is blitted', () => {
    const { ctx, trace } = strictCtx();
    paintGround(ctx, tileGeom(2, 2, 0), 'meadow', 'hsl(100 30% 40%)', 3, 0);
    expect(trace.some((t) => t.startsWith('drawImage'))).toBe(false);
  });
});
