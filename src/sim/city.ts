import { collectBudget } from './budget';
import { updateDemand } from './demand';
import { developTile } from './develop';
import { blankTile, idx, inBounds, neighbors4 } from './grid';
import { updateLandValue } from './landvalue';
import { updatePollution } from './pollution';
import { updatePower } from './power';
import { fireRisk, updateCoverage, updateFires } from './services';
import { updateTraffic } from './traffic';
import {
  CityState,
  COSTS,
  DEFAULT_TAX,
  Density,
  DENSITY_COST_MULT,
  GRID,
  HISTORY_MAX,
  START_FUNDS,
  Terrain,
  TICKS_PER_MONTH,
  ToolId,
  Zone,
} from './types';

const DEV_SLICE = 512; // tiles given a development roll per tick
const FIELD_INTERVAL = 4; // ticks between field recomputes

/** Grow an organic blob of `terrain` from a random start; deterministic. */
function growBlob(
  tiles: CityState['tiles'],
  rand: () => number,
  terrain: Terrain,
  size: number,
): void {
  const frontier: [number, number][] = [
    [4 + Math.floor(rand() * (GRID - 8)), 4 + Math.floor(rand() * (GRID - 8))],
  ];
  let placed = 0;
  let guard = size * 20;
  while (placed < size && frontier.length > 0 && guard-- > 0) {
    const k = Math.floor(rand() * frontier.length);
    const [x, y] = frontier.splice(k, 1)[0];
    if (!inBounds(x, y)) continue;
    const t = tiles[idx(x, y)];
    if (t.terrain !== Terrain.Grass) continue;
    t.terrain = terrain;
    placed++;
    for (const [nx, ny] of neighbors4(x, y)) {
      if (rand() < 0.75) frontier.push([nx, ny]);
    }
  }
}

function generateTerrain(tiles: CityState['tiles'], seed: number): void {
  const rand = mulberry32(seed ^ 0x7e44a1);
  growBlob(tiles, rand, Terrain.Water, 70 + Math.floor(rand() * 90));
  if (rand() < 0.5) growBlob(tiles, rand, Terrain.Water, 40 + Math.floor(rand() * 50));
  const forests = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < forests; i++) {
    growBlob(tiles, rand, Terrain.Forest, 15 + Math.floor(rand() * 35));
  }
}

export function newCity(seed: number): CityState {
  const tiles = Array.from({ length: GRID * GRID }, blankTile);
  generateTerrain(tiles, seed);
  return {
    version: 1,
    seed,
    tiles,
    funds: START_FUNDS,
    tick: 0,
    month: 0,
    demand: { r: 0, c: 0, i: 0 },
    taxes: { r: DEFAULT_TAX, c: DEFAULT_TAX, i: DEFAULT_TAX },
    population: 0,
    jobs: 0,
    lastBudget: { rIncome: 0, cIncome: 0, iIncome: 0, expenses: 0, net: 0 },
    notices: [],
    history: { pop: [], funds: [] },
  };
}

/** Deterministic 32-bit RNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TOOL_ZONE: Partial<Record<ToolId, Zone>> = {
  road: Zone.Road,
  zoneR: Zone.Residential,
  zoneC: Zone.Commercial,
  zoneI: Zone.Industrial,
  plant: Zone.PowerPlant,
  line: Zone.PowerLine,
  park: Zone.Park,
  fire: Zone.FireStation,
  police: Zone.PoliceStation,
  school: Zone.School,
  hospital: Zone.Hospital,
};

export const ZONE_TOOLS: ToolId[] = ['zoneR', 'zoneC', 'zoneI'];
const TERRAIN_TOOLS: ToolId[] = ['terraWater', 'terraForest', 'terraGrass'];

const TOOL_TERRAIN: Partial<Record<ToolId, Terrain>> = {
  terraWater: Terrain.Water,
  terraForest: Terrain.Forest,
  terraGrass: Terrain.Grass,
};

/**
 * God-mode window: terrain sculpting is free until anything has developed.
 * Checked against the tiles themselves, not the lagging population
 * aggregates, so the window can't be gamed between field updates.
 */
function isPristine(city: CityState): boolean {
  return city.tiles.every((t) => t.stage === 0);
}

/** Zone tools cost more at higher density; everything else has a flat cost. */
export function toolCost(tool: ToolId, density: Density): number {
  const mult = ZONE_TOOLS.includes(tool) ? DENSITY_COST_MULT[density] : 1;
  return COSTS[tool] * mult;
}

function isBareTerrainDoze(tool: ToolId, t: { zone: Zone; terrain: Terrain }): boolean {
  return tool === 'bulldoze' && t.zone === Zone.None && t.terrain !== Terrain.Grass;
}

function effectiveCost(
  city: CityState,
  tool: ToolId,
  density: Density,
  t: { zone: Zone; terrain: Terrain },
): number {
  if (TERRAIN_TOOLS.includes(tool)) return isPristine(city) ? 0 : toolCost(tool, density);
  // leveling bare forest/water is terrain work, priced like the Level Land tool
  if (isBareTerrainDoze(tool, t)) return isPristine(city) ? 0 : COSTS.terraGrass;
  return toolCost(tool, density);
}

function validateTool(
  city: CityState,
  tool: ToolId,
  x: number,
  y: number,
  density: Density,
): string | null {
  if (!inBounds(x, y)) return 'out of bounds';
  const t = city.tiles[idx(x, y)];
  if (city.funds < effectiveCost(city, tool, density, t)) return 'not enough funds';
  if (tool === 'bulldoze') {
    return t.zone === Zone.None && t.terrain === Terrain.Grass ? 'nothing to bulldoze' : null;
  }
  if (TERRAIN_TOOLS.includes(tool)) {
    if (t.zone !== Zone.None) return 'tile occupied';
    return t.terrain === TOOL_TERRAIN[tool] ? 'no change' : null;
  }
  if (t.terrain !== Terrain.Grass) return 'cannot build on water or forest';
  if (tool === 'line' && t.zone === Zone.Road) return t.wire ? 'tile occupied' : null;
  return t.zone === Zone.None ? null : 'tile occupied';
}

/** Would applyTool succeed here? (Used for hover feedback.) */
export function canApply(
  city: CityState,
  tool: ToolId,
  x: number,
  y: number,
  density: Density = 1,
): boolean {
  return validateTool(city, tool, x, y, density) === null;
}

export function applyTool(
  city: CityState,
  tool: ToolId,
  x: number,
  y: number,
  density: Density = 1,
): { ok: boolean; err?: string } {
  const err = validateTool(city, tool, x, y, density);
  if (err) return { ok: false, err };

  const t = city.tiles[idx(x, y)];
  const cost = effectiveCost(city, tool, density, t);
  if (tool === 'bulldoze') {
    // razing a structure keeps the ground; dozing bare forest/water clears it
    const keepTerrain = t.zone !== Zone.None ? t.terrain : Terrain.Grass;
    city.tiles[idx(x, y)] = blankTile();
    city.tiles[idx(x, y)].terrain = keepTerrain;
  } else if (TERRAIN_TOOLS.includes(tool)) {
    t.terrain = TOOL_TERRAIN[tool]!;
  } else if (tool === 'line' && t.zone === Zone.Road) {
    t.wire = true;
  } else {
    t.zone = TOOL_ZONE[tool]!;
    t.stage = 0;
    t.abandoned = false;
    if (ZONE_TOOLS.includes(tool)) t.density = density;
  }
  city.funds -= cost;
  return { ok: true };
}

/**
 * One simulation tick. Development sweeps the grid in DEV_SLICE chunks
 * (full coverage once per month); fields refresh every FIELD_INTERVAL
 * ticks; the budget closes monthly.
 */
export function simTick(city: CityState, rand: () => number): void {
  city.tick += 1;

  if (city.tick % FIELD_INTERVAL === 0) {
    updatePower(city);
    updateCoverage(city);
    updateTraffic(city);
    updatePollution(city);
    updateLandValue(city);
    updateDemand(city);
  }

  updateFires(city, rand);

  const start = (city.tick * DEV_SLICE) % (GRID * GRID);
  for (let n = 0; n < DEV_SLICE; n++) {
    const i = (start + n) % (GRID * GRID);
    developTile(city, i % GRID, (i / GRID) | 0, rand);
  }

  if (city.tick % TICKS_PER_MONTH === 0) {
    city.month += 1;
    fireRisk(city, rand);
    collectBudget(city);
    updateDemand(city); // demand reflects the month's new totals right away
    if (city.notices.length > 8) city.notices.splice(0, city.notices.length - 8);
    city.history.pop.push(city.population);
    city.history.funds.push(city.funds);
    if (city.history.pop.length > HISTORY_MAX) {
      city.history.pop.shift();
      city.history.funds.shift();
    }
  }
}
