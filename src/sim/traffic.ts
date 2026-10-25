import { modifier } from './content';
import { idx, inBounds, neighbors4 } from './grid';
import { drivable, frontage, roadCapacityMult, type RoadClass } from './roads';
import {
  CityState,
  CONGESTION_MAX_EXTRA,
  GRID,
  ROAD_CAPACITY,
  Zone,
} from './types';

/** Vehicles and walkers manage one level per tile; ≥2 is an impassable cliff. */
function climbable(city: CityState, a: number, b: number): boolean {
  return Math.abs(city.tiles[a].elevation - city.tiles[b].elevation) <= 1;
}

const ACCESS_RADIUS = 2;
/** Road cost of the drive from a border gate to the work beyond it: a
 * residence beside a joined border reads this plus its road steps to the
 * gate, so the next town's jobs are near but never free. */
export const BORDER_TRIP = 12;
/** A developed residence tile puts one car on the road and holds 30–70
 * workers at the stages most of a city sits at, so the neighbour's workers
 * who come in through a gate are counted in cars on the same scale. */
export const WORKERS_PER_CAR = 50;
/** Commute-walk step cap — scales with the map so long routes aren't cut. */
const MAX_WALK = GRID;

/**
 * Nearest road tile a building can be addressed off, within Chebyshev distance
 * ACCESS_RADIUS, or null. Within a ring, prefers the orthogonally-closest road
 * (min Manhattan distance) so buildings front the road they sit beside.
 *
 * A motorway is not an address, however close it runs — see `frontage`.
 */
export function roadAccess(
  city: CityState,
  x: number,
  y: number,
): { rx: number; ry: number } | null {
  for (let r = 1; r <= ACCESS_RADIUS; r++) {
    let best: { rx: number; ry: number } | null = null;
    let bestManhattan = Infinity;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; // ring only
        const nx = x + dx;
        const ny = y + dy;
        // a planted median is not a front door, and neither is a motorway
        if (!inBounds(nx, ny) || !frontage(city.tiles[idx(nx, ny)])) continue;
        if (!climbable(city, idx(nx, ny), idx(x, y))) continue;
        const manhattan = Math.abs(dx) + Math.abs(dy);
        if (manhattan < bestManhattan) {
          bestManhattan = manhattan;
          best = { rx: nx, ry: ny };
        }
      }
    }
    if (best) return best;
  }
  return null;
}

/** A road tile traffic cannot use: closed by a crash, or a planted median. */
function usable(t: { zone: Zone; median: boolean; accident: number }): boolean {
  return drivable(t) && t.accident === 0;
}

function developed(city: CityState, x: number, y: number, zones: Zone[]): boolean {
  const t = city.tiles[idx(x, y)];
  return zones.includes(t.zone) && t.stage > 0 && !t.abandoned;
}

/** What one tile of this road class swallows before it starts to jam. */
export function tileCapacity(cls: RoadClass): number {
  return ROAD_CAPACITY * roadCapacityMult(cls);
}

/** Cost of driving onto a road tile: 1 plus a quadratic congestion penalty
 * fed by the previous update's traffic volumes. A wider class carries more
 * before the penalty bites, which is the whole reason to pay for one. */
function tileCost(t: { traffic: number; road: RoadClass }, snow: number): number {
  const congestion = Math.min(1, t.traffic / (tileCapacity(t.road) * 2));
  return 1 + snow + CONGESTION_MAX_EXTRA * congestion * congestion;
}

/** Binary min-heap of tile indices keyed by an external cost array. */
class Heap {
  private items: number[] = [];
  constructor(private cost: Float64Array) {}
  get size() {
    return this.items.length;
  }
  push(i: number) {
    const a = this.items;
    a.push(i);
    let k = a.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (this.cost[a[p]] <= this.cost[a[k]]) break;
      [a[p], a[k]] = [a[k], a[p]];
      k = p;
    }
  }
  pop(): number {
    const a = this.items;
    const top = a[0];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < a.length && this.cost[a[l]] < this.cost[a[m]]) m = l;
        if (r < a.length && this.cost[a[r]] < this.cost[a[m]]) m = r;
        if (m === k) break;
        [a[m], a[k]] = [a[k], a[m]];
        k = m;
      }
    }
    return top;
  }
}

/** Congestion-aware Dijkstra over road tiles, seeded at roads adjacent to
 * any developed tile of `zones`. With empty roads every tile costs 1, so
 * values equal plain BFS distances. */
function roadDistanceTo(city: CityState, zones: Zone[], gateSeeds: number[] = []): Float64Array {
  const snow = city.weather.kind === 'snow' ? 0.5 : 0; // unplowed tiles drag
  const dist = new Float64Array(GRID * GRID).fill(Infinity);
  const heap = new Heap(dist);
  for (let i = 0; i < city.tiles.length; i++) {
    if (!usable(city.tiles[i])) continue;
    const x = i % GRID;
    const y = (i / GRID) | 0;
    // A trip ends where it can turn off, which is never straight onto a
    // motorway — the same rule roadAccess applies at the other end.
    const seeds =
      frontage(city.tiles[i]) &&
      neighbors4(x, y).some(
        ([nx, ny]) => developed(city, nx, ny, zones) && climbable(city, idx(nx, ny), i),
      );
    if (seeds) {
      dist[i] = 0;
      heap.push(i);
    }
  }
  // A gate is where the border is crossed: what lies beyond it starts
  // BORDER_TRIP away. A crash on the crossing closes it like any road tile.
  for (const g of gateSeeds) {
    // a gate beside a local job is already a zone seed at 0; leave it
    if (!usable(city.tiles[g]) || dist[g] === 0) continue;
    dist[g] = BORDER_TRIP;
    heap.push(g);
  }
  const settled = new Uint8Array(GRID * GRID);
  while (heap.size > 0) {
    const i = heap.pop();
    if (settled[i]) continue;
    settled[i] = 1;
    const x = i % GRID;
    const y = (i / GRID) | 0;
    for (const [nx, ny] of neighbors4(x, y)) {
      const ni = idx(nx, ny);
      if (settled[ni] || !usable(city.tiles[ni])) continue;
      if (!climbable(city, ni, i)) continue;
      const nd = dist[i] + tileCost(city.tiles[ni], snow);
      if (nd < dist[ni]) {
        dist[ni] = nd;
        heap.push(ni);
      }
    }
  }
  return dist;
}

/**
 * Recompute commute distances and road traffic volumes.
 * R tiles measure road distance to jobs (developed C/I); C and I tiles measure
 * road distance to workers (developed R). Traffic accumulates on the shortest
 * home→job path of every developed residence.
 */
export function updateTraffic(city: CityState): void {
  const gates = city.neighbors.gates;
  const jobGates = gates.filter((g) => g.jobs > 0).map((g) => g.tile);
  const workerGates = gates.filter((g) => g.workers > 0).map((g) => g.tile);
  const jobDist = roadDistanceTo(city, [Zone.Commercial, Zone.Industrial], jobGates);
  const workerDist = roadDistanceTo(city, [Zone.Residential], workerGates);
  const localJobDist =
    jobGates.length > 0 ? roadDistanceTo(city, [Zone.Commercial, Zone.Industrial]) : jobDist;
  const accessIdx = new Int32Array(city.tiles.length).fill(-1);

  for (let i = 0; i < city.tiles.length; i++) {
    const t = city.tiles[i];
    t.traffic = 0;
    if (t.zone !== Zone.Residential && t.zone !== Zone.Commercial && t.zone !== Zone.Industrial) {
      t.commute = Infinity;
      continue;
    }
    const x = i % GRID;
    const y = (i / GRID) | 0;
    const access = roadAccess(city, x, y);
    if (!access) {
      t.commute = Infinity;
      continue;
    }
    accessIdx[i] = idx(access.rx, access.ry);
    const field = t.zone === Zone.Residential ? jobDist : workerDist;
    t.commute = field[accessIdx[i]];
  }

  // Traffic: walk each developed residence's access road down the jobDist
  // gradient, collecting the route; if both trip ends have bus coverage,
  // the bus carries part of the load and fewer cars hit the road.
  for (let i = 0; i < city.tiles.length; i++) {
    const t = city.tiles[i];
    if (t.zone !== Zone.Residential || t.stage === 0 || t.abandoned) continue;
    if (!Number.isFinite(t.commute) || accessIdx[i] === -1) continue;
    const path = descend(city, accessIdx[i], jobDist);
    const share = carShare(city, t, city.tiles[path[path.length - 1]]);
    for (const p of path) city.tiles[p].traffic += share;
  }

  // The neighbour's workers come in through the gates and drive to local
  // work: the same walk, from the gate, down the field that knows only this
  // city's jobs (a gate must not be its own destination).
  for (const g of gates) {
    if (g.workers <= 0 || !usable(city.tiles[g.tile])) continue;
    if (!Number.isFinite(localJobDist[g.tile])) continue;
    const path = descend(city, g.tile, localJobDist);
    const cars = Math.round(g.workers / WORKERS_PER_CAR);
    const share = carShare(city, city.tiles[g.tile], city.tiles[path[path.length - 1]]);
    for (const p of path) city.tiles[p].traffic += cars * share;
  }
}

/** Walk from a road tile down `field` until it reads 0 or nothing lower is
 * adjacent (a gate that is the destination reads BORDER_TRIP with no lower
 * neighbour, so the walk ends there of its own accord; a gate on the way to
 * a nearer local job is passed through like any road tile). The tiles
 * visited, in order, starting with `from`. */
function descend(city: CityState, from: number, field: Float64Array): number[] {
  let cur = from;
  const path: number[] = [];
  for (let step = 0; step < MAX_WALK; step++) {
    path.push(cur);
    if (field[cur] === 0) break;
    const cx = cur % GRID;
    const cy = (cur / GRID) | 0;
    let next = -1;
    let best = field[cur];
    for (const [nx, ny] of neighbors4(cx, cy)) {
      const ni = idx(nx, ny);
      if (usable(city.tiles[ni]) && field[ni] < best && climbable(city, ni, cur)) {
        best = field[ni];
        next = ni;
      }
    }
    if (next === -1) break;
    cur = next;
  }
  return path;
}

/** Cars one trip puts on the road: 1, or the worse-served end's transit
 * share when both ends have bus coverage (fare-free transit halves it). */
function carShare(
  city: CityState,
  from: { busCov: number; transitShare: number },
  to: { busCov: number; transitShare: number },
): number {
  if (!(from.busCov > 0 && to.busCov > 0)) return 1;
  return Math.max(from.transitShare, to.transitShare) * modifier(city, 'transit.share');
}
