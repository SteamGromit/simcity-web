import { idx, neighbors4 } from './grid';
import { CityState, GRID, Zone } from './types';

/** Roads don't carry power; power lines exist to bridge them. */
function conducts(zone: Zone): boolean {
  return zone !== Zone.None && zone !== Zone.Road;
}

/** Flood-fill power from every plant through 4-connected conductive tiles. */
export function updatePower(city: CityState): void {
  const queue: number[] = [];
  const powered = new Uint8Array(GRID * GRID);

  for (let i = 0; i < city.tiles.length; i++) {
    if (city.tiles[i].zone === Zone.PowerPlant) {
      powered[i] = 1;
      queue.push(i);
    }
  }

  while (queue.length > 0) {
    const i = queue.pop()!;
    const x = i % GRID;
    const y = (i / GRID) | 0;
    for (const [nx, ny] of neighbors4(x, y)) {
      const ni = idx(nx, ny);
      if (powered[ni] || !conducts(city.tiles[ni].zone)) continue;
      powered[ni] = 1;
      queue.push(ni);
    }
  }

  for (let i = 0; i < city.tiles.length; i++) {
    city.tiles[i].powered = powered[i] === 1;
  }
}
