/**
 * The land itself: grass, sand, rock, snow, water, and the cliff faces
 * between elevations.
 *
 * Two changes carry most of the difference from the old flat diamonds. The
 * first is that colour comes from a low-frequency noise field rather than a
 * pair of sine waves, so meadows have patches instead of a moiré weave. The
 * second is that every tile takes a *texture blit* on top of its fill — a
 * transparent sprite of speckle and tufts that works over any base colour, so
 * one baked sprite dresses grass, sand and snow alike.
 */

import { fbm, hash2 } from './noise';
import { ENV, Hsl, css, hsl, lit, mix } from './palette';
import { LIGHT, Pt } from './sun';
import { Sprite, blit, sprite } from './spritecache';
import type { VegTint } from './seasonfx';
import { TILE_H, TILE_W, TileGeom } from './iso';

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export type GroundKind = 'meadow' | 'desert' | 'rock' | 'snow' | 'dirt';

/**
 * Base colour of a land tile. The broad field decides where meadow gives way
 * to parched grass; a finer octave breaks up individual tiles so a lawn never
 * looks stamped.
 */
export function groundTone(
  kind: GroundKind,
  x: number,
  y: number,
  veg: VegTint,
  grassSat: number,
): Hsl {
  const broad = fbm(x * 0.085, y * 0.085, 4242, 3);
  const fine = fbm(x * 0.42, y * 0.42, 771, 2);
  // Kept gentle on purpose: each tile is one flat fill, so a big lightness
  // swing between neighbours reads as a diamond quilt rather than a meadow.
  // The texture sprite carries the variation the colour no longer has to.
  const shade = (broad - 0.5) * 4 + (fine - 0.5) * 2;
  switch (kind) {
    case 'rock':
      return hsl(26 + (fine - 0.5) * 10, 9 + broad * 7, 40 + shade * 1.1);
    case 'snow':
      return hsl(206 + (broad - 0.5) * 12, 10 + fine * 10, 80 + shade * 0.8);
    case 'dirt':
      return hsl(34 + (fine - 0.5) * 12, 22 + broad * 10, 40 + shade);
    case 'desert': {
      const dune = smooth(0.42, 0.72, broad);
      return hsl(
        42 + (fine - 0.5) * 10 - dune * 4,
        Math.min(70, (34 + broad * 12) * grassSat),
        56 + shade * 1.3 + dune * 3,
      );
    }
    case 'meadow':
    default: {
      // parched patches drift toward straw; damp hollows deepen
      const dry = smooth(0.56, 0.8, broad);
      const damp = smooth(0.44, 0.2, broad);
      return hsl(
        98 + veg.grassHue + (fine - 0.5) * 14 - dry * 26 + damp * 8,
        Math.min(72, (30 + broad * 14 - dry * 8) * grassSat),
        33 + veg.grassLight + shade + dry * 9 - damp * 3,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Texture
// ---------------------------------------------------------------------------

const HW = TILE_W / 2;
const HH = TILE_H / 2;

/** Clip the current path to a tile diamond of the given half-extents. */
function clipDiamond(ctx: CanvasRenderingContext2D, hw: number, hh: number): void {
  ctx.beginPath();
  ctx.moveTo(0, -hh);
  ctx.lineTo(hw, 0);
  ctx.lineTo(0, hh);
  ctx.lineTo(-hw, 0);
  ctx.closePath();
  ctx.clip();
}

/**
 * A transparent overlay of ground texture. Because it carries no base colour,
 * eight of these dress every kind of ground in the game.
 */
function detailSprite(kind: GroundKind, variant: number) {
  return sprite(
    `gd${kind}${variant}`,
    { w: TILE_W + 2, h: TILE_H + 2, ax: HW + 1, ay: HH + 1 },
    (ctx) => {
      // the tone field goes down first, in device pixels; then the transform
      // the cache set up is put back for the tufts
      ctx.save();
      paintTone(ctx, kind, variant);
      ctx.restore();
      clipDiamond(ctx, HW + 1, HH + 1);
      const seed = variant * 31 + 7;
      if (kind === 'rock' || kind === 'snow') {
        for (let k = 0; k < 26; k++) {
          const u = hash2(k, 1, seed) * 2 - 1;
          const v = hash2(k, 2, seed) * 2 - 1;
          if (Math.abs(u) + Math.abs(v) > 1) continue;
          const dark = hash2(k, 3, seed) > 0.5;
          ctx.fillStyle = dark ? 'rgba(30, 34, 42, 0.16)' : 'rgba(255, 255, 255, 0.13)';
          const w = 2 + hash2(k, 4, seed) * 4;
          ctx.fillRect(u * HW, v * HH, w, w * 0.5);
        }
        return;
      }
      if (kind === 'desert') {
        // wind ripples running along the dunes
        ctx.strokeStyle = 'rgba(150, 118, 70, 0.16)';
        ctx.lineWidth = 1;
        for (let k = -3; k <= 3; k++) {
          ctx.beginPath();
          for (let t = -1; t <= 1; t += 0.25) {
            const px = t * HW;
            const py = k * 5 + Math.sin(t * 3 + k) * 1.6 + t * 5;
            t === -1 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
          }
          ctx.stroke();
        }
        for (let k = 0; k < 10; k++) {
          const u = hash2(k, 5, seed) * 2 - 1;
          const v = hash2(k, 6, seed) * 2 - 1;
          if (Math.abs(u) + Math.abs(v) > 0.9) continue;
          ctx.fillStyle = 'rgba(90, 70, 40, 0.16)';
          ctx.fillRect(u * HW, v * HH, 1.6, 1.2);
        }
        return;
      }
      if (kind === 'dirt') {
        for (let k = 0; k < 30; k++) {
          const u = hash2(k, 7, seed) * 2 - 1;
          const v = hash2(k, 8, seed) * 2 - 1;
          if (Math.abs(u) + Math.abs(v) > 0.95) continue;
          ctx.fillStyle = hash2(k, 9, seed) > 0.55 ? 'rgba(40, 30, 18, 0.2)' : 'rgba(190, 170, 130, 0.16)';
          ctx.fillRect(u * HW, v * HH, 2, 1.4);
        }
        return;
      }
      // meadow: scattered blades, a few darker clumps, a light dusting
      for (let k = 0; k < 64; k++) {
        const u = hash2(k, 11, seed) * 2 - 1;
        const v = hash2(k, 12, seed) * 2 - 1;
        if (Math.abs(u) + Math.abs(v) > 1.02) continue;
        const px = u * HW;
        const py = v * HH;
        const r = hash2(k, 13, seed);
        if (r > 0.78) {
          // a tuft: two or three blades leaning the same way
          ctx.strokeStyle = k % 3 === 0 ? 'rgba(196, 220, 140, 0.26)' : 'rgba(28, 52, 22, 0.34)';
          ctx.lineWidth = 0.9;
          const lean = (hash2(k, 14, seed) - 0.5) * 2;
          for (let b = -1; b <= 1; b++) {
            ctx.beginPath();
            ctx.moveTo(px + b * 1.2, py);
            ctx.lineTo(px + b * 1.2 + lean, py - 2.4 - hash2(k, 15 + b, seed) * 1.6);
            ctx.stroke();
          }
        } else if (r > 0.42) {
          ctx.fillStyle = 'rgba(30, 56, 24, 0.22)';
          ctx.fillRect(px, py, 1.6, 1.1);
        } else {
          ctx.fillStyle = 'rgba(216, 234, 168, 0.16)';
          ctx.fillRect(px, py, 1.4, 1);
        }
      }
    },
  );
}

/**
 * The per-pixel tone field for a ground kind: mid-frequency fbm rendered as
 * black at a low alpha wherever the field dips, so a meadow has hollows and
 * patches at a scale the tile fill cannot carry. Painted into the detail
 * sprite's own pixels *under* the tufts — one blit per tile, no composite
 * switch — and equivalent to multiplying by grey. Device pixels; a no-op on a
 * context with no pixels to read.
 */
export function paintTone(ctx: CanvasRenderingContext2D, kind: GroundKind, variant: number): void {
  const get = (ctx as { getImageData?: unknown }).getImageData;
  if (typeof get !== 'function') return;
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  let img: ImageData | undefined;
  try {
    img = ctx.getImageData(0, 0, W, H);
  } catch {
    return;
  }
  if (!img) return;
  const d = img.data;
  const scale = W / (TILE_W + 2); // device px per logical px
  const cx = (HW + 1) * scale;
  const cy = (HH + 1) * scale;
  const freq = (kind === 'meadow' ? 0.11 : kind === 'desert' ? 0.07 : 0.16) / scale;
  const amp = kind === 'snow' ? 0.12 : kind === 'rock' ? 0.3 : 0.24;
  const seed = 900 + variant * 7 + kind.length;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (x - cx) / cx;
      const dy = (y - cy) / cy;
      if (Math.abs(dx) + Math.abs(dy) > 1.02) continue;
      const n = fbm(x * freq + variant * 13, y * freq * 2, seed, 3) - 0.5;
      if (n >= 0) continue; // the fill shows through untouched here
      const i = (y * W + x) * 4;
      d[i] = 0;
      d[i + 1] = 0;
      d[i + 2] = 0;
      d[i + 3] = Math.round(255 * Math.min(1, -n * amp * 2)); // darker where the field dips
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.putImageData(img, 0, 0);
}

/** Fill a tile and dress it with its texture. `style` is a ready CSS colour —
 * the renderer caches them per tile, because six octaves of noise and a
 * template literal per tile per frame is real money at 96×96. */
export function paintGround(
  ctx: CanvasRenderingContext2D,
  geom: TileGeom,
  kind: GroundKind,
  style: string,
  variant: number,
  detail: 0 | 1 | 2,
): void {
  ctx.beginPath();
  ctx.moveTo(geom.corners[0][0], geom.corners[0][1]);
  for (let i = 1; i < 4; i++) ctx.lineTo(geom.corners[i][0], geom.corners[i][1]);
  ctx.closePath();
  ctx.fillStyle = style;
  ctx.fill();
  if (detail >= 1) blit(ctx, detailSprite(kind, variant & 7), geom.cx, geom.cy);
}

// ---------------------------------------------------------------------------
// Water
// ---------------------------------------------------------------------------

const WAVE_FRAMES = 8;

/**
 * One frame of caustics: the bright, wandering lines light draws on a
 * rippled surface, from a per-pixel noise field thresholded thin. Eight
 * frames cycle; neighbouring tiles run out of phase so a lake reads as one
 * body. Device pixels; a no-op on a context with no pixels to read.
 */
export function causticSprite(frame: number): Sprite {
  const f = ((frame % WAVE_FRAMES) + WAVE_FRAMES) % WAVE_FRAMES;
  return sprite(`wc${f}`, { w: TILE_W + 2, h: TILE_H + 2, ax: HW + 1, ay: HH + 1 }, (ctx) => {
    const get = (ctx as { getImageData?: unknown }).getImageData;
    if (typeof get !== 'function') return;
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    let img: ImageData | undefined;
    try {
      img = ctx.getImageData(0, 0, W, H);
    } catch {
      return;
    }
    if (!img) return;
    const d = img.data;
    const scale = W / (TILE_W + 2);
    const cx = (HW + 1) * scale;
    const cy = (HH + 1) * scale;
    const phase = (f / WAVE_FRAMES) * 2;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const dx = (x - cx) / cx;
        const dy = (y - cy) / cy;
        if (Math.abs(dx) + Math.abs(dy) > 1.02) continue;
        const n = fbm((x / scale) * 0.09 + phase, (y / scale) * 0.18 - phase * 0.6, 4141, 3);
        // a thin band of the field, so the light lies in lines rather than blobs
        const band = 1 - Math.min(1, Math.abs(n - 0.56) / 0.045);
        if (band <= 0) continue;
        const i = (y * W + x) * 4;
        d[i] = 220;
        d[i + 1] = 240;
        d[i + 2] = 252;
        d[i + 3] = Math.round(255 * 0.2 * band);
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.putImageData(img, 0, 0);
  });
}

/** One frame of moving surface: crests, glitter and a hint of current. */
function waveSprite(frame: number) {
  return sprite(`wv${frame}`, { w: TILE_W + 2, h: TILE_H + 2, ax: HW + 1, ay: HH + 1 }, (ctx) => {
    clipDiamond(ctx, HW + 1, HH + 1);
    const phase = (frame / WAVE_FRAMES) * Math.PI * 2;
    // long, low crests — enough to catch the eye, not enough to stripe the lake
    ctx.strokeStyle = 'rgba(214, 238, 250, 0.11)';
    ctx.lineWidth = 1;
    for (let k = -2; k <= 2; k++) {
      ctx.beginPath();
      for (let t = -1; t <= 1.001; t += 0.2) {
        const px = t * HW;
        const py = k * 7 + t * 3.5 + Math.sin(t * 3 + phase + k * 1.7) * 1.2;
        t <= -1 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    for (let k = 0; k < 4; k++) {
      const u = hash2(k, frame, 55) * 2 - 1;
      const v = hash2(k, frame + 40, 55) * 2 - 1;
      if (Math.abs(u) + Math.abs(v) > 0.8) continue;
      ctx.fillRect(u * HW, v * HH + Math.sin(phase + k) * 1.5, 1.4, 0.9);
    }
  });
}

/**
 * Water. `depth` 0 at the shore, 1 out in the middle — it drives both colour
 * and how much of the sky the surface returns. A little fbm rides on top of
 * the depth so a lake doesn't band along the tile grid.
 */
export function paintWater(
  ctx: CanvasRenderingContext2D,
  geom: TileGeom,
  x: number,
  y: number,
  depth: number,
  timeMs: number,
  detail: 0 | 1 | 2,
): void {
  const wobble = (fbm(x * 0.2, y * 0.2, 313, 2) - 0.5) * 0.22;
  const d = Math.max(0, Math.min(1, depth + wobble));
  const tone = mix(ENV.waterShallow, ENV.waterDeep, smooth(0, 0.9, d));
  ctx.beginPath();
  ctx.moveTo(geom.corners[0][0], geom.corners[0][1]);
  for (let i = 1; i < 4; i++) ctx.lineTo(geom.corners[i][0], geom.corners[i][1]);
  ctx.closePath();
  ctx.fillStyle = css(tone);
  ctx.fill();
  // the sky in it: a touch lighter toward the top of the tile
  const sky = ctx.createLinearGradient(0, geom.cy - TILE_H / 2, 0, geom.cy + TILE_H / 2);
  sky.addColorStop(0, 'rgba(200, 226, 244, 0.1)');
  sky.addColorStop(1, 'rgba(200, 226, 244, 0)');
  ctx.fillStyle = sky;
  ctx.fill();
  if (detail === 0) return;
  // A sun glint that drifts with the swell, brightest out in the open. The
  // spatial term is deliberately slow — a per-tile phase this fast turned a
  // lake into a chequerboard of light and dark diamonds.
  const glint = 0.09 + 0.13 * d;
  ctx.fillStyle = `rgba(196, 226, 246, ${(
    glint * (0.65 + 0.35 * Math.sin(timeMs / 1600 + (x - y) * 0.11))
  ).toFixed(3)})`;
  ctx.fill();
  // caustics, then glitter: neighbouring tiles run out of phase, so the
  // surface reads as one body
  const frame = Math.floor(timeMs / 240 + x * 3 + y * 5) % WAVE_FRAMES;
  blit(ctx, causticSprite(frame), geom.cx, geom.cy, 0.35 + 0.25 * (1 - d));
  blit(ctx, waveSprite((frame + 3) % WAVE_FRAMES), geom.cx, geom.cy, 0.3 + 0.3 * (1 - d));
}

/**
 * The strip where land meets water, drawn on the *water* tile along each edge
 * that borders land: wet sand, then a foam line that breathes with the swell.
 */
export function paintShore(
  ctx: CanvasRenderingContext2D,
  geom: TileGeom,
  edge: number,
  timeMs: number,
  surge: number,
): void {
  const c1 = geom.corners[edge];
  const c2 = geom.corners[(edge + 1) % 4];
  const toward = (p: Pt, t: number): Pt => [
    p[0] + (geom.cx - p[0]) * t,
    p[1] + (geom.cy - p[1]) * t,
  ];
  const wash = 0.2 + 0.05 * Math.sin(timeMs / 900 + (geom.cx + geom.cy) * 0.02) + surge * 0.16;
  const band = (from: number, to: number, style: string) => {
    const a = toward(c2, to);
    const b = toward(c1, to);
    const a2 = toward(c2, from);
    const b2 = toward(c1, from);
    ctx.beginPath();
    ctx.moveTo(b2[0], b2[1]);
    ctx.lineTo(a2[0], a2[1]);
    ctx.lineTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.closePath();
    ctx.fillStyle = style;
    ctx.fill();
  };
  // three graded bands: dry sand at the line, wet sand, then the shallows.
  // Grading them keeps a lake from being outlined in a single bright stroke.
  band(0, 0.08, css(ENV.sand, 0.9));
  band(0.06, wash * 0.6, css(mix(ENV.sand, ENV.waterShallow, 0.4), 0.8));
  band(wash * 0.55, wash + 0.14, css(mix(ENV.sand, ENV.waterShallow, 0.78), 0.6));
  // foam, breaking a little way out from the line
  const fa = toward(c2, wash * 0.5);
  const fb = toward(c1, wash * 0.5);
  ctx.strokeStyle = css(ENV.foam, 0.34 + surge * 0.4);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(fb[0], fb[1]);
  ctx.lineTo(fa[0], fa[1]);
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// Cliffs
// ---------------------------------------------------------------------------

const ROCK_BODY = hsl(28, 16, 40);

/**
 * A vertical face where a tile stands above its neighbour: bedded strata,
 * a lit grass lip along the top edge, and occlusion pooling at the foot.
 */
export function paintCliff(
  ctx: CanvasRenderingContext2D,
  c1: Pt,
  c2: Pt,
  drop: number,
  screenLeft: boolean,
  grass: Hsl,
  seed: number,
): void {
  const level = screenLeft ? LIGHT.left : LIGHT.right;
  const quad: Pt[] = [c1, c2, [c2[0], c2[1] + drop], [c1[0], c1[1] + drop]];
  ctx.beginPath();
  ctx.moveTo(quad[0][0], quad[0][1]);
  for (let i = 1; i < 4; i++) ctx.lineTo(quad[i][0], quad[i][1]);
  ctx.closePath();
  ctx.save();
  ctx.clip();
  const g = ctx.createLinearGradient(0, Math.min(c1[1], c2[1]), 0, Math.max(c1[1], c2[1]) + drop);
  g.addColorStop(0, css(lit(ROCK_BODY, level * 1.1)));
  g.addColorStop(1, css(lit(ROCK_BODY, level * 0.66)));
  ctx.fillStyle = g;
  ctx.fill();
  // strata: bands that follow the edge, jittered so they don't look ruled
  ctx.lineWidth = 1;
  for (let k = 1; k < 6; k++) {
    const fr = k / 6;
    const wob = (hash2(k, seed, 17) - 0.5) * 2.5;
    ctx.strokeStyle = `rgba(38, 28, 18, ${0.1 + hash2(k, seed, 23) * 0.16})`;
    ctx.beginPath();
    ctx.moveTo(c1[0], c1[1] + drop * fr + wob);
    ctx.lineTo(c2[0], c2[1] + drop * fr - wob);
    ctx.stroke();
  }
  // dark pooling at the base
  const ao = ctx.createLinearGradient(0, Math.max(c1[1], c2[1]) + drop, 0, Math.max(c1[1], c2[1]) + drop - Math.min(9, drop));
  ao.addColorStop(0, 'rgba(16, 18, 30, 0.4)');
  ao.addColorStop(1, 'rgba(16, 18, 30, 0)');
  ctx.fillStyle = ao;
  ctx.fill();
  ctx.restore();
  // grass lip breaking over the top edge
  ctx.strokeStyle = css(lit(grass, LIGHT.roof * 1.04));
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(c1[0], c1[1] + 0.5);
  ctx.lineTo(c2[0], c2[1] + 0.5);
  ctx.stroke();
}
