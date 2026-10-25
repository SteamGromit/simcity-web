import { isBody } from './footprint';
import { idx, neighbors4 } from './grid';
import { CityState, GRID, Tile, Zone } from './types';
import { plantCapacity, isPlant } from './energy';
import { buildingBySlot } from '../content/registry';
import { MOD_SLOT_BASE } from '../content/types';

/** Roads don't carry power unless a wire is strung over them. */
function conducts(t: Tile): boolean {
  if (t.wire) return true;
  return t.zone !== Zone.None && t.zone !== Zone.Road;
}

/** Structures that draw from the plant pool. Lines, wired roads, parks,
 * and pipes conduct without consuming; so do the body tiles of a block,
 * which are the same building as their anchor and must not be billed twice.
 * Water reads the same set (minus the pumps themselves), so the two
 * utilities bill the same tiles. */
export function consumes(t: Tile, i: number): boolean {
  if (isBody(t, i)) return false;
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
    case Zone.StreetcarStop:
    case Zone.MonorailStation:
    case Zone.SubwayStation:
    case Zone.RailTerminal:
      return true;
    default: {
      // The cases above enumerate core content exhaustively, so anything left
      // at a mod slot is authored: a structure like any other, running on
      // power unless it generates it. Parks, lines and pipes are core and
      // already fell through to "conducts but doesn't consume" — the registry
      // is only consulted past MOD_SLOT_BASE so they stay that way. A slot
      // with no definition loaded (its pack is disabled) draws nothing.
      if (t.zone < MOD_SLOT_BASE) return false;
      const def = buildingBySlot(t.zone);
      return def !== undefined && def.power === undefined;
    }
  }
}

/**
 * What the plants make and what the city draws — the two numbers a neighbour
 * deal is struck against, counted exactly as `updatePower` counts them so the
 * spare capacity offered for sale is the spare capacity that exists.
 *
 * `spare` is measured *before* any contract: the region tracks what is already
 * promised separately, and subtracting it here as well would sell the same
 * megawatt twice over.
 */
export function powerSupply(city: CityState): {
  capacity: number;
  demand: number;
  spare: number;
} {
  let capacity = 0;
  let demand = 0;
  for (let i = 0; i < city.tiles.length; i++) {
    const t = city.tiles[i];
    if (isPlant(t.zone)) {
      if (!isBody(t, i)) capacity += plantCapacity(t.zone);
    } else if (consumes(t, i)) {
      demand++;
    }
  }
  return { capacity, demand, spare: Math.max(0, capacity - demand) };
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
      // a multi-tile plant generates its capacity once, from its anchor
      if (!isBody(city.tiles[i], i)) pool += plantCapacity(city.tiles[i].zone);
    }
  }
  // Power bought from a neighbour joins the pool; power sold leaves it, which
  // is what makes an export a real commitment rather than free money.
  pool += city.neighbors.power;

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
      if (consumes(city.tiles[ni], ni)) {
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
