export const TILE_W = 64;
export const TILE_H = 32;

/**
 * World-pixel position of tile (x,y): the top corner of its diamond.
 * Standard 2:1 dimetric projection.
 */
export function isoToScreen(x: number, y: number): { sx: number; sy: number } {
  return {
    sx: ((x - y) * TILE_W) / 2,
    sy: ((x + y) * TILE_H) / 2,
  };
}

/** Inverse of isoToScreen; returns fractional tile coordinates. */
export function screenToIso(sx: number, sy: number): { x: number; y: number } {
  const a = (2 * sx) / TILE_W; // x − y
  const b = (2 * sy) / TILE_H; // x + y
  return { x: (a + b) / 2, y: (b - a) / 2 };
}
