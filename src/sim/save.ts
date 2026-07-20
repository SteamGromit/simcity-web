import { blankTile } from './grid';
import { INDUSTRY_KINDS } from './tiers';
import { defaultWeather, WEATHER_KINDS, WeatherKind } from './weather';
import {
  CityState,
  defaultDisasters,
  defaultOrdinances,
  FIRE_BURN_TICKS,
  GRID,
  MAX_ELEV,
  HISTORY_MAX,
  MAX_STAGE_BY_DENSITY,
  RUBBLE_MONTHS,
  Terrain,
  Tier,
  Tile,
  Zone,
} from './types';

/**
 * Recognizes any raw value shaped like a Tier (a Wealth number or an
 * IndustryKind string). Deliberately not zone-normalized here: `tier` is
 * meaningless raw while stage === 0 (per Tile's own doc comment) and every
 * real consumer (capacityFor, taxYieldFor, pollutionScaleFor) normalizes
 * against the tile's zone at read time. Revival should round-trip the raw
 * value byte-for-byte, the same way stage and density do, not "correct" it.
 */
function isTierShape(v: unknown): v is Tier {
  return v === 1 || v === 2 || v === 3 || (typeof v === 'string' && (INDUSTRY_KINDS as readonly string[]).includes(v));
}

/** JSON can't hold Infinity; commute uses −1 on the wire. */
export function serialize(city: CityState): string {
  return JSON.stringify(city, (key, value) =>
    key === 'commute' && value === Infinity ? -1 : value,
  );
}

function finite(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** Rebuild a tile from untrusted data; anything malformed falls back to blank. */
function reviveTile(raw: unknown): Tile {
  const t = blankTile();
  if (!raw || typeof raw !== 'object') return t;
  const r = raw as Record<string, unknown>;
  if (typeof r.zone === 'number' && r.zone >= Zone.None && r.zone <= Zone.WaterPipe) {
    t.zone = r.zone;
  }
  if (r.terrain === Terrain.Water || r.terrain === Terrain.Forest) t.terrain = r.terrain;
  if (r.density === 2 || r.density === 3) t.density = r.density;
  if (typeof r.stage === 'number' && Number.isInteger(r.stage) && r.stage >= 1 && r.stage <= 7) {
    t.stage = Math.min(r.stage, MAX_STAGE_BY_DENSITY[t.density]) as Tile['stage'];
  }
  if (isTierShape(r.tier)) t.tier = r.tier;
  t.elevation = Math.min(MAX_ELEV, Math.max(0, Math.floor(finite(r.elevation, 0))));
  // structures require grass (roads may bridge water) — a crafted save
  // can't claim waterfront under a tower
  if (t.zone !== Zone.None && t.terrain !== Terrain.Grass) {
    if (!(t.zone === Zone.Road && t.terrain === Terrain.Water)) t.terrain = Terrain.Grass;
  }
  t.powered = r.powered === true;
  t.watered = r.watered === true;
  t.abandoned = r.abandoned === true;
  t.wire = r.wire === true;
  t.pipe = r.pipe === true;
  t.fireCov = finite(r.fireCov, 0);
  t.policeCov = finite(r.policeCov, 0);
  t.schoolCov = finite(r.schoolCov, 0);
  t.healthCov = finite(r.healthCov, 0);
  t.busCov = finite(r.busCov, 0);
  t.burning = Math.min(FIRE_BURN_TICKS, Math.max(0, Math.floor(finite(r.burning, 0))));
  t.rubble = Math.min(RUBBLE_MONTHS, Math.max(0, Math.floor(finite(r.rubble, 0))));
  t.pollution = finite(r.pollution, 0);
  t.landValue = finite(r.landValue, 0.3);
  t.commute = r.commute === -1 ? Infinity : finite(r.commute, Infinity);
  t.traffic = finite(r.traffic, 0);
  return t;
}

function reviveOrdinances(raw: unknown): CityState['ordinances'] {
  const out = defaultOrdinances();
  if (raw && typeof raw === 'object') {
    for (const key of Object.keys(out) as (keyof typeof out)[]) {
      if ((raw as Record<string, unknown>)[key] === true) out[key] = true;
    }
  }
  return out;
}

function reviveDisasters(raw: unknown): CityState['disasters'] {
  const out = defaultDisasters();
  if (!raw || typeof raw !== 'object') return out;
  const d = raw as Record<string, unknown>;
  const tor = d.tornado as Record<string, unknown> | null | undefined;
  if (tor && typeof tor === 'object') {
    const x = Math.floor(finite(tor.x, -1));
    const y = Math.floor(finite(tor.y, -1));
    const ticks = Math.floor(finite(tor.ticksLeft, 0));
    if (x >= 0 && x < GRID && y >= 0 && y < GRID && ticks > 0) {
      out.tornado = { x, y, ticksLeft: ticks };
    }
  }
  out.hurricaneTicks = Math.max(0, Math.floor(finite(d.hurricaneTicks, 0)));
  out.pandemicMonths = Math.max(0, Math.floor(finite(d.pandemicMonths, 0)));
  return out;
}

function reviveWeather(raw: unknown): CityState['weather'] {
  const out = defaultWeather();
  if (raw && typeof raw === 'object') {
    const k = (raw as Record<string, unknown>).kind;
    if (typeof k === 'string' && (WEATHER_KINDS as readonly string[]).includes(k)) {
      out.kind = k as WeatherKind;
    }
  }
  return out;
}

function reviveHistory(raw: unknown): CityState['history'] {
  const empty = { pop: [], funds: [] };
  if (!raw || typeof raw !== 'object') return empty;
  const h = raw as Record<string, unknown>;
  if (!Array.isArray(h.pop) || !Array.isArray(h.funds)) return empty;
  if (h.pop.length !== h.funds.length) return empty;
  const pop = h.pop.slice(-HISTORY_MAX);
  const funds = h.funds.slice(-HISTORY_MAX);
  if (![...pop, ...funds].every((v) => typeof v === 'number' && Number.isFinite(v))) {
    return empty;
  }
  return { pop: pop as number[], funds: funds as number[] };
}

/**
 * Parse a save. Returns null on corrupt or foreign data; malformed tile
 * fields degrade to blank-tile defaults so a revived city can never
 * NaN-poison the simulation.
 */
export function deserialize(json: string): CityState | null {
  try {
    const data = JSON.parse(json);
    if (!data || data.version !== 1) return null;
    if (!Array.isArray(data.tiles) || data.tiles.length !== GRID * GRID) return null;
    if (![data.funds, data.tick, data.month].every((v) => Number.isFinite(v))) return null;
    const taxes = data.taxes ?? {};
    if (![taxes.r, taxes.c, taxes.i].every((v: unknown) => Number.isFinite(v))) return null;

    const demand = data.demand ?? {};
    const budget = data.lastBudget ?? {};
    return {
      version: 1,
      seed: finite(data.seed, 1),
      biome: data.biome === 'desert' ? 'desert' : 'temperate',
      tiles: data.tiles.map(reviveTile),
      funds: data.funds,
      tick: data.tick,
      month: data.month,
      demand: { r: finite(demand.r, 0), c: finite(demand.c, 0), i: finite(demand.i, 0) },
      taxes: { r: taxes.r, c: taxes.c, i: taxes.i },
      population: finite(data.population, 0),
      jobs: finite(data.jobs, 0),
      eduLevel: finite(data.eduLevel, 0),
      lastBudget: {
        rIncome: finite(budget.rIncome, 0),
        cIncome: finite(budget.cIncome, 0),
        iIncome: finite(budget.iIncome, 0),
        expenses: finite(budget.expenses, 0),
        net: finite(budget.net, 0),
      },
      ordinances: reviveOrdinances(data.ordinances),
      disasters: reviveDisasters(data.disasters),
      weather: reviveWeather(data.weather),
      notices: Array.isArray(data.notices)
        ? data.notices.filter((n: unknown) => typeof n === 'string')
        : [],
      history: reviveHistory(data.history),
    };
  } catch {
    return null;
  }
}
