import { idx, inBounds, neighbors4 } from './grid';
import { CityState, GRID, Zone } from './types';

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

/** BFS over road tiles from roads adjacent to any developed tile of `zones`. */
function roadDistanceTo(city: CityState, zones: Zone[]): Float64Array {
  const dist = new Float64Array(GRID * GRID).fill(Infinity);
  const queue: number[] = [];
  for (let i = 0; i < city.tiles.length; i++) {
    if (city.tiles[i].zone !== Zone.Road) continue;
    const x = i % GRID;
    const y = (i / GRID) | 0;
    const seeds = neighbors4(x, y).some(
      ([nx, ny]) => developed(city, nx, ny, zones) && climbable(city, idx(nx, ny), i),
    );
    if (seeds) {
      dist[i] = 0;
      queue.push(i);
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const x = i % GRID;
    const y = (i / GRID) | 0;
    for (const [nx, ny] of neighbors4(x, y)) {
      const ni = idx(nx, ny);
      if (city.tiles[ni].zone !== Zone.Road || dist[ni] !== Infinity) continue;
      if (!climbable(city, ni, i)) continue;
      dist[ni] = dist[i] + 1;
      queue.push(ni);
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

  // Traffic: walk each developed residence's access road down the jobDist gradient.
  for (let i = 0; i < city.tiles.length; i++) {
    const t = city.tiles[i];
    if (t.zone !== Zone.Residential || t.stage === 0 || t.abandoned) continue;
    if (!Number.isFinite(t.commute) || accessIdx[i] === -1) continue;
    let cur = accessIdx[i];
    for (let step = 0; step < MAX_WALK; step++) {
      city.tiles[cur].traffic += 1;
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
  }
}
