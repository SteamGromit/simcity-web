import { collectBudget } from './budget';
import { updateDemand } from './demand';
import { developTile } from './develop';
import { blankTile, idx, inBounds } from './grid';
import { updateLandValue } from './landvalue';
import { updatePollution } from './pollution';
import { updatePower } from './power';
import { fireRisk, updateCoverage } from './services';
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
  TICKS_PER_MONTH,
  ToolId,
  Zone,
} from './types';

const DEV_SLICE = 512; // tiles given a development roll per tick
const FIELD_INTERVAL = 4; // ticks between field recomputes

export function newCity(seed: number): CityState {
  return {
    version: 1,
    seed,
    tiles: Array.from({ length: GRID * GRID }, blankTile),
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
};

export const ZONE_TOOLS: ToolId[] = ['zoneR', 'zoneC', 'zoneI'];

/** Zone tools cost more at higher density; everything else has a flat cost. */
export function toolCost(tool: ToolId, density: Density): number {
  const mult = ZONE_TOOLS.includes(tool) ? DENSITY_COST_MULT[density] : 1;
  return COSTS[tool] * mult;
}

function validateTool(
  city: CityState,
  tool: ToolId,
  x: number,
  y: number,
  density: Density,
): string | null {
  if (!inBounds(x, y)) return 'out of bounds';
  if (city.funds < toolCost(tool, density)) return 'not enough funds';
  const t = city.tiles[idx(x, y)];
  if (tool === 'bulldoze') return t.zone === Zone.None ? 'nothing to bulldoze' : null;
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
  if (tool === 'bulldoze') {
    city.tiles[idx(x, y)] = blankTile();
  } else if (tool === 'line' && t.zone === Zone.Road) {
    t.wire = true;
  } else {
    t.zone = TOOL_ZONE[tool]!;
    t.stage = 0;
    t.abandoned = false;
    if (ZONE_TOOLS.includes(tool)) t.density = density;
  }
  city.funds -= toolCost(tool, density);
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
