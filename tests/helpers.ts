import { blankTile, idx } from '../src/sim/grid';
import { CityState, GRID, Stage, Zone } from '../src/sim/types';

export function makeCity(): CityState {
  return {
    version: 1,
    seed: 1,
    tiles: Array.from({ length: GRID * GRID }, blankTile),
    funds: 0,
    tick: 0,
    month: 0,
    demand: { r: 0, c: 0, i: 0 },
    taxes: { r: 0.09, c: 0.09, i: 0.09 },
    population: 0,
    jobs: 0,
    lastBudget: { rIncome: 0, cIncome: 0, iIncome: 0, expenses: 0, net: 0 },
    notices: [],
  };
}

export function zone(city: CityState, x: number, y: number, z: Zone, stage: Stage = 0) {
  const t = city.tiles[idx(x, y)];
  t.zone = z;
  t.stage = stage;
}

/** Lay a straight run of road tiles, inclusive of both endpoints. */
export function road(city: CityState, x0: number, y0: number, x1: number, y1: number) {
  const dx = Math.sign(x1 - x0);
  const dy = Math.sign(y1 - y0);
  let x = x0;
  let y = y0;
  zone(city, x, y, Zone.Road);
  while (x !== x1 || y !== y1) {
    x += dx;
    y += dy;
    zone(city, x, y, Zone.Road);
  }
}
