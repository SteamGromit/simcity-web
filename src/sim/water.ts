import { idx, neighbors4, tilesWithin } from './grid';
import { CityState, GRID, PUMP_WATER_RANGE, Terrain, Tile, Zone } from './types';

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

/** Flood-fill water from every working pump; mirrors the power grid. */
export function updateWater(city: CityState): void {
  const queue: number[] = [];
  const watered = new Uint8Array(GRID * GRID);

  for (let i = 0; i < city.tiles.length; i++) {
    if (city.tiles[i].zone === Zone.WaterPump && pumpWorks(city, i)) {
      watered[i] = 1;
      queue.push(i);
    }
  }

  while (queue.length > 0) {
    const i = queue.pop()!;
    const x = i % GRID;
    const y = (i / GRID) | 0;
    for (const [nx, ny] of neighbors4(x, y)) {
      const ni = idx(nx, ny);
      if (watered[ni] || !conducts(city.tiles[ni])) continue;
      watered[ni] = 1;
      queue.push(ni);
    }
  }

  for (let i = 0; i < city.tiles.length; i++) {
    city.tiles[i].watered = watered[i] === 1;
  }
}
