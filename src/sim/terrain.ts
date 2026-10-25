/**
 * Terrain as a sampled field.
 *
 * The old generator grew blobs outward from random seed points, so two
 * neighbouring region tiles could not agree about the land between them:
 * there was no noise to read at an offset, only a random walk. Here the land
 * is a pure function of a *world* coordinate. A city on region tile
 * `(col, row)` fills its grid by sampling `terrainAt(world, col*GRID + x,
 * row*GRID + y)`; its neighbour samples the next column of the same field,
 * and a river simply continues.
 *
 * Four kinds of term, all deterministic in the world seed:
 *
 * - **Relief** — low-frequency fbm shaped so most land sits at 0, broad
 *   hills reach 1–2 and only the top of the distribution reaches 3. Global:
 *   it reads the same on both sides of a border.
 * - **Rivers** — bands around a sinuous centreline that runs edge to edge
 *   across the whole world, with an optional tributary that ends where it
 *   meets the main river. Relief is pulled flat near a bank so the river
 *   never climbs a hill.
 * - **Per-tile features** — one true peak and one guaranteed lake basin per
 *   city tile, placed in opposite quadrants well inside the tile, so every
 *   map has a mountain and somewhere to put a pump, and neither straddles a
 *   border where the neighbour would have to agree on it.
 * - **Cover** — noise lakes on flat ground, and forest from a third noise
 *   term that thickens beside water and thins out above elevation 3.
 *
 * Everything is per-sample, so a 96×96 city is nine thousand cheap
 * evaluations and the region map can draw the land at any resolution without
 * loading a city.
 */

import { fbm, fbmSigned, hash2 } from '../render/noise';
import { mulberry32 } from './rng';
import { Biome, GRID, MAX_ELEV, Terrain, Tile } from './types';

export interface World {
  seed: number;
  cols: number;
  rows: number;
  biome: Biome;
}

export interface Sample {
  terrain: Terrain;
  elevation: number;
}

/** The climate a seed rolls on its own: one draw, a quarter of them desert. */
export function rolledBiome(seed: number): Biome {
  return mulberry32(seed ^ 0x7e44a1)() < 0.25 ? 'desert' : 'temperate';
}

/** A city with no region around it is a world of one tile. */
export function singleWorld(seed: number, biome: Biome): World {
  return { seed, cols: 1, rows: 1, biome };
}

// --- tuning -----------------------------------------------------------------
// Calibrated by sweeping seeds 1..200 on a single tile (scratch script, not
// kept): temperate water 4–10% of the map (median 6), forest 4–16% (median
// 9); desert water 0.4–5%, forest about 1%. The guard seeds in
// tests/terrain.test.ts keep their floors.

/** Feature size of the relief noise, in tiles. */
const RELIEF_SCALE = 28;
/** Relief is pulled flat within this many tiles of a river bank. */
const BANK_FLAT = 6;
/** Peak radius; the bump is zero at this distance from the summit. */
const PEAK_RADIUS = 12;
/** Peak and basin candidates sit at these local offsets (quadrant centres). */
const QUADRANT = [24, GRID - 24];
/** River half-width wanders between 1.0 and 2.0 tiles (narrower in desert). */
const HALF_WIDTH = 1.5;
const HALF_WIDTH_WANDER = 0.5;
const DESERT_WIDTH_MULT = 0.6;
/** Forest thickens within this many tiles of water. */
const RIPARIAN = 5;
const LAKE_THRESHOLD = { temperate: 0.8, desert: 0.84 };
const LAKE_SCALE = { temperate: 22, desert: 14 };
const FOREST_THRESHOLD = { temperate: 0.7, desert: 0.82 };
const RIPARIAN_BONUS = 0.07;

// --- helpers ----------------------------------------------------------------

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** 0 at `a`, 1 at `b`, eased between. */
function smooth(a: number, b: number, v: number): number {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
}

// --- layout: what the whole world decides once ------------------------------

interface Band {
  axis: 'h' | 'v';
  base: number;
  a1: number;
  l1: number;
  p1: number;
  a2: number;
  l2: number;
  p2: number;
  /** Distinct noise lane for this band's jitter and width. */
  lane: number;
  /** Parameter interval the band exists on (a tributary stops at the confluence). */
  s0: number;
  s1: number;
}

interface Layout {
  bands: Band[];
  widthMult: number;
}

const layouts = new Map<string, Layout>();

function worldKey(world: World): string {
  return `${world.seed}:${world.cols}:${world.rows}:${world.biome}`;
}

function centreOf(b: Band, s: number, seed: number): number {
  return (
    b.base +
    b.a1 * Math.sin(s / b.l1 + b.p1) +
    b.a2 * Math.sin(s / b.l2 + b.p2) +
    1.5 * fbmSigned(s / 7, b.lane, seed + 13, 2)
  );
}

function halfWidthOf(b: Band, s: number, seed: number, mult: number): number {
  return (HALF_WIDTH + HALF_WIDTH_WANDER * fbmSigned(s / 9, b.lane + 50, seed + 7, 2)) * mult;
}

/** Signed distance to the band's water: negative inside, Infinity off its interval. */
function bandDist(b: Band, wx: number, wy: number, seed: number, mult: number): number {
  const s = b.axis === 'h' ? wx : wy;
  if (s < b.s0 || s > b.s1) return Infinity;
  const c = b.axis === 'h' ? wy : wx;
  return Math.abs(c - centreOf(b, s, seed)) - halfWidthOf(b, s, seed, mult);
}

function layoutOf(world: World): Layout {
  const key = worldKey(world);
  const hit = layouts.get(key);
  if (hit) return hit;
  if (layouts.size > 32) layouts.clear();

  const rand = mulberry32(world.seed ^ 0x7e44a1);
  rand(); // the biome roll — drawn whether or not the biome was forced
  const W = world.cols * GRID;
  const H = world.rows * GRID;
  const temperate = world.biome === 'temperate';
  const widthMult = temperate ? 1 : DESERT_WIDTH_MULT;

  const horizontal = rand() < 0.5;
  const riverRoll = rand();
  const tribRoll = rand();
  const hasRiver = temperate || riverRoll < 0.3;
  const hasTrib = temperate && tribRoll < 0.6;

  const makeBand = (axis: 'h' | 'v', lane: number): Band => {
    const across = axis === 'h' ? H : W;
    const along = axis === 'h' ? W : H;
    return {
      axis,
      base: across * (0.3 + 0.4 * rand()),
      a1: 6 + 8 * rand(),
      l1: 40 + 30 * rand(),
      p1: rand() * Math.PI * 2,
      a2: 2 + 3 * rand(),
      l2: 12 + 10 * rand(),
      p2: rand() * Math.PI * 2,
      lane,
      s0: 0,
      s1: along,
    };
  };

  const bands: Band[] = [];
  if (hasRiver) {
    const main = makeBand(horizontal ? 'h' : 'v', 0);
    bands.push(main);
    if (hasTrib) {
      const trib = makeBand(horizontal ? 'v' : 'h', 1);
      const fromStart = rand() < 0.5;
      // Walk the tributary from its edge until it enters the main river and
      // stop there, so the band ends under the main's water: a confluence.
      const len = trib.s1;
      let stop = fromStart ? len : 0;
      for (let k = 0; k <= len; k++) {
        const s = fromStart ? k : len - k;
        const c = centreOf(trib, s, world.seed);
        const wx = trib.axis === 'h' ? s : c;
        const wy = trib.axis === 'h' ? c : s;
        if (bandDist(main, wx, wy, world.seed, widthMult) < 0) {
          stop = s;
          break;
        }
      }
      if (fromStart) trib.s1 = stop + 2;
      else trib.s0 = stop - 2;
      bands.push(trib);
    }
  }

  const layout = { bands, widthMult };
  layouts.set(key, layout);
  return layout;
}

// --- per-tile features: a peak and a basin --------------------------------

interface Features {
  px: number;
  py: number;
  bx: number;
  by: number;
  rb: number;
}

const features = new Map<string, Features>();

function featuresOf(world: World, col: number, row: number, layout: Layout): Features {
  const key = `${worldKey(world)}@${col},${row}`;
  const hit = features.get(key);
  if (hit) return hit;
  if (features.size > 256) features.clear();

  const seed = world.seed;
  const ox = col * GRID;
  const oy = row * GRID;
  // Four candidates, one per quadrant, each jittered a little. The peak goes
  // where the river is farthest; the basin takes the opposite quadrant.
  const cands: [number, number][] = [];
  for (let q = 0; q < 4; q++) {
    const jx = hash2(col * 4 + q, row, seed + 21) * 12 - 6;
    const jy = hash2(row * 4 + q, col, seed + 22) * 12 - 6;
    cands.push([ox + QUADRANT[q & 1] + jx, oy + QUADRANT[q >> 1] + jy]);
  }
  let peak = Math.floor(hash2(col, row, seed + 23) * 4);
  if (layout.bands.length > 0) {
    let best = -Infinity;
    for (let q = 0; q < 4; q++) {
      let d = Infinity;
      for (const b of layout.bands) {
        d = Math.min(d, bandDist(b, cands[q][0], cands[q][1], seed, layout.widthMult));
      }
      if (d > best) {
        best = d;
        peak = q;
      }
    }
  }
  const basin = 3 - peak;
  const temperate = world.biome === 'temperate';
  const rb = temperate
    ? 5.5 + 2 * hash2(col + 9, row, seed + 24)
    : 3 + 1.5 * hash2(col + 9, row, seed + 24);
  const f: Features = {
    px: cands[peak][0],
    py: cands[peak][1],
    bx: cands[basin][0],
    by: cands[basin][1],
    rb,
  };
  features.set(key, f);
  return f;
}

// --- the field ---------------------------------------------------------------

export function terrainAt(world: World, wx: number, wy: number): Sample {
  const seed = world.seed;
  const layout = layoutOf(world);
  const col = Math.floor(wx / GRID);
  const row = Math.floor(wy / GRID);
  const f = featuresOf(world, col, row, layout);

  // rivers
  let riverDist = Infinity;
  for (const b of layout.bands) {
    riverDist = Math.min(riverDist, bandDist(b, wx, wy, seed, layout.widthMult));
  }
  const inRiver = riverDist < 0;
  if (riverDist < 0) riverDist = 0;

  // the guaranteed basin, with a noisy rim
  const bd = Math.hypot(wx - f.bx, wy - f.by);
  const rim = f.rb * (1 + 0.35 * fbmSigned(wx / 6, wy / 6, seed + 11, 2));
  const inBasin = bd < rim;

  // relief, flattened beside banks and around the basin
  const r = fbm(wx / RELIEF_SCALE, wy / RELIEF_SCALE, seed + 1, 4);
  let s = Math.pow(Math.max(0, (r - 0.42) / 0.58), 1.6) * 3.4;
  s *= smooth(0, BANK_FLAT, riverDist);
  s *= smooth(f.rb + 1, f.rb + 6, bd);
  const relief = Math.min(3, Math.floor(s + 0.5));

  // the peak: a radial bump to the snowcap, kept off the river's banks
  const pd = Math.hypot(wx - f.px, wy - f.py);
  const bump = MAX_ELEV * (1 - smooth(0, PEAK_RADIUS, pd)) * smooth(0, BANK_FLAT, riverDist);

  // noise lakes on flat ground, never on the mountain's slopes
  const lakeN = fbm(wx / LAKE_SCALE[world.biome], wy / LAKE_SCALE[world.biome], seed + 5, 3);
  const inLake =
    relief === 0 && pd > PEAK_RADIUS + 2 && lakeN > LAKE_THRESHOLD[world.biome];

  if (inRiver || inBasin || inLake) return { terrain: Terrain.Water, elevation: 0 };

  const elevation = Math.min(MAX_ELEV, Math.max(relief, Math.round(bump)));

  // forest: thicker beside water, none above the tree line
  const fN = fbm(wx / 11, wy / 11, seed + 9, 3);
  let thr = FOREST_THRESHOLD[world.biome];
  if (riverDist <= RIPARIAN || bd <= rim + RIPARIAN) thr -= RIPARIAN_BONUS;
  const terrain = elevation <= 3 && fN > thr ? Terrain.Forest : Terrain.Grass;
  return { terrain, elevation };
}

/** Fill a city's tiles from the field. Touches `terrain` and `elevation` only. */
export function fillTerrain(tiles: Tile[], world: World, col: number, row: number): void {
  const ox = col * GRID;
  const oy = row * GRID;
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const s = terrainAt(world, ox + x, oy + y);
      const t = tiles[y * GRID + x];
      t.terrain = s.terrain;
      t.elevation = s.elevation;
    }
  }
}
