/**
 * Bake once, blit many.
 *
 * Every building used to be re-drawn from scratch — a dozen path fills, a
 * roof, a window loop — sixty times a second, for every lot on screen. That
 * budget is what kept the art thin. With the camera angle fixed, the same
 * lot draws the same pixels every frame, so it can be rendered once into an
 * offscreen canvas and afterwards copied in a single `drawImage`.
 *
 * The point isn't speed for its own sake: it's that a sprite drawn once can
 * afford a hundred times the detail a per-frame painter can.
 *
 * Sprites are keyed by everything that changes their pixels (kind, stage,
 * tier, variant bucket, level of detail) and evicted least-recently-used once
 * the cache passes a pixel budget.
 */

export interface Sprite {
  canvas: HTMLCanvasElement;
  /** Logical (CSS-pixel) size; the backing canvas is `scale`× this. */
  w: number;
  h: number;
  /** Where the sprite's origin sits inside it, in logical pixels. Blitting
   * draws the sprite at (originX − ax, originY − ay). */
  ax: number;
  ay: number;
}

export interface SpriteSpec {
  w: number;
  h: number;
  ax: number;
  ay: number;
}

/** Paints a sprite's contents. Origin (ax, ay) is already translated to (0,0). */
export type SpritePainter = (ctx: CanvasRenderingContext2D, spec: SpriteSpec) => void;

/**
 * Sprites bake at the display's own pixel density, so at zoom 1 on a retina
 * screen a blit is pixel-exact and on a 1× screen nothing is wasted.
 */
let spriteScale = typeof devicePixelRatio === 'number' ? Math.max(1, Math.min(2, devicePixelRatio)) : 1;

export function getSpriteScale(): number {
  return spriteScale;
}

/** Tests, and the Config panel if the window moves between displays. */
export function setSpriteScale(s: number): void {
  const next = Math.max(0.5, Math.min(3, s));
  if (next === spriteScale) return;
  spriteScale = next;
  clearSprites();
}

/**
 * ~80 MB of RGBA. A downtown screen at zoom 2 is about 2,500 sprites and
 * 13.7 M px now that lots bake per street side and terrace run (v0.72.0), so
 * the old 14 M budget sat on the working set and evicted what was on screen.
 */
export const PIXEL_BUDGET = 20_000_000;

/**
 * Evictions since the last quality step. A cache whose working set doesn't fit
 * is far worse than a slightly softer one: it re-bakes the same sprites every
 * frame and the frame rate collapses. So if a city is big enough to thrash,
 * the bake resolution steps down until it fits — the picture goes a shade
 * softer and the frame rate stays.
 */
let evictions = 0;
/** Frames in a row that ended with their own working set over budget. */
let overruns = 0;
/** The frame in which an eviction pass found nothing it could drop. */
let stuckFrame = -1;
/** The last few baked keys, a ring, so a profile can say what is churning. */
const recent: string[] = new Array(64).fill('');
/** Over-budget frames in a row before the bake resolution steps down. */
const THRASH_FRAMES = 90;
/**
 * The frame being drawn. An entry touched this frame is part of the working
 * set and is never evicted: throwing it out would only have it baked again a
 * frame later, which is the thrash the budget exists to prevent. When the
 * working set alone is over budget the cache runs over for that frame rather
 * than re-baking the view every frame.
 */
let frame = 0;
/** Call once at the top of each frame. */
export function beginSpriteFrame(): void {
  // the frame just drawn: did its working set alone exceed the budget?
  overruns = pixels > PIXEL_BUDGET ? overruns + 1 : 0;
  if (overruns > THRASH_FRAMES && spriteScale > 1) {
    // the working set doesn't fit at this resolution: bake smaller and start over
    overruns = 0;
    setSpriteScale(Math.max(1, spriteScale - 0.5));
  }
  frame++;
}

type Factory = (w: number, h: number) => HTMLCanvasElement;

const domFactory: Factory = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

let factory: Factory = domFactory;

/** Swap the canvas source. Tests run in Node, where `document` is absent. */
export function setCanvasFactory(f: Factory | null): void {
  factory = f ?? domFactory;
}

interface Entry {
  sprite: Sprite;
  pixels: number;
  used: number;
  /** The frame that last used it. */
  frame: number;
}

const cache = new Map<string, Entry>();
let clock = 0;
let pixels = 0;
let bakes = 0;

/**
 * The sprite for `key`, painted on first ask and reused after. `spec` is only
 * consulted on a miss — a key must always describe the same picture.
 */
export function sprite(
  key: string,
  spec: SpriteSpec,
  paint: SpritePainter,
  scale = spriteScale,
): Sprite {
  const hit = cache.get(key);
  if (hit) {
    hit.used = ++clock;
    hit.frame = frame;
    return hit.sprite;
  }
  const cw = Math.max(1, Math.ceil(spec.w * scale));
  const ch = Math.max(1, Math.ceil(spec.h * scale));
  const canvas = factory(cw, ch);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(scale, 0, 0, scale, spec.ax * scale, spec.ay * scale);
  paint(ctx, spec);
  bakes++;
  recent[bakes % recent.length] = key;
  const entry: Entry = {
    sprite: { canvas, w: spec.w, h: spec.h, ax: spec.ax, ay: spec.ay },
    pixels: cw * ch,
    used: ++clock,
    frame,
  };
  cache.set(key, entry);
  pixels += entry.pixels;
  evict();
  return entry.sprite;
}

/** Drop the least-recently-used sprites until the cache fits its budget. */
function evict(): void {
  if (pixels <= PIXEL_BUDGET) return;
  // once a pass has found only this frame's own sprites there is nothing to
  // gain from sorting the cache again until the next frame
  if (stuckFrame === frame) return;
  const order = [...cache.entries()].sort((a, b) => a[1].used - b[1].used);
  let dropped = 0;
  for (const [key, entry] of order) {
    if (pixels <= PIXEL_BUDGET * 0.8) break;
    if (entry.frame === frame) continue; // on screen now: evicting it is a re-bake next frame
    cache.delete(key);
    pixels -= entry.pixels;
    evictions++;
    dropped++;
  }
  if (dropped === 0) stuckFrame = frame;
}

/**
 * Blit a sprite with its origin at (x, y). `alpha` under 1 fades it — used to
 * cross-fade the night-lit copy of a building over its daylight one.
 */
export function blit(
  ctx: CanvasRenderingContext2D,
  s: Sprite,
  x: number,
  y: number,
  alpha = 1,
): void {
  if (alpha <= 0.004) return;
  if (alpha < 1) {
    const prev = ctx.globalAlpha;
    ctx.globalAlpha = prev * alpha;
    ctx.drawImage(s.canvas, x - s.ax, y - s.ay, s.w, s.h);
    ctx.globalAlpha = prev;
    return;
  }
  ctx.drawImage(s.canvas, x - s.ax, y - s.ay, s.w, s.h);
}

/** Throw everything away — a new city, a new skin, a new render style. */
export function clearSprites(): void {
  cache.clear();
  pixels = 0;
  evictions = 0;
  overruns = 0;
  stuckFrame = -1;
}

export function spriteStats(): {
  count: number;
  pixels: number;
  bakes: number;
  evictions: number;
  scale: number;
  recent: string[];
} {
  // oldest first: the ring's write cursor is bakes % length
  const cursor = bakes % recent.length;
  const ordered = [...recent.slice(cursor + 1), ...recent.slice(0, cursor + 1)];
  return { count: cache.size, pixels, bakes, evictions, scale: spriteScale, recent: ordered.filter((k) => k !== '') };
}
