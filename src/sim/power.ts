import { idx, neighbors4 } from './grid';
import { CityState, GRID, Tile, Zone } from './types';
import { PLANT_SPECS, isPlant } from './energy';

/** Roads don't carry power unless a wire is strung over them. */
function conducts(t: Tile): boolean {
  if (t.wire) return true;
  return t.zone !== Zone.None && t.zone !== Zone.Road;
}

/** Structures that draw from the plant pool. Lines, wired roads, parks,
 * and pipes conduct without consuming. */
function consumes(t: Tile): boolean {
  switch (t.zone) {
    case Zone.Residential:
    case Zone.Commercial:
    case Zone.Industrial:
    case Zone.FireStation:
    case Zone.PoliceStation:
    case Zone.School:
    case Zone.Hospital:
    case Zone.BusStop:
    case Zone.WaterPump:
      return true;
    default:
      return false;
  }
}

/**
 * Pooled-capacity flood fill: a FIFO BFS from every plant at once hands
 * power to consumers in distance order until the city-wide pool (the sum
 * of all plant capacities — one global pool, separate grids share it)
 * runs dry. Consumers beyond the pool stay dark but still conduct, so a
 * browned-out block doesn't sever the grid behind it.
 */
export function updatePower(city: CityState): void {
  const queue: number[] = [];
  const seen = new Uint8Array(GRID * GRID);
  const powered = new Uint8Array(GRID * GRID);
  let pool = 0;

  for (let i = 0; i < city.tiles.length; i++) {
    if (isPlant(city.tiles[i].zone)) {
      seen[i] = 1;
      powered[i] = 1;
      queue.push(i);
      pool += PLANT_SPECS[city.tiles[i].zone]!.capacity;
    }
  }

  let brownouts = 0;
  let head = 0;
  while (head < queue.length) {
    const i = queue[head++];
    const x = i % GRID;
    const y = (i / GRID) | 0;
    for (const [nx, ny] of neighbors4(x, y)) {
      const ni = idx(nx, ny);
      if (seen[ni] || !conducts(city.tiles[ni])) continue;
      seen[ni] = 1;
      queue.push(ni);
      if (consumes(city.tiles[ni])) {
        if (pool > 0) {
          pool--;
          powered[ni] = 1;
        } else {
          brownouts++;
        }
      } else {
        powered[ni] = 1;
      }
    }
  }

  for (let i = 0; i < city.tiles.length; i++) {
    city.tiles[i].powered = powered[i] === 1;
  }
  city.brownouts = brownouts;
}
