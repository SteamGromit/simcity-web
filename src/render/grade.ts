/**
 * The finishing pass: what happens to the whole frame after the city is on it.
 *
 * Sky behind the map, aerial perspective over the far half of it, a vignette
 * to settle the corners, and a bloom that lets lit windows and street lamps
 * spill light the way a camera would. None of it is per-object work — it is a
 * handful of full-frame composites, so it costs the same whether the city is
 * four houses or four thousand.
 */

import { ENV, css, mix } from './palette';

/** Sky gradient behind the map — replaces the flat void the map used to sit in. */
export function paintSky(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  night: number,
): void {
  const dusk = Math.min(1, night * 1.25);
  const top = mix(ENV.skyTop, { h: 228, s: 46, l: 9 }, dusk);
  const horizon = mix(ENV.skyHorizon, { h: 232, s: 34, l: 15 }, dusk);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, css(top));
  g.addColorStop(0.62, css(horizon));
  g.addColorStop(1, css(mix(horizon, { h: 220, s: 26, l: 12 }, 0.55 + dusk * 0.3)));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/**
 * Aerial perspective. Screen height is depth under a fixed camera, so a
 * top-weighted wash *is* distance fog. It fades out as you zoom in, where the
 * whole viewport is at much the same distance.
 */
export function paintHaze(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  zoom: number,
  night: number,
): void {
  // Deliberately restrained: enough to push the far edge of a big city back,
  // not enough to wash the colour out of a skyline. It fades to nothing by
  // zoom 1, where the viewport is all much the same distance away anyway.
  const strength = Math.max(0, 0.1 - zoom * 0.085) * (1 - night * 0.6);
  if (strength <= 0.004) return;
  const g = ctx.createLinearGradient(0, 0, 0, h * 0.5);
  g.addColorStop(0, css(ENV.haze, strength));
  g.addColorStop(1, css(ENV.haze, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h * 0.5);
}

/** A soft darkening toward the corners; keeps the eye in the middle. */
export function paintVignette(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  strength = 0.18,
): void {
  const g = ctx.createRadialGradient(
    w / 2,
    h * 0.52,
    Math.min(w, h) * 0.36,
    w / 2,
    h * 0.52,
    Math.max(w, h) * 0.78,
  );
  g.addColorStop(0, 'rgba(10, 12, 22, 0)');
  g.addColorStop(1, `rgba(10, 12, 22, ${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

let bloomBuf: HTMLCanvasElement | null = null;

/**
 * Bloom. The frame is squeezed into a quarter-size buffer, everything but the
 * brightest pixels crushed out of it, blurred, and added back — so a lit
 * office window throws a halo and a floodlit stadium glows.
 *
 * Falls back to doing nothing where canvas filters are unavailable, which
 * costs the effect but never the frame.
 */
export function paintBloom(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  strength: number,
): void {
  if (strength <= 0.01 || w < 8 || h < 8) return;
  const bw = Math.max(4, Math.floor(w / 4));
  const bh = Math.max(4, Math.floor(h / 4));
  if (!bloomBuf) bloomBuf = document.createElement('canvas');
  if (bloomBuf.width !== bw) bloomBuf.width = bw;
  if (bloomBuf.height !== bh) bloomBuf.height = bh;
  const b = bloomBuf.getContext('2d');
  if (!b || typeof b.filter !== 'string') return;
  b.setTransform(1, 0, 0, 1, 0, 0);
  b.globalCompositeOperation = 'source-over';
  b.clearRect(0, 0, bw, bh);
  // crush everything but the highlights, then spread them
  b.filter = 'brightness(2.1) contrast(3.6) saturate(1.2) blur(2px)';
  b.drawImage(ctx.canvas, 0, 0, bw, bh);
  b.filter = 'none';
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = strength;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(bloomBuf, 0, 0, w, h);
  ctx.restore();
}

/**
 * The last touch: a cool lift in the shadows and a warm one in the lights, so
 * the frame reads as photographed rather than filled.
 */
export function paintGrade(ctx: CanvasRenderingContext2D, w: number, h: number, night: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, `rgba(150, 178, 216, ${0.06 - night * 0.03})`);
  g.addColorStop(1, `rgba(255, 214, 160, ${0.08 - night * 0.03})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}
