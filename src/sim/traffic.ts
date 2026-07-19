import { idx, inBounds, neighbors4 } from './grid';
import {
  BUS_TRAFFIC_SHARE,
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
const MAX_WALK = 64;

/**
 * Nearest road tile within Chebyshev distance ACCESS_RADIUS, or null.
 * Within a ring, prefers the orthogonally-closest road (min Manhattan
 * distance) so buildings front the road they sit beside.
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
        if (!inBounds(nx, ny) || city.tiles[idx(nx, ny)].zone !== Zone.Road) continue;
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

function developed(city: CityState, x: number, y: number, zones: Zone[]): boolean {
  const t = city.tiles[idx(x, y)];
  return zones.includes(t.zone) && t.stage > 0 && !t.abandoned;
}

/** Cost of driving onto a road tile: 1 plus a quadratic congestion penalty
 * fed by the previous update's traffic volumes. */
function tileCost(t: { traffic: number }, snow: number): number {
  const congestion = Math.min(1, t.traffic / (ROAD_CAPACITY * 2));
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
function roadDistanceTo(city: CityState, zones: Zone[]): Float64Array {
  const snow = city.weather.kind === 'snow' ? 0.5 : 0; // unplowed tiles drag
  const dist = new Float64Array(GRID * GRID).fill(Infinity);
  const heap = new Heap(dist);
  for (let i = 0; i < city.tiles.length; i++) {
    if (city.tiles[i].zone !== Zone.Road) continue;
    const x = i % GRID;
    const y = (i / GRID) | 0;
    const seeds = neighbors4(x, y).some(
      ([nx, ny]) => developed(city, nx, ny, zones) && climbable(city, idx(nx, ny), i),
    );
    if (seeds) {
      dist[i] = 0;
      heap.push(i);
    }
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
      if (city.tiles[ni].zone !== Zone.Road || settled[ni]) continue;
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
  const jobDist = roadDistanceTo(city, [Zone.Commercial, Zone.Industrial]);
  const workerDist = roadDistanceTo(city, [Zone.Residential]);
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
    let cur = accessIdx[i];
    const path: number[] = [];
    for (let step = 0; step < MAX_WALK; step++) {
      path.push(cur);
      if (jobDist[cur] === 0) break;
      const cx = cur % GRID;
      const cy = (cur / GRID) | 0;
      let next = -1;
      let best = jobDist[cur];
      for (const [nx, ny] of neighbors4(cx, cy)) {
        const ni = idx(nx, ny);
        if (city.tiles[ni].zone === Zone.Road && jobDist[ni] < best && climbable(city, ni, cur)) {
          best = jobDist[ni];
          next = ni;
        }
      }
      if (next === -1) break;
      cur = next;
    }
    const arrival = city.tiles[path[path.length - 1]];
    const rides = t.busCov > 0 && arrival.busCov > 0;
    const busShare = city.ordinances.freeBus ? BUS_TRAFFIC_SHARE / 2 : BUS_TRAFFIC_SHARE;
    const share = rides ? busShare : 1;
    for (const p of path) city.tiles[p].traffic += share;
  }
}
