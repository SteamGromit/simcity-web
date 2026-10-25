import { idx, neighbors4, tilesWithin } from './grid';
import { consumes } from './power';
import { CityState, GRID, PUMP_WATER_RANGE, Terrain, Tile, Zone } from './types';

/**
 * Consumer tiles one working pump can water. A coal plant makes 240 for
 * §150 a month; a pump makes 200 for §25, because the real cost of a pump is
 * the lakeside site. It also keeps every save on roughly its old footing: a
 * city that got by on one pump now has that pump's 200 tiles wet and the
 * rest dry, which stops them growing past stage 2 but does not shrink them.
 */
export const WATER_PER_PUMP = 200;

/** Roads don't carry water unless a main is laid under them. */
function conducts(t: Tile): boolean {
  if (t.pipe) return true;
  return t.zone !== Zone.None && t.zone !== Zone.Road;
}

/** A pump delivers only when powered and drawing from nearby open water. */
function pumpWorks(city: CityState, i: number): boolean {
  const t = city.tiles[i];
  if (!t.powered) return false;
  const x = i % GRID;
  const y = (i / GRID) | 0;
  return tilesWithin(x, y, PUMP_WATER_RANGE).some(
    ([nx, ny]) => city.tiles[idx(nx, ny)].terrain === Terrain.Water,
  );
}

/** A tile that drinks from the pool: what power bills, minus the pumps. */
function drinks(t: Tile, i: number): boolean {
  return t.zone !== Zone.WaterPump && consumes(t, i);
}

/**
 * What the pumps make and what the city draws — the two numbers a neighbour
 * deal is struck against, counted exactly as `updateWater` counts them.
 * `spare` is measured before any contract, as `powerSupply` does.
 */
export function waterSupply(city: CityState): {
  capacity: number;
  demand: number;
  spare: number;
} {
  let capacity = 0;
  let demand = 0;
  for (let i = 0; i < city.tiles.length; i++) {
    const t = city.tiles[i];
    if (t.zone === Zone.WaterPump) {
      if (pumpWorks(city, i)) capacity += WATER_PER_PUMP;
    } else if (drinks(t, i)) {
      demand++;
    }
  }
  return { capacity, demand, spare: Math.max(0, capacity - demand) };
}

/**
 * Pooled flood fill from every working pump at once, mirroring `updatePower`:
 * a FIFO BFS hands water to consumers in distance order until the city-wide
 * pool runs dry. Water bought from a neighbour joins the pool; water sold
 * leaves it. A dry consumer still conducts, so a shortage at the end of a
 * main does not sever the block behind it.
 */
export function updateWater(city: CityState): void {
  const queue: number[] = [];
  const seen = new Uint8Array(GRID * GRID);
  const watered = new Uint8Array(GRID * GRID);
  let pool = 0;

  for (let i = 0; i < city.tiles.length; i++) {
    if (city.tiles[i].zone === Zone.WaterPump && pumpWorks(city, i)) {
      seen[i] = 1;
      watered[i] = 1;
      queue.push(i);
      pool += WATER_PER_PUMP;
    }
  }
  pool += city.neighbors.water;

  let dryouts = 0;
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
      if (drinks(city.tiles[ni], ni)) {
        if (pool > 0) {
          pool--;
          watered[ni] = 1;
        } else {
          dryouts++;
        }
      } else {
        watered[ni] = 1;
      }
    }
  }

  for (let i = 0; i < city.tiles.length; i++) {
    city.tiles[i].watered = watered[i] === 1;
  }
  city.dryouts = dryouts;
}
