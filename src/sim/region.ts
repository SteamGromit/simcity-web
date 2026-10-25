/**
 * Regions: a grid of cities that share a landscape and trade with each other.
 *
 * A city has always been an island — 96×96 tiles, its own seed, its own
 * economy, and nothing beyond the map edge. A region is the layer above:
 * several city tiles laid out in a grid, one biome between them, and two ways
 * for a city to matter to its neighbours.
 *
 * **Deals.** Only one city simulates at a time, so a deal cannot be a live
 * negotiation between two running sims. It is a standing contract held by the
 * *region* and read by whichever city happens to be loaded: the seller gives
 * up that much capacity and is paid for it, the buyer gains the capacity and
 * pays. Both sides read the same contract, so the books balance across the
 * region whichever city you are sitting in.
 *
 * **Connections.** Where two neighbours both have road reaching the same
 * places along their shared border, they are joined, and a share of each
 * one's jobs and workers counts toward the other's demand. That is what makes
 * a region more than a menu of utility contracts — a bedroom suburb grows
 * because the work is next door.
 *
 * Everything here is pure over the region document. The store persists it, the
 * UI edits it, the sim reads the reduction in `neighborStateFor`.
 */

import { idx } from './grid';
import { drivable } from './roads';
import { mulberry32 } from './city';
import { Biome, CityState, GRID, NeighborState } from './types';
import type { World } from './terrain';

export const REGION_VERSION = 1;
export const DEFAULT_COLS = 3;
export const DEFAULT_ROWS = 3;

/** Money a unit of each traded thing fetches per month.
 *
 * Both are set above what the capacity costs to own — `core:coal_plant` makes
 * 240 for §150 a month, `core:landfill` takes 900 tonnes for §40 — so that
 * importing is the convenient option and never simply the cheap one. A city
 * that builds its own still comes out ahead; a city that sells its surplus
 * turns spare capacity into revenue.
 */
export const POWER_PRICE = 0.95;
export const GARBAGE_PRICE = 0.07;
/** Per consumer tile a month: a pump's 200 tiles for §25 is §0.125 a tile,
 * so buying water lands just under owning the pump, minus the site. */
export const WATER_PRICE = 0.12;
const PRICES: Record<DealKind, number> = { power: POWER_PRICE, garbage: GARBAGE_PRICE, water: WATER_PRICE };

/** Share of a connected neighbour's economy that counts toward your demand. */
export const BORDER_SHARE = 0.35;
/** Of a neighbour's population, the part that is workforce (mirrors demand.ts). */
const WORKFORCE_FRACTION = 0.55;

export type DealKind = 'power' | 'garbage' | 'water';
export type EdgeName = 'n' | 'e' | 's' | 'w';

/** Positions along each map edge that carry drivable road. */
export interface EdgeRoads {
  n: number[];
  e: number[];
  s: number[];
  w: number[];
}

export interface RegionTile {
  col: number;
  row: number;
  name: string;
  founded: boolean;
  /** Terrain seed for this tile's city; fixed when the region is created. */
  seed: number;
  population: number;
  jobs: number;
  funds: number;
  month: number;
  /** Epoch millis of the last save, 0 when never played. */
  savedAt: number;
  /** Capacity going spare at the last save — what a deal is struck against. */
  sparePower: number;
  spareGarbage: number;
  spareWater: number;
  edges: EdgeRoads;
}

export interface Deal {
  id: string;
  kind: DealKind;
  /** Region tile indices: `seller` gives up capacity, `buyer` gains it. */
  seller: number;
  buyer: number;
  amount: number;
  /** Monthly money the buyer pays the seller. */
  price: number;
}

export interface Region {
  version: number;
  slug: string;
  name: string;
  seed: number;
  cols: number;
  rows: number;
  biome: Biome;
  tiles: RegionTile[];
  deals: Deal[];
  /** Tile index last played, so Continue knows where to go back to. */
  lastPlayed: number;
}

function emptyEdges(): EdgeRoads {
  return { n: [], e: [], s: [], w: [] };
}

export function newRegion(
  name: string,
  slug: string,
  seed: number,
  cols = DEFAULT_COLS,
  rows = DEFAULT_ROWS,
): Region {
  const rand = mulberry32(seed ^ 0x5eed17);
  // One biome for the whole region: nine maps that disagree about whether it
  // is a desert do not read as one place. Terrain still generates per tile.
  const biome: Biome = rand() < 0.25 ? 'desert' : 'temperate';
  const tiles: RegionTile[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      tiles.push({
        col,
        row,
        name: '',
        founded: false,
        seed: (Math.floor(rand() * 0xffffffff) ^ ((col * 73856093) ^ (row * 19349663))) >>> 0,
        population: 0,
        jobs: 0,
        funds: 0,
        month: 0,
        savedAt: 0,
        sparePower: 0,
        spareGarbage: 0,
        spareWater: 0,
        edges: emptyEdges(),
      });
    }
  }
  return {
    version: REGION_VERSION,
    slug,
    name,
    seed,
    cols,
    rows,
    biome,
    tiles,
    deals: [],
    lastPlayed: -1,
  };
}

/**
 * The landscape every city in the region samples. A region written before
 * terrain became a field has the same four numbers, so an old document yields
 * a world like any other; only the cities founded since read it.
 */
export function worldOf(region: Region): World {
  return { seed: region.seed, cols: region.cols, rows: region.rows, biome: region.biome };
}

export function regionIndex(region: Region, col: number, row: number): number {
  return row * region.cols + col;
}

export function tileAt(region: Region, col: number, row: number): RegionTile | null {
  if (col < 0 || row < 0 || col >= region.cols || row >= region.rows) return null;
  return region.tiles[regionIndex(region, col, row)] ?? null;
}

function tileByIndex(region: Region, i: number): RegionTile | null {
  return i >= 0 && i < region.tiles.length ? region.tiles[i] : null;
}

/**
 * Which edge of `a` faces `b`, and which edge of `b` faces back — or null when
 * they are not orthogonal neighbours. Corners do not count: two cities that
 * meet at a point share no border to run a road across.
 */
export function sharedEdge(region: Region, a: number, b: number): [EdgeName, EdgeName] | null {
  const ta = tileByIndex(region, a);
  const tb = tileByIndex(region, b);
  if (!ta || !tb) return null;
  const dx = tb.col - ta.col;
  const dy = tb.row - ta.row;
  if (Math.abs(dx) + Math.abs(dy) !== 1) return null;
  if (dx === 1) return ['e', 'w'];
  if (dx === -1) return ['w', 'e'];
  return dy === 1 ? ['s', 'n'] : ['n', 's'];
}

export function neighborsOf(region: Region, i: number): number[] {
  const t = tileByIndex(region, i);
  if (!t) return [];
  const out: number[] = [];
  for (const [dc, dr] of [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ]) {
    const n = tileAt(region, t.col + dc, t.row + dr);
    if (n) out.push(regionIndex(region, n.col, n.row));
  }
  return out;
}

/**
 * True when both cities are founded and their roads reach the shared border at
 * some of the same places. Road positions are recorded along each edge when a
 * city is saved, so this never has to load one.
 */
export function connected(region: Region, a: number, b: number): boolean {
  const edges = sharedEdge(region, a, b);
  if (!edges) return false;
  const ta = tileByIndex(region, a)!;
  const tb = tileByIndex(region, b)!;
  if (!ta.founded || !tb.founded) return false;
  const mine = ta.edges[edges[0]];
  const theirs = new Set(tb.edges[edges[1]]);
  return mine.some((p) => theirs.has(p));
}

export function dealPrice(kind: DealKind, amount: number): number {
  return Math.round(amount * PRICES[kind]);
}

function spareOf(tile: RegionTile, kind: DealKind): number {
  return kind === 'power' ? tile.sparePower : kind === 'water' ? tile.spareWater : tile.spareGarbage;
}

/** How much of `seller`'s spare capacity is already promised elsewhere. */
function committed(region: Region, seller: number, kind: DealKind, exceptId?: string): number {
  return region.deals
    .filter((d) => d.seller === seller && d.kind === kind && d.id !== exceptId)
    .reduce((sum, d) => sum + d.amount, 0);
}

/** Why this deal cannot be struck, or null when it can. */
export function canOpenDeal(
  region: Region,
  kind: DealKind,
  seller: number,
  buyer: number,
  amount: number,
): string | null {
  if (seller === buyer) return 'a city cannot trade with itself';
  if (!(amount > 0)) return 'nothing to buy';
  const ts = tileByIndex(region, seller);
  const tb = tileByIndex(region, buyer);
  if (!ts || !tb) return 'no such city';
  if (!ts.founded || !tb.founded) return 'both cities must be founded';
  if (!sharedEdge(region, seller, buyer)) return 'only a neighbour can supply you';
  if (region.deals.some((d) => d.kind === kind && d.seller === seller && d.buyer === buyer)) {
    return 'there is already a contract between these two — close it to change the amount';
  }
  const free = spareOf(ts, kind) - committed(region, seller, kind);
  if (amount > free) return `${ts.name || 'that city'} has only ${Math.max(0, free)} spare`;
  return null;
}

let dealCounter = 0;

export function openDeal(
  region: Region,
  kind: DealKind,
  seller: number,
  buyer: number,
  amount: number,
): Deal | null {
  if (canOpenDeal(region, kind, seller, buyer, amount)) return null;
  const deal: Deal = {
    id: `${kind}-${seller}-${buyer}-${++dealCounter}`,
    kind,
    seller,
    buyer,
    amount,
    price: dealPrice(kind, amount),
  };
  region.deals.push(deal);
  return deal;
}

export function closeDeal(region: Region, id: string): void {
  region.deals = region.deals.filter((d) => d.id !== id);
}

/**
 * Drop the contracts the region can no longer honour and return them, so the
 * caller can say so. A seller whose plant burned down between visits stops
 * exporting rather than quietly paying out forever; a city that was never
 * founded, or was abandoned, takes its contracts with it.
 *
 * Commitments are checked in order, so the oldest contract keeps its capacity
 * and the newest is the one that breaks.
 */
export function pruneDeals(region: Region): Deal[] {
  const dropped: Deal[] = [];
  const kept: Deal[] = [];
  const used = new Map<string, number>();
  for (const d of region.deals) {
    const ts = tileByIndex(region, d.seller);
    const tb = tileByIndex(region, d.buyer);
    if (!ts || !tb || !ts.founded || !tb.founded || !sharedEdge(region, d.seller, d.buyer)) {
      dropped.push(d);
      continue;
    }
    const key = `${d.seller}:${d.kind}`;
    const already = used.get(key) ?? 0;
    if (already + d.amount > spareOf(ts, d.kind)) {
      dropped.push(d);
      continue;
    }
    used.set(key, already + d.amount);
    kept.push(d);
  }
  region.deals = kept;
  return dropped;
}

/**
 * Everything the region does to one city, reduced to the block the sim reads.
 * Capacities are signed — positive when this city is importing — and `income`
 * is the net monthly money, positive when this city is being paid.
 */
export function neighborStateFor(region: Region, i: number): NeighborState {
  const state: NeighborState = {
    power: 0,
    garbage: 0,
    water: 0,
    income: 0,
    jobs: 0,
    workers: 0,
    gates: [],
  };
  if (!tileByIndex(region, i)) return state;

  for (const d of region.deals) {
    const sign = d.buyer === i ? 1 : d.seller === i ? -1 : 0;
    if (sign === 0) continue;
    if (d.kind === 'power') state.power += sign * d.amount;
    else if (d.kind === 'water') state.water += sign * d.amount;
    else state.garbage += sign * d.amount;
    // the buyer pays, so its income moves the other way from its capacity
    state.income -= sign * d.price;
  }

  for (const n of neighborsOf(region, i)) {
    if (!connected(region, i, n)) continue;
    const t = region.tiles[n];
    const jobs = Math.round(t.jobs * BORDER_SHARE);
    const workers = Math.round(t.population * WORKFORCE_FRACTION * BORDER_SHARE);
    state.jobs += jobs;
    state.workers += workers;
    // One gate per road position both sides reach; the neighbour's share is
    // split evenly across them, so a second crossing halves the load on the
    // first rather than doubling what comes through.
    const [mine, theirs] = sharedEdge(region, i, n)!;
    const theirSet = new Set(region.tiles[n].edges[theirs]);
    const positions = region.tiles[i].edges[mine].filter((p) => theirSet.has(p)).sort((a, b) => a - b);
    for (const p of positions) {
      state.gates.push({
        tile: gateTile(mine, p),
        jobs: Math.round(jobs / positions.length),
        workers: Math.round(workers / positions.length),
      });
    }
  }
  return state;
}

/** The tile index of a border position on the given edge of this city. */
function gateTile(edge: EdgeName, p: number): number {
  switch (edge) {
    case 'n':
      return idx(p, 0);
    case 's':
      return idx(p, GRID - 1);
    case 'w':
      return idx(0, p);
    default:
      return idx(GRID - 1, p);
  }
}

/** Positions along each map edge where a city's road reaches the border. */
export function edgeRoadsOf(city: CityState): EdgeRoads {
  const edges = emptyEdges();
  for (let k = 0; k < GRID; k++) {
    if (drivable(city.tiles[idx(k, 0)])) edges.n.push(k);
    if (drivable(city.tiles[idx(k, GRID - 1)])) edges.s.push(k);
    if (drivable(city.tiles[idx(0, k)])) edges.w.push(k);
    if (drivable(city.tiles[idx(GRID - 1, k)])) edges.e.push(k);
  }
  return edges;
}

/**
 * Refresh a tile's mirror of its city. Called on every save, so the region map
 * and the deal rules never have to parse a city blob to know what is there.
 */
export function recordCity(
  region: Region,
  col: number,
  row: number,
  city: CityState,
  spare: { power: number; garbage: number; water?: number } = { power: 0, garbage: 0 },
  now = 0,
): void {
  const t = tileAt(region, col, row);
  if (!t) return;
  t.founded = true;
  t.population = city.population;
  t.jobs = city.jobs;
  t.funds = Math.round(city.funds);
  t.month = city.month;
  t.savedAt = now;
  t.sparePower = Math.max(0, Math.round(spare.power));
  t.spareGarbage = Math.max(0, Math.round(spare.garbage));
  t.spareWater = Math.max(0, Math.round(spare.water ?? 0));
  t.edges = edgeRoadsOf(city);
}

export function regionPopulation(region: Region): number {
  return region.tiles.reduce((sum, t) => sum + (t.founded ? t.population : 0), 0);
}

export function foundedCount(region: Region): number {
  return region.tiles.filter((t) => t.founded).length;
}

/** A city's default name when the player does not pick one. */
export function defaultCityName(region: Region, col: number, row: number): string {
  return `${region.name} ${String.fromCharCode(65 + col)}${row + 1}`;
}
