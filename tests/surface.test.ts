import { describe, expect, test } from 'vitest';
import { grain, grainPixel } from '../src/render/surface';
import { strictCtx } from './stubctx';

describe('grain', () => {
  test('delta is bounded and averages near zero', () => {
    let sum = 0;
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const d = grainPixel(x, y, 3, 0.03);
        expect(Math.abs(d)).toBeLessThanOrEqual(0.03 * 255 + 1e-9);
        sum += d;
      }
    }
    expect(Math.abs(sum / 4096)).toBeLessThan(1);
  });
  test('is a no-op on a context without pixels', () => {
    const { ctx, trace } = strictCtx();
    expect(() => grain(ctx, 10, 10)).not.toThrow();
    expect(trace.some((t) => t.startsWith('putImageData'))).toBe(false);
  });
  test('writes back when pixels exist and leaves transparent pixels alone', () => {
    const data = new Uint8ClampedArray(4 * 4 * 4);
    for (let i = 0; i < 16; i++) {
      data[i * 4] = 128;
      data[i * 4 + 1] = 128;
      data[i * 4 + 2] = 128;
      data[i * 4 + 3] = i < 8 ? 255 : 0;
    }
    let written: Uint8ClampedArray | null = null;
    const ctx = {
      getImageData: () => ({ data, width: 4, height: 4 }),
      putImageData: (img: { data: Uint8ClampedArray }) => {
        written = img.data;
      },
      canvas: { width: 4, height: 4 },
    } as unknown as CanvasRenderingContext2D;
    grain(ctx, 4, 4, 0.1, 1);
    expect(written).not.toBeNull();
    let changed = 0;
    for (let i = 0; i < 16; i++) {
      if (i >= 8) expect(data[i * 4]).toBe(128);
      else if (data[i * 4] !== 128) changed++;
    }
    expect(changed).toBeGreaterThan(0);
  });
});
