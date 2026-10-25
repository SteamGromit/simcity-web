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

/** One cell of a widened road corridor. */
export interface BandCell {
  x: number;
  y: number;
  /** This cell is the corridor's planted centre strip (boulevards only). */
  median: boolean;
}

/**
 * Widen a rasterized road line into a band `width` tiles across.
 *
 * Each tile of the line is stamped with its neighbours offset along the local
 * perpendicular, so a stairstep line comes out as a corridor that turns
 * corners without gaps. Odd widths centre on the line; even widths lean one
 * tile to the positive side, which is what makes a two-square route sit
 * beside the tile you aimed at rather than straddling it.
 *
 * A three-wide band (the boulevard) marks its centre column as a median. Two
 * rules keep that honest at corners, where the perpendicular flips and the
 * band folds back over itself:
 *
 * - a cell claimed as a lane by any step is a lane, so a turn stays drivable;
 * - a median left with no median neighbour is demoted too, because a lone
 *   planted tile in the middle of a carriageway is a stray patch of grass
 *   rather than a central reservation.
 *
 * The upshot is that straight runs get a proper median and a stairstepped
 * diagonal is laid as solid carriageway — which is the honest answer, since a
 * median down a zigzag would sever the lanes on either side of it.
 */
export function roadBand(line: [number, number][], width: number): BandCell[] {
  if (width <= 1) return line.map(([x, y]) => ({ x, y, median: false }));
  const half = Math.floor((width - 1) / 2);
  const offsets: number[] = [];
  for (let k = 0; k < width; k++) offsets.push(k - half);
  // only the three-wide boulevard has a centre strip; wider classes are all lanes
  const medianOffset = width === 3 ? 0 : null;

  const cells = new Map<number, BandCell>();
  for (let i = 0; i < line.length; i++) {
    const [x, y] = line[i];
    const prev = line[i - 1] ?? line[i];
    const next = line[i + 1] ?? line[i];
    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    // perpendicular to the dominant axis; a single-tile line runs east-west
    const alongX = Math.abs(dx) >= Math.abs(dy);
    const px = alongX ? 0 : 1;
    const py = alongX ? 1 : 0;
    for (const o of offsets) {
      const nx = x + px * o;
      const ny = y + py * o;
      if (!inBounds(nx, ny)) continue;
      const key = idx(nx, ny);
      const median = o === medianOffset;
      const seen = cells.get(key);
      if (seen) {
        if (!median) seen.median = false; // a lane anywhere wins over a median
        continue;
      }
      cells.set(key, { x: nx, y: ny, median });
    }
  }

  // demote medians that ended up alone; see the rules above
  for (const cell of cells.values()) {
    if (!cell.median) continue;
    const hasCompany = neighbors4(cell.x, cell.y).some(
      ([nx, ny]) => cells.get(idx(nx, ny))?.median === true,
    );
    if (!hasCompany) cell.median = false;
  }
  return [...cells.values()];
}

export function blankTile(): Tile {
  return {
    zone: Zone.None,
    terrain: Terrain.Grass,
    elevation: 0,
    stage: 0,
    density: 1,
    tier: 2,
    powered: false,
    watered: false,
    abandoned: false,
    anchor: -1,
    road: 0,
    median: false,
    wire: false,
    pipe: false,
    transitShare: 1,
    fireCov: 0,
    policeCov: 0,
    schoolCov: 0,
    healthCov: 0,
    busCov: 0,
    garbageCov: 0,
    garbage: 0,
    crime: 0,
    crimeFlash: 0,
    accident: 0,
    age: 0,
    grew: 24,
    collapseFlash: 0,
    burning: 0,
    rubble: 0,
    pollution: 0,
    landValue: 0.3,
    commute: Infinity,
    traffic: 0,
  };
}
