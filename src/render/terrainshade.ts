/** Terrain lightness variation. Pure — no canvas. */

/**
 * Lightness delta for a ground tile: a low-frequency rolling field
 * (meadow-scale patches) plus a small per-tile jitter. Replaces the old
 * per-tile ±6 noise that read as a checkerboard.
 */
export function groundShade(x: number, y: number, v: number): number {
  const rolling = 2.5 * Math.sin(x * 0.11 + y * 0.07) + 2.5 * Math.sin(x * 0.05 - y * 0.13);
  return rolling + v * 3;
}
