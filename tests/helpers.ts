import { blankTile, idx } from '../src/sim/grid';
import { emptyHistory } from '../src/sim/history';
import { defaultOrdinances, ensureCoreContent } from '../src/sim/content';
import { CityState, defaultDisasters, defaultWaste, GRID, Stage, Terrain, Tier, Zone } from '../src/sim/types';
import { defaultWeather } from '../src/sim/weather';

/** Flatten generated terrain to grass so tests can build anywhere. */
export function clearLand(city: CityState): void {
  for (const t of city.tiles) t.terrain = Terrain.Grass;
}

/**
 * A CityState built by hand rather than through newCity/deserialize — tests
 * use this to skip terrain generation. Energy/transit/services now read the
 * content registry (Task 8), so this still has to seed it, exactly as
 * newCity does, or every registry-backed lookup (isPlant, coverage radii...)
 * would see an empty registry.
 */
export function makeCity(): CityState {
  ensureCoreContent();
  return {
    version: 1,
    seed: 1,
    biome: 'temperate',
    tiles: Array.from({ length: GRID * GRID }, blankTile),
    funds: 0,
    tick: 0,
    month: 0,
    demand: { r: 0, c: 0, i: 0 },
    taxes: { r: 0.09, c: 0.09, i: 0.09 },
    population: 0,
    jobs: 0,
    brownouts: 0,
    transitLines: [],
    eduLevel: 0,
    lastBudget: { rIncome: 0, cIncome: 0, iIncome: 0, expenses: 0, net: 0 },
    waste: defaultWaste(),
    ordinances: defaultOrdinances(),
    disasters: defaultDisasters(),
    weather: defaultWeather(),
    notices: [],
    history: emptyHistory(),
  };
}

export function zone(
  city: CityState,
  x: number,
  y: number,
  z: Zone,
  stage: Stage = 0,
  tier: Tier = 2,
) {
  const t = city.tiles[idx(x, y)];
  t.zone = z;
  t.stage = stage;
  t.tier = tier;
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
