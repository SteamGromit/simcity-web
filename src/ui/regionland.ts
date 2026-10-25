/**
 * The land behind a region tile's card.
 *
 * Terrain is a field (see sim/terrain.ts), so the map can draw a tile's
 * landscape without loading its city: sample the world at a coarse step and
 * paint. Every card samples the same field, so laid edge to edge the cards
 * form one drawn country with the river running card to card. Road stubs are
 * ticked at the border from the positions the region already records, and a
 * joined border is ticked in gold across both cards.
 */

import { GRID, MAX_ELEV, Terrain } from '../sim/types';
import { terrainAt, type World } from '../sim/terrain';
import type { EdgeName, RegionTile } from '../sim/region';

/** Tiles per sample: a 96-tile city becomes a 48-pixel card. */
export const LAND_STEP = 2;

export interface Link {
  edge: EdgeName;
  /** Border positions joined to the neighbour across this edge. */
  positions: number[];
}

const LAND = {
  temperate: { water: [59, 111, 168], grass: [78, 122, 63], forest: [47, 90, 45] },
  desert: { water: [59, 111, 168], grass: [184, 164, 108], forest: [110, 122, 60] },
} as const;
const HIGHLAND = [255, 250, 230];
const SNOW = 'rgb(233, 238, 242)';
const TICK = '#8a8f96';
const LINK = '#f0c050';
const MARK = 'rgba(240, 200, 120, 0.85)';

function lift(base: readonly number[], elevation: number): string {
  const t = 0.09 * elevation;
  const c = base.map((v, k) => Math.round(v + (HIGHLAND[k] - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

export function paintLand(
  canvas: HTMLCanvasElement,
  world: World,
  tile: RegionTile,
  links: Link[],
): void {
  const n = GRID / LAND_STEP;
  canvas.width = n;
  canvas.height = n;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const palette = LAND[world.biome];
  const ox = tile.col * GRID;
  const oy = tile.row * GRID;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const s = terrainAt(world, ox + x * LAND_STEP, oy + y * LAND_STEP);
      ctx.fillStyle =
        s.terrain === Terrain.Water
          ? lift(palette.water, 0)
          : s.elevation >= MAX_ELEV
            ? SNOW
            : lift(s.terrain === Terrain.Forest ? palette.forest : palette.grass, s.elevation);
      ctx.fillRect(x, y, 1, 1);
    }
  }

  const joined = new Map<EdgeName, Set<number>>();
  for (const l of links) joined.set(l.edge, new Set(l.positions));
  for (const edge of ['n', 'e', 's', 'w'] as EdgeName[]) {
    for (const p of tile.edges[edge]) {
      const q = Math.floor(Math.min(GRID - 1, Math.max(0, p)) / LAND_STEP);
      const gold = joined.get(edge)?.has(p) ?? false;
      const len = gold ? 3 : 2;
      ctx.fillStyle = gold ? LINK : TICK;
      if (edge === 'n') ctx.fillRect(q, 0, 1, len);
      else if (edge === 's') ctx.fillRect(q, n - len, 1, len);
      else if (edge === 'w') ctx.fillRect(0, q, len, 1);
      else ctx.fillRect(n - len, q, len, 1);
    }
  }

  if (tile.founded) {
    const r = 2 + 6 * Math.min(1, tile.population / 20000);
    ctx.fillStyle = MARK;
    ctx.beginPath();
    ctx.arc(n / 2, n / 2, r, 0, Math.PI * 2);
    ctx.fill();
  }
}
