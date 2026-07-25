/**
 * Multi-tile buildings.
 *
 * Everything before this occupied exactly one tile, and a great deal of the
 * simulation quietly assumed it: coverage radiates from every tile carrying a
 * service zone, upkeep is charged per tile, power is drawn per tile. A four-
 * by-four stadium that simply set sixteen tiles to `Zone.Stadium` would
 * therefore emit sixteen overlapping coverages, charge sixteen upkeeps, and
 * draw sixteen buildings.
 *
 * So a block has exactly one **anchor** — its lowest-x, lowest-y tile — and
 * every other tile of the block is a **body** tile that points back at it.
 * The rule the rest of the sim follows is one line long: *body tiles are
 * inert.* They hold the ground and conduct power; the anchor carries the
 * service, the upkeep, the jobs, the pollution, and the drawing.
 *
 * `Tile.anchor` is −1 on an ordinary tile, so nothing that predates this —
 * including every existing save — has to know the concept exists.
 */

import { buildingBySlot } from '../content/registry';
import { idx, inBounds } from './grid';
import { CityState, GRID, Tile, Zone } from './types';

/** Footprint edge of whatever occupies this slot; 1 for ordinary buildings. */
export function sizeOfSlot(slot: Zone): number {
  return buildingBySlot(slot)?.size ?? 1;
}

/** True when this tile is part of a block but is not the tile that owns it. */
export function isBody(t: Pick<Tile, 'anchor'>, i: number): boolean {
  return t.anchor >= 0 && t.anchor !== i;
}

/** True when this tile carries its building — always true off a block. */
export function isCarrier(t: Pick<Tile, 'anchor'>, i: number): boolean {
  return !isBody(t, i);
}

/** The tile index that owns whatever stands on tile `i`. */
export function anchorOf(t: Pick<Tile, 'anchor'>, i: number): number {
  return t.anchor >= 0 ? t.anchor : i;
}

/** The ground a building stands on: anchor corner plus edge length. */
export interface BlockBox {
  ax: number;
  ay: number;
  size: number;
}

/** The box tile `i` occupies — a 1×1 box for an ordinary building. */
export function blockBoxOf(city: CityState, i: number): BlockBox {
  const a = anchorOf(city.tiles[i], i);
  return { ax: a % GRID, ay: (a / GRID) | 0, size: sizeOfSlot(city.tiles[a].zone) };
}

/**
 * Chebyshev distance from a tile to the nearest part of a block — 0 anywhere
 * on the building itself.
 *
 * Radiating from the anchor instead would put every field a big building
 * produces off-centre, because the anchor is a *corner*: a five-tile
 * university would reach five tiles further past its far wall than its near
 * one. Measuring to the block makes "within r tiles of the university" mean
 * what it says, and collapses to the old behaviour exactly when size is 1.
 */
export function distanceToBlock(box: BlockBox, nx: number, ny: number): number {
  const dx = Math.max(box.ax - nx, 0, nx - (box.ax + box.size - 1));
  const dy = Math.max(box.ay - ny, 0, ny - (box.ay + box.size - 1));
  return Math.max(dx, dy);
}

/** Every in-bounds tile within `r` of any part of the block, block included. */
export function tilesAroundBlock(box: BlockBox, r: number): [number, number][] {
  const out: [number, number][] = [];
  for (let y = box.ay - r; y < box.ay + box.size + r; y++) {
    for (let x = box.ax - r; x < box.ax + box.size + r; x++) {
      if (inBounds(x, y)) out.push([x, y]);
    }
  }
  return out;
}

/** Every tile index of a `size`×`size` block anchored at (x, y), in bounds. */
export function blockTiles(x: number, y: number, size: number): number[] {
  const out: number[] = [];
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      if (inBounds(x + dx, y + dy)) out.push(idx(x + dx, y + dy));
    }
  }
  return out;
}

/**
 * Every tile of the block that tile `i` belongs to — just `[i]` for an
 * ordinary building. Read from the anchor's own slot rather than from a
 * stored extent, so a block can never disagree with itself about its size.
 */
export function blockOf(city: CityState, i: number): number[] {
  const a = anchorOf(city.tiles[i], i);
  const size = sizeOfSlot(city.tiles[a].zone);
  if (size <= 1) return [a];
  return blockTiles(a % GRID, (a / GRID) | 0, size).filter(
    // only tiles that actually belong: a block partially razed by a crafted
    // save must not drag unrelated neighbours down with it
    (n) => anchorOf(city.tiles[n], n) === a,
  );
}
