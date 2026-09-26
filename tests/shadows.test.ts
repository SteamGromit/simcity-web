import { describe, expect, test } from 'vitest';
import { SHADOW_ALPHA, ShadowLayer, shadowBlurPx } from '../src/render/shadows';

function fakeCtx(withFilter: boolean) {
  const calls: string[] = [];
  const state: Record<string, unknown> = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    canvas: { width: 200, height: 100 },
  };
  if (withFilter) state.filter = 'none';
  const ctx = new Proxy(state, {
    get(t, p) {
      if (p in t) return t[p as string];
      return (...a: unknown[]) => {
        calls.push(`${String(p)}(${a.length})`);
        return undefined;
      };
    },
    set(t, p, v) {
      t[p as string] = v;
      calls.push(`${String(p)}=${String(v)}`);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls, state };
}

describe('shadowBlurPx', () => {
  test('clamps across the zoom range', () => {
    expect(shadowBlurPx(0.2)).toBe(0.8);
    expect(shadowBlurPx(1)).toBeCloseTo(1.6);
    expect(shadowBlurPx(3)).toBe(3);
  });
});

describe('ShadowLayer', () => {
  const factory = (w: number, h: number) => {
    const { ctx } = fakeCtx(true);
    return { width: w, height: h, getContext: () => ctx } as unknown as HTMLCanvasElement;
  };
  test('end composites with multiply and a blur when filters exist', () => {
    const layer = new ShadowLayer(factory);
    const { ctx, calls } = fakeCtx(true);
    layer.begin(ctx, 200, 100, { x: 0, y: 0, zoom: 1 }, 1);
    layer.end(ctx, 1);
    expect(calls).toContain('globalCompositeOperation=multiply');
    expect(calls.some((c) => c.startsWith('filter=blur('))).toBe(true);
    expect(calls).toContain(`globalAlpha=${SHADOW_ALPHA}`);
    expect(calls).toContain('drawImage(5)');
  });
  test('end still draws, unblurred, when filter is unsupported', () => {
    const layer = new ShadowLayer(factory);
    const { ctx, calls } = fakeCtx(false);
    layer.begin(ctx, 200, 100, { x: 0, y: 0, zoom: 1 }, 1);
    expect(() => layer.end(ctx, 1)).not.toThrow();
    expect(calls.some((c) => c.startsWith('filter='))).toBe(false);
    expect(calls).toContain('drawImage(5)');
  });
  test('the buffer is half the frame', () => {
    const sizes: number[][] = [];
    const layer = new ShadowLayer((w, h) => {
      sizes.push([w, h]);
      return factory(w, h);
    });
    layer.begin(fakeCtx(true).ctx, 200, 100, { x: 0, y: 0, zoom: 1 }, 1);
    expect(sizes[0]).toEqual([100, 50]);
  });
});
