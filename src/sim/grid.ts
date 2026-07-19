import { GRID, Tile, Zone } from './types';

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

export function blankTile(): Tile {
  return {
    zone: Zone.None,
    stage: 0,
    powered: false,
    abandoned: false,
    wire: false,
    fireCov: 0,
    policeCov: 0,
    schoolCov: 0,
    pollution: 0,
    landValue: 0.3,
    commute: Infinity,
    traffic: 0,
  };
}
