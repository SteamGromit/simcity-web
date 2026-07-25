import { defaultOrdinances, ensureCoreContent } from './content';
import { idOfSlot, slotOf } from '../content/registry';
import { sizeOfSlot } from './footprint';
import { blankTile } from './grid';
import { emptyHistory, HISTORY_KEYS } from './history';
import { clampRoadClass } from './roads';
import { INDUSTRY_KINDS } from './tiers';
import { defaultWeather, WEATHER_KINDS, WeatherKind } from './weather';
import {
  CityState,
  defaultDisasters,
  defaultWaste,
  FIRE_BURN_TICKS,
  GRID,
  MAX_ELEV,
  HISTORY_MAX,
  MAX_STAGE_BY_DENSITY,
  ACCIDENT_MAX,
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

/** The highest slot core content pins, read off the enum so it never goes
 * stale. Anything above it is a mod slot and must come through the legend. */
const LAST_CORE_SLOT = Math.max(
  ...Object.values(Zone).filter((v): v is number => typeof v === 'number'),
);

/** Slot → id for every slot the city actually uses. */
function legendFor(city: CityState): Record<number, string> {
  const out: Record<number, string> = {};
  for (const t of city.tiles) {
    if (t.zone === Zone.None || out[t.zone] !== undefined) continue;
    const id = idOfSlot(t.zone);
    if (id) out[t.zone] = id;
  }
  return out;
}

/**
 * Fields a tile never needs to carry: render-only timers, and coverage that
 * the next field pass recomputes from scratch anyway (reviveTile has always
 * ignored transitShare, so writing it was pure weight).
 */
const UNSAVED_TILE_FIELDS = new Set<string>(['crimeFlash', 'collapseFlash', 'transitShare']);

/**
 * A tile, minus everything that is already the default.
 *
 * A 96×96 map is 9,216 tiles and the overwhelming majority of them are empty
 * grass with nothing to say — yet spelled out in full each one cost about 390
 * bytes, putting a single city at 3.5 MB and making two of them impossible to
 * keep in a 5 MB localStorage. Since reviveTile builds every tile from
 * blankTile() and only overwrites what the save mentions, a field equal to its
 * default is pure noise: dropping it round-trips to exactly the same tile.
 */
function thinTile(t: Tile, blank: Tile): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(t) as (keyof Tile)[]) {
    if (UNSAVED_TILE_FIELDS.has(key)) continue;
    const v = t[key];
    if (v === blank[key]) continue;
    // JSON can't hold Infinity; commute uses −1 on the wire. (An unreachable
    // commute *is* the default, so this only fires on a finite one.)
    out[key] = key === 'commute' && v === Infinity ? -1 : v;
  }
  return out;
}

/** Every save carries a zoneIds legend (slot → content id) so it survives
 * being opened with a different set of packs loaded. */
export function serialize(city: CityState): string {
  const blank = blankTile();
  const withLegend = {
    ...city,
    tiles: city.tiles.map((t) => thinTile(t, blank)),
    zoneIds: legendFor(city),
  };
  return JSON.stringify(withLegend);
}

function finite(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Old slot → this session's slot. Null when the save has no legend
 * (legacy save), so revival applies no remapping at all. */
function slotRemap(raw: unknown): Map<number, number> | null {
  if (!raw || typeof raw !== 'object') return null;
  const out = new Map<number, number>();
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const from = Number(k);
    if (!Number.isInteger(from) || typeof v !== 'string') continue;
    // Zone.None (0) is never a legend entry — legendFor never emits one — so
    // a foreign/corrupt save that claims one is ignored, not honored; blank
    // tiles must stay blank regardless of what a 0 key claims.
    if (from === Zone.None) continue;
    const to = slotOf(v);
    // an id this session does not know maps to None, clearing the tile
    out.set(from, to ?? Zone.None);
  }
  return out;
}

/** Rebuild a tile from untrusted data; anything malformed falls back to blank. */
function reviveTile(raw: unknown, remap: Map<number, number> | null): Tile {
  const t = blankTile();
  if (!raw || typeof raw !== 'object') return t;
  const r = raw as Record<string, unknown>;
  if (typeof r.zone === 'number') {
    // The legend, when present, is authoritative for slots it mentions —
    // slotRemap already resolved each id through the live registry, so a
    // mapped value (including a mod slot far above the core range, or
    // Zone.None for an id nobody registers anymore) is trusted as-is. A slot
    // the legend doesn't mention (or a legacy save with no legend at all)
    // falls back to a plain range check against the core enum. That bound is
    // derived from Zone itself rather than named, because naming it meant
    // remembering to move it every time a zone was appended — and forgetting
    // dropped those tiles silently.
    const mapped = remap?.get(r.zone);
    if (mapped !== undefined) {
      t.zone = mapped;
    } else if (r.zone >= Zone.None && r.zone <= LAST_CORE_SLOT) {
      t.zone = r.zone;
    }
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
  // a class or median claimed off a road tile would be invisible state; the
  // ladder only exists on asphalt, and pre-v0.54 saves have neither field
  t.road = t.zone === Zone.Road ? clampRoadClass(r.road) : 0;
  t.median = t.zone === Zone.Road && r.median === true;
  // a block membership is only meaningful on an occupied tile, and only
  // within the grid; reconcileBlocks then checks it against the anchor
  if (
    t.zone !== Zone.None &&
    typeof r.anchor === 'number' &&
    Number.isInteger(r.anchor) &&
    r.anchor >= 0 &&
    r.anchor < GRID * GRID
  ) {
    t.anchor = r.anchor;
  }
  t.wire = r.wire === true;
  t.pipe = r.pipe === true;
  t.fireCov = finite(r.fireCov, 0);
  t.policeCov = finite(r.policeCov, 0);
  t.schoolCov = finite(r.schoolCov, 0);
  t.healthCov = finite(r.healthCov, 0);
  t.busCov = finite(r.busCov, 0);
  t.garbageCov = finite(r.garbageCov, 0);
  t.garbage = clamp(finite(r.garbage, 0), 0, 1);
  t.crime = clamp(finite(r.crime, 0), 0, 1);
  t.accident = Math.min(ACCIDENT_MAX, Math.max(0, Math.floor(finite(r.accident, 0))));
  t.age = Math.max(0, Math.floor(finite(r.age, 0)));
  t.burning = Math.min(FIRE_BURN_TICKS, Math.max(0, Math.floor(finite(r.burning, 0))));
  t.rubble = Math.min(RUBBLE_MONTHS, Math.max(0, Math.floor(finite(r.rubble, 0))));
  t.pollution = finite(r.pollution, 0);
  t.landValue = finite(r.landValue, 0.3);
  t.commute = r.commute === -1 ? Infinity : finite(r.commute, Infinity);
  t.traffic = finite(r.traffic, 0);
  return t;
}

function reviveWaste(raw: unknown): CityState['waste'] {
  const out = defaultWaste();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  for (const k of Object.keys(out) as (keyof typeof out)[]) {
    out[k] = Math.max(0, finite(r[k], 0));
  }
  return out;
}

function reviveOrdinances(raw: unknown): CityState['ordinances'] {
  const out = defaultOrdinances();
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (k in out) out[k] = v === true;
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

/** Grid size of pre-v0.29 saves; they embed centered on today's grid. */
const LEGACY_GRID = 64;
const LEGACY_OFFSET = (GRID - LEGACY_GRID) / 2;

/** Mutate parsed legacy-save JSON in place: recenter tiles + tornado. */
function migrateLegacy(data: { tiles: unknown[]; disasters?: unknown }): void {
  const big: unknown[] = Array.from({ length: GRID * GRID }, () => ({}));
  for (let y = 0; y < LEGACY_GRID; y++) {
    for (let x = 0; x < LEGACY_GRID; x++) {
      big[(y + LEGACY_OFFSET) * GRID + (x + LEGACY_OFFSET)] =
        data.tiles[y * LEGACY_GRID + x];
    }
  }
  data.tiles = big;
  const d = data.disasters as { tornado?: { x?: unknown; y?: unknown } } | undefined;
  if (d?.tornado && typeof d.tornado === 'object') {
    const t = d.tornado as { x?: unknown; y?: unknown };
    if (typeof t.x === 'number') t.x += LEGACY_OFFSET;
    if (typeof t.y === 'number') t.y += LEGACY_OFFSET;
  }
}

/**
 * Make every multi-tile block agree with itself.
 *
 * A block is only ever written as a whole, but a save is untrusted input and a
 * crafted or truncated one can claim a body tile whose anchor is missing, the
 * wrong slot, or another body tile. Rather than trying to repair the block —
 * which would mean inventing ground the player never paid for — a tile whose
 * claim doesn't hold is cleared to bare land. The anchor's own tile is checked
 * the same way, so a half-written block leaves no half-building standing.
 */
function reconcileBlocks(tiles: Tile[]): void {
  const clear = (t: Tile) => {
    const terrain = t.terrain;
    const elevation = t.elevation;
    Object.assign(t, blankTile(), { terrain, elevation });
  };
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    if (t.anchor < 0) continue;
    const a = tiles[t.anchor];
    // the anchor must exist, be the same building, and claim itself
    if (!a || a.zone !== t.zone || a.anchor !== t.anchor) {
      clear(t);
      continue;
    }
    const size = sizeOfSlot(a.zone);
    const ax = t.anchor % GRID;
    const ay = (t.anchor / GRID) | 0;
    const x = i % GRID;
    const y = (i / GRID) | 0;
    // …and this tile must actually lie inside the block it claims
    if (x < ax || y < ay || x >= ax + size || y >= ay + size) clear(t);
  }
}

const isPair = (p: unknown): p is [number, number] =>
  Array.isArray(p) && p.length === 2 && p.every((n) => Number.isInteger(n));

/** Transit lines revive defensively: malformed entries drop, coordinates
 * must be integer pairs, and the mode must be a transit station zone. */
function reviveTransitLines(raw: unknown): CityState['transitLines'] {
  if (!Array.isArray(raw)) return [];
  const modes = new Set([
    Zone.BusStop,
    Zone.StreetcarStop,
    Zone.MonorailStation,
    Zone.SubwayStation,
    Zone.RailTerminal,
  ]);
  const out: CityState['transitLines'] = [];
  for (const l of raw) {
    if (!l || typeof l !== 'object') continue;
    const line = l as Record<string, unknown>;
    if (!modes.has(line.mode as Zone)) continue;
    if (!Array.isArray(line.path) || !line.path.every(isPair)) continue;
    if (!Array.isArray(line.stops) || !line.stops.every(isPair)) continue;
    out.push({
      id: Number.isInteger(line.id) ? (line.id as number) : out.length + 1,
      mode: line.mode as Zone,
      color: typeof line.color === 'string' ? line.color : '#3d6ea8',
      path: line.path as [number, number][],
      stops: line.stops as [number, number][],
    });
  }
  return out;
}

/**
 * Revive the monthly ledger. `pop` and `funds` are the anchor pair — they set
 * the length every other series is held to, and junk in either throws the
 * whole ledger away rather than plotting a lie. A series a save predates (or
 * one it mangled) comes back as zeros of the right length, so a v0.53 city
 * opens with its population and funds intact and flat lines behind the newer
 * charts, instead of losing its history to the new format.
 */
function reviveHistory(raw: unknown): CityState['history'] {
  const out = emptyHistory();
  if (!raw || typeof raw !== 'object') return out;
  const h = raw as Record<string, unknown>;
  const clean = (v: unknown): number[] | null => {
    if (!Array.isArray(v)) return null;
    const slice = v.slice(-HISTORY_MAX);
    return slice.every((n) => typeof n === 'number' && Number.isFinite(n))
      ? (slice as number[])
      : null;
  };
  const pop = clean(h.pop);
  const funds = clean(h.funds);
  if (!pop || !funds || pop.length !== funds.length) return out;
  const n = pop.length;
  for (const key of HISTORY_KEYS) {
    const series = clean(h[key]);
    out[key] = series && series.length === n ? series : new Array<number>(n).fill(0);
  }
  out.pop = pop;
  out.funds = funds;
  return out;
}

/**
 * Parse a save. Returns null on corrupt or foreign data; malformed tile
 * fields degrade to blank-tile defaults so a revived city can never
 * NaN-poison the simulation.
 */
export function deserialize(json: string): CityState | null {
  ensureCoreContent();
  try {
    const data = JSON.parse(json);
    if (!data || data.version !== 1) return null;
    if (!Array.isArray(data.tiles)) return null;
    if (data.tiles.length === LEGACY_GRID * LEGACY_GRID) migrateLegacy(data);
    if (data.tiles.length !== GRID * GRID) return null;
    if (![data.funds, data.tick, data.month].every((v) => Number.isFinite(v))) return null;
    const taxes = data.taxes ?? {};
    if (![taxes.r, taxes.c, taxes.i].every((v: unknown) => Number.isFinite(v))) return null;

    const demand = data.demand ?? {};
    const budget = data.lastBudget ?? {};
    const remap = slotRemap(data.zoneIds);
    const tiles = data.tiles.map((t: unknown) => reviveTile(t, remap));
    reconcileBlocks(tiles);
    return {
      version: 1,
      seed: finite(data.seed, 1),
      biome: data.biome === 'desert' ? 'desert' : 'temperate',
      tiles,
      funds: data.funds,
      tick: data.tick,
      month: data.month,
      // taxes multiply into income and demand into growth probability, so a
      // crafted save must not push them past what the game itself can set
      demand: {
        r: clamp(finite(demand.r, 0), -1, 1),
        c: clamp(finite(demand.c, 0), -1, 1),
        i: clamp(finite(demand.i, 0), -1, 1),
      },
      taxes: { r: clamp(taxes.r, 0, 0.2), c: clamp(taxes.c, 0, 0.2), i: clamp(taxes.i, 0, 0.2) },
      population: finite(data.population, 0),
      jobs: finite(data.jobs, 0),
      eduLevel: clamp(finite(data.eduLevel, 0), 0, 1),
      brownouts: Math.max(0, finite(data.brownouts, 0)),
      lastBudget: {
        rIncome: finite(budget.rIncome, 0),
        cIncome: finite(budget.cIncome, 0),
        iIncome: finite(budget.iIncome, 0),
        expenses: finite(budget.expenses, 0),
        net: finite(budget.net, 0),
      },
      // Revived rather than zeroed so the Budget panel and advisor show last
      // month's refuse figures immediately on load, as they do for the budget.
      // A save from before garbage existed reads as an empty ledger.
      waste: reviveWaste(data.waste),
      ordinances: reviveOrdinances(data.ordinances),
      disasters: reviveDisasters(data.disasters),
      weather: reviveWeather(data.weather),
      notices: Array.isArray(data.notices)
        ? data.notices.filter((n: unknown) => typeof n === 'string')
        : [],
      history: reviveHistory(data.history),
      transitLines: reviveTransitLines(data.transitLines),
    };
  } catch {
    return null;
  }
}
