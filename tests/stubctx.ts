/**
 * A canvas stand-in for exercising painters under Node.
 *
 * It enforces the one rule the browser's context does and our code has broken
 * before: an ellipse or arc radius may not be negative or non-finite. The real
 * canvas throws IndexSizeError there, and because that throw escaped the render
 * loop it stopped the game redrawing altogether — the crash that shipped in
 * v0.59.0 and stood until v0.59.3. Any painter worth trusting at a turned
 * camera gets swept against this.
 */
export function strictCtx(): {
  ctx: CanvasRenderingContext2D;
  radii: number[];
  /** Every drawing call made, as `name(args…)` with coordinates rounded.
   * Two runs that should paint the same picture produce the same trace. */
  trace: string[];
} {
  const radii: number[] = [];
  const trace: string[] = [];
  const gradient = { addColorStop: () => {} };
  const bad = (r: number, axis: string) =>
    `IndexSizeError: the ${axis} radius provided (${r}) is negative`;

  const state: Record<string | symbol, unknown> = {
    globalAlpha: 1,
    lineWidth: 1,
    fillStyle: '#000',
    strokeStyle: '#000',
    globalCompositeOperation: 'source-over',
    font: '10px sans-serif',
    lineJoin: 'miter',
    lineCap: 'butt',
    shadowBlur: 0,
    shadowColor: 'transparent',
    canvas: { width: 800, height: 600 },
  };

  const methods: Record<string, (...a: number[]) => unknown> = {
    ellipse: (_x, _y, rx, ry) => {
      radii.push(rx, ry);
      if (!(rx >= 0) || !Number.isFinite(rx)) throw new Error(bad(rx, 'major-axis'));
      if (!(ry >= 0) || !Number.isFinite(ry)) throw new Error(bad(ry, 'minor-axis'));
      return undefined;
    },
    arc: (_x, _y, r) => {
      radii.push(r);
      if (!(r >= 0) || !Number.isFinite(r)) throw new Error(bad(r, ''));
      return undefined;
    },
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => gradient,
    measureText: () => ({ width: 10 }),
  };

  /** Round hard enough that floating-point noise never fails a comparison,
   * but not so hard that a real half-pixel shift hides inside it. */
  const round = (v: unknown) => (typeof v === 'number' ? Math.round(v * 16) / 16 : String(v));

  const ctx = new Proxy(state, {
    get(t, prop) {
      const name = String(prop);
      if (prop in methods) {
        return (...args: number[]) => {
          trace.push(`${name}(${args.map(round).join(',')})`);
          return methods[name](...args);
        };
      }
      if (prop in t) return t[prop];
      // every other context method is a no-op — but it still gets recorded,
      // which is the whole point: the calls *are* the picture
      return (...args: unknown[]) => {
        trace.push(`${name}(${args.map(round).join(',')})`);
        return undefined;
      };
    },
    set(t, prop, v) {
      t[prop] = v;
      trace.push(`${String(prop)}=${round(v)}`);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;

  return { ctx, radii, trace };
}

/**
 * A canvas factory for the sprite cache, which bakes into offscreen canvases
 * that Node does not have. Every sprite paints into a strict context, so a
 * baked painter is swept exactly as a live one is.
 */
export function stubCanvasFactory() {
  const contexts: CanvasRenderingContext2D[] = [];
  const factory = (w: number, h: number) => {
    const { ctx } = strictCtx();
    contexts.push(ctx);
    return {
      width: w,
      height: h,
      getContext: () => ctx,
    } as unknown as HTMLCanvasElement;
  };
  return { factory, contexts };
}
