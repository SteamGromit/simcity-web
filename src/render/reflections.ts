/**
 * The waterfront, reflected.
 *
 * A building whose near side stands on water is mirrored into it: the same
 * baked sprite, flipped about its base line, clipped to the water tiles it
 * fronts and faded to a fifth. It costs one flipped blit per shoreline
 * lot per frame — a few dozen in a big city — and it is the one thing that
 * makes a lake read as water rather than as a blue floor.
 */

import { idx, inBounds } from '../sim/grid';
import { CityState, GRID, Terrain, Zone } from '../sim/types';
import { civicSwatch } from './buildings';
import type { TileGeom } from './iso';
import { Sprite, blit } from './spritecache';

/** Grid steps for screen sides 0..3 at rest. */
const SIDE_DIRS: [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

export interface ShorelineLot {
  /** Tile index of the lot. */
  i: number;
  /** Indices of the water tiles on its screen-near sides. */
  water: number[];
}

/** Whether a tile has something standing on it that can be mirrored: a
 * developed lot, or a civic building (which stays at stage 0 for life). */
function standing(t: CityState['tiles'][number]): boolean {
  if (t.zone === Zone.None || t.zone === Zone.Road) return false;
  if (t.zone === Zone.Residential || t.zone === Zone.Commercial || t.zone === Zone.Industrial) {
    return t.stage > 0;
  }
  return civicSwatch(t.zone) !== null;
}

/**
 * A fingerprint of everything the shoreline list depends on: which tiles are
 * water, which of those carry a bridge, and what stands beside them. A full
 * pass — 9,216 tiles is nothing, and a sampled stamp left a newly built
 * waterfront lot unmirrored until something unrelated moved.
 */
export function shoreStampOf(city: CityState): number {
  let stamp = 0;
  for (let i = 0; i < city.tiles.length; i++) {
    const t = city.tiles[i];
    if (t.terrain === Terrain.Water) stamp = (stamp * 31 + i * 3 + (t.zone === Zone.Road ? 1 : 0) + 1) | 0;
    if (standing(t)) stamp = (stamp * 17 + i * 7 + t.zone + 1) | 0;
  }
  return stamp;
}

/**
 * Every single-tile lot with a building on it — or a civic building — and
 * water on at least one of its two screen-near sides (screen sides 1 and 2,
 * which are grid directions 1−q and 2−q after a quarter turn of q). Pure;
 * the renderer caches it on `shoreStampOf` and the quarter.
 */
export function shorelineLots(city: CityState, quarter: number): ShorelineLot[] {
  const q = ((quarter % 4) + 4) % 4;
  const near = [SIDE_DIRS[(1 - q + 4) % 4], SIDE_DIRS[(2 - q + 4) % 4]];
  const out: ShorelineLot[] = [];
  for (let i = 0; i < city.tiles.length; i++) {
    const t = city.tiles[i];
    if (!standing(t)) continue;
    const x = i % GRID;
    const y = (i / GRID) | 0;
    const water: number[] = [];
    for (const [dx, dy] of near) {
      if (!inBounds(x + dx, y + dy)) continue;
      const n = idx(x + dx, y + dy);
      if (city.tiles[n].terrain === Terrain.Water && city.tiles[n].zone !== Zone.Road) water.push(n);
    }
    if (water.length) out.push({ i, water });
  }
  return out;
}

/**
 * Mirror `sprite` about the base line of `geom` into the water tiles given,
 * faded and washed toward the water's own blue.
 */
export function drawReflection(
  ctx: CanvasRenderingContext2D,
  geom: TileGeom,
  sprite: Sprite,
  water: TileGeom[],
): void {
  if (water.length === 0) return;
  ctx.save();
  ctx.beginPath();
  for (const w of water) {
    ctx.moveTo(w.corners[0][0], w.corners[0][1]);
    for (let k = 1; k < 4; k++) ctx.lineTo(w.corners[k][0], w.corners[k][1]);
    ctx.closePath();
  }
  ctx.clip();
  ctx.translate(geom.cx, geom.cy);
  ctx.scale(1, -1);
  // faded well down: the water's own colour has to win, and a tile that
  // fronts two lots must not add up to a solid building
  blit(ctx, sprite, 0, 0, 0.2);
  ctx.restore();
}
