import { GRID, Terrain, Tile, Zone } from './types';

export function idx(x: number, y: number): number {
  return y * GRID + x;
}

export function inBounds(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < GRID && y < GRID;
}

export function neighbors4(x: number, y: number): [number, number][] {
  const out: [number, number][] = [];
  if (inBounds(x - 1, y)) out.push([x - 1, y]);
  if (inBounds(x + 1, y)) out.push([x + 1, y]);
  if (inBounds(x, y - 1)) out.push([x, y - 1]);
  if (inBounds(x, y + 1)) out.push([x, y + 1]);
  return out;
}

/** All in-bounds tiles with Chebyshev distance ≤ r from (x,y), center included. */
export function tilesWithin(x: number, y: number, r: number): [number, number][] {
  const out: [number, number][] = [];
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (inBounds(x + dx, y + dy)) out.push([x + dx, y + dy]);
    }
  }
  return out;
}

export function forEachTile(cb: (x: number, y: number, i: number) => void): void {
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) cb(x, y, idx(x, y));
  }
}

/**
 * Rasterize a 4-connected line between two tiles (stairstep Bresenham,
 * one orthogonal step at a time so a road laid along it always connects).
 * Includes both endpoints, start first.
 */
export function roadLine(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const pts: [number, number][] = [[x0, y0]];
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = Math.sign(x1 - x0);
  const sy = Math.sign(y1 - y0);
  let err = dx - dy;
  while (x !== x1 || y !== y1) {
    if (y === y1 || (2 * err > -dy && x !== x1)) {
      err -= dy;
      x += sx;
    } else {
      err += dx;
      y += sy;
    }
    pts.push([x, y]);
  }
  return pts;
}

export function blankTile(): Tile {
  return {
    zone: Zone.None,
    terrain: Terrain.Grass,
    elevation: 0,
    stage: 0,
    density: 1,
    powered: false,
    watered: false,
    abandoned: false,
    wire: false,
    pipe: false,
    fireCov: 0,
    policeCov: 0,
    schoolCov: 0,
    healthCov: 0,
    busCov: 0,
    burning: 0,
    rubble: 0,
    pollution: 0,
    landValue: 0.3,
    commute: Infinity,
    traffic: 0,
  };
}
