export const TILE_W = 64;
export const TILE_H = 32;
/** Screen pixels of lift per elevation level. */
export const ELEV_PX = 10;

/**
 * The projection: rotate grid coordinates by the view angle, then apply the
 * classic 2:1 dimetric squash. At angle 0 this is identical to the original
 * fixed isometric view. Coordinates are fractional grid units — integer
 * values land on tile corners, +0.5 on tile centers.
 */
export function projectAt(
  x: number,
  y: number,
  cos: number,
  sin: number,
): { sx: number; sy: number } {
  const xr = x * cos - y * sin;
  const yr = x * sin + y * cos;
  return {
    sx: ((xr - yr) * TILE_W) / 2,
    sy: ((xr + yr) * TILE_H) / 2,
  };
}

/** Inverse of projectAt; returns fractional grid coordinates. */
export function unprojectAt(
  sx: number,
  sy: number,
  cos: number,
  sin: number,
): { x: number; y: number } {
  const a = (2 * sx) / TILE_W; // xr − yr
  const b = (2 * sy) / TILE_H; // xr + yr
  const xr = (a + b) / 2;
  const yr = (b - a) / 2;
  return { x: xr * cos + yr * sin, y: -xr * sin + yr * cos };
}

// Module-level current view angle, consumed by every draw call site.
let viewAngle = 0;
let cosA = 1;
let sinA = 0;

export function setViewAngle(angle: number): void {
  viewAngle = angle;
  cosA = Math.cos(angle);
  sinA = Math.sin(angle);
}

export function getViewAngle(): number {
  return viewAngle;
}

export function isoToScreen(x: number, y: number): { sx: number; sy: number } {
  return projectAt(x, y, cosA, sinA);
}

export function screenToIso(sx: number, sy: number): { x: number; y: number } {
  return unprojectAt(sx, sy, cosA, sinA);
}

export interface TileGeom {
  /** projected tile center */
  cx: number;
  cy: number;
  /** projected corners of the unit tile square, grid order:
   * (x,y) (x+1,y) (x+1,y+1) (x,y+1) — clockwise on screen at every angle */
  corners: [number, number][];
}

/** Projected geometry for tile (x,y) under the current view angle,
 * lifted by its elevation (whole tile sits at one level). */
export function tileGeom(x: number, y: number, elev = 0): TileGeom {
  const dy = elev * ELEV_PX;
  const c = isoToScreen(x + 0.5, y + 0.5);
  const p0 = isoToScreen(x, y);
  const p1 = isoToScreen(x + 1, y);
  const p2 = isoToScreen(x + 1, y + 1);
  const p3 = isoToScreen(x, y + 1);
  return {
    cx: c.sx,
    cy: c.sy - dy,
    corners: [
      [p0.sx, p0.sy - dy],
      [p1.sx, p1.sy - dy],
      [p2.sx, p2.sy - dy],
      [p3.sx, p3.sy - dy],
    ],
  };
}

/** Painter's depth of a tile under the current angle — draw ascending. */
export function tileDepth(x: number, y: number): number {
  const xr = (x + 0.5) * cosA - (y + 0.5) * sinA;
  const yr = (x + 0.5) * sinA + (y + 0.5) * cosA;
  return xr + yr;
}
