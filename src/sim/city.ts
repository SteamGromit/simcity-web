import { collectBudget } from './budget';
import { updateDemand } from './demand';
import { developTile } from './develop';
import { blankTile, idx, inBounds } from './grid';
import { updateLandValue } from './landvalue';
import { updatePollution } from './pollution';
import { updatePower } from './power';
import { updateTraffic } from './traffic';
import {
  CityState,
  COSTS,
  DEFAULT_TAX,
  GRID,
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
};

export function applyTool(
  city: CityState,
  tool: ToolId,
  x: number,
  y: number,
): { ok: boolean; err?: string } {
  if (!inBounds(x, y)) return { ok: false, err: 'out of bounds' };
  const cost = COSTS[tool];
  if (city.funds < cost) return { ok: false, err: 'not enough funds' };
  const t = city.tiles[idx(x, y)];

  if (tool === 'bulldoze') {
    if (t.zone === Zone.None) return { ok: false, err: 'nothing to bulldoze' };
    city.tiles[idx(x, y)] = blankTile();
    city.funds -= cost;
    return { ok: true };
  }

  if (t.zone !== Zone.None) return { ok: false, err: 'tile occupied' };
  t.zone = TOOL_ZONE[tool]!;
  t.stage = 0;
  t.abandoned = false;
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
    collectBudget(city);
    updateDemand(city); // demand reflects the month's new totals right away
  }
}
