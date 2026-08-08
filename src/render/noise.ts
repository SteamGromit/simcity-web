/**
 * Deterministic value noise for terrain and texture. Pure — no canvas, no
 * global state, so a tile shaded at frame 1 shades identically at frame 900
 * and a test can assert on it.
 *
 * The old ground shading was two sine waves, which reads as a moiré weave
 * once the whole map is on screen. Real noise has no repeat inside the grid,
 * so a meadow looks like a meadow.
 */

/** Hash a lattice point to 0..1. Integer mixing, no float accumulation. */
export function hash2(x: number, y: number, seed = 0): number {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263 + (seed | 0) * 1442695040;
  h = (h ^ (h >>> 13)) * 1274126177;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smoothstep, the classic 3t²−2t³ ease used between lattice points. */
function ease(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Bilinear value noise on the unit lattice, 0..1. */
export function valueNoise(x: number, y: number, seed = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = ease(x - xi);
  const fy = ease(y - yi);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  const top = a + (b - a) * fx;
  const bot = c + (d - c) * fx;
  return top + (bot - top) * fy;
}

/**
 * Fractional Brownian motion: `octaves` layers of value noise at doubling
 * frequency and halving amplitude, normalized back to 0..1.
 */
export function fbm(x: number, y: number, seed = 0, octaves = 3): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let freq = 1;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise(x * freq, y * freq, seed + o * 101) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/** Signed fbm in −1..1, for perturbations that should average to zero. */
export function fbmSigned(x: number, y: number, seed = 0, octaves = 3): number {
  return fbm(x, y, seed, octaves) * 2 - 1;
}
