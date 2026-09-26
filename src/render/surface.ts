/**
 * Per-pixel finishing for baked sprites.
 *
 * A vector painter leaves surfaces mathematically flat; a hair of luminance
 * noise over everything is the photographic grain that makes brick, glass and
 * asphalt read as one material world rather than a set of fills. Bake-time
 * only, so it is free at draw time. Where the context has no pixels to read
 * (the Node stub) it does nothing.
 */

import { hash2 } from './noise';

/** Signed luminance delta for a pixel, in 0..255 units. */
export function grainPixel(x: number, y: number, seed: number, amount: number): number {
  return (hash2(x, y, seed) - 0.5) * 2 * amount * 255;
}

/** Add ±`amount` luminance noise to every opaque pixel of the top-left
 * `w`×`h` device pixels. Transparent pixels are left alone so a sprite's
 * silhouette stays clean. */
export function grain(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  amount = 0.03,
  seed = 1,
): void {
  const get = (ctx as { getImageData?: unknown }).getImageData;
  if (typeof get !== 'function') return;
  let img: ImageData | undefined;
  try {
    img = ctx.getImageData(0, 0, Math.max(1, w | 0), Math.max(1, h | 0));
  } catch {
    return;
  }
  if (!img || !img.data) return;
  const d = img.data;
  const W = img.width;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    if (d[i + 3] < 8) continue;
    const g = grainPixel(p % W, (p / W) | 0, seed, amount);
    d[i] = d[i] + g; // Uint8ClampedArray clamps
    d[i + 1] = d[i + 1] + g;
    d[i + 2] = d[i + 2] + g;
  }
  ctx.putImageData(img, 0, 0);
}
