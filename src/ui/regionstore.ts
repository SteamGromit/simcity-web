/**
 * Regions on disk.
 *
 * Same bargain as `savestore.ts`: one small index that lists what exists, one
 * key per document so listing never parses a city blob, and every write
 * failure survivable — the store is built on the way to booting the game, so
 * an exception escaping it is a black screen (see the note in savestore's
 * `migrateLegacy`, which is the bug that taught us).
 *
 *   simcity.regions                       the index
 *   simcity.region.<slug>                 the region document
 *   simcity.region.<slug>.city.<c>-<r>    one city's serialized state
 *
 * A region's cities live under the region's own prefix rather than in the
 * named-save list, so founding nine cities in a region does not bury the
 * player's standalone saves under nine entries they never named.
 */

import { deserialize, serialize } from '../sim/save';
import {
  REGION_VERSION,
  type Region,
  type RegionTile,
  newRegion,
  regionIndex,
  regionPopulation,
  foundedCount,
} from '../sim/region';
import type { CityState } from '../sim/types';
import { cleanName, slugify } from './savestore';

const INDEX_KEY = 'simcity.regions';
const REGION_PREFIX = 'simcity.region.';

export interface RegionMeta {
  slug: string;
  name: string;
  /** Epoch millis of the last write. */
  saved: number;
  cities: number;
  population: number;
}

export type RegionResult = { ok: true; meta: RegionMeta } | { ok: false; error: string };

const FULL = 'browser storage is full — delete a region or a city first';

function cityKey(slug: string, col: number, row: number): string {
  return `${REGION_PREFIX}${slug}.city.${col}-${row}`;
}

/** Bring a parsed region document back to something safe to play. */
function reviveRegion(raw: unknown): Region | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<Region>;
  if (typeof r.slug !== 'string' || typeof r.name !== 'string') return null;
  if (!Array.isArray(r.tiles) || r.tiles.length === 0) return null;
  const cols = Number(r.cols);
  const rows = Number(r.rows);
  if (!Number.isFinite(cols) || !Number.isFinite(rows)) return null;
  if (r.tiles.length !== cols * rows) return null;

  // Rebuild from a fresh region so a document written by an older version
  // gains any field added since, rather than reaching the sim half-formed.
  const base = newRegion(r.name, r.slug, Number(r.seed) || 1, cols, rows);
  base.version = REGION_VERSION;
  base.biome = r.biome === 'desert' ? 'desert' : 'temperate';
  base.lastPlayed = Number.isFinite(r.lastPlayed) ? Number(r.lastPlayed) : -1;
  base.tiles = base.tiles.map((fresh, i) => {
    const t = r.tiles![i] as Partial<RegionTile> | undefined;
    if (!t) return fresh;
    const edges = t.edges ?? {};
    const nums = (v: unknown): number[] =>
      Array.isArray(v) ? v.filter((n) => Number.isFinite(n)).map(Number) : [];
    return {
      ...fresh,
      name: typeof t.name === 'string' ? t.name : fresh.name,
      founded: t.founded === true,
      seed: Number.isFinite(t.seed) ? Number(t.seed) : fresh.seed,
      population: Math.max(0, Number(t.population) || 0),
      jobs: Math.max(0, Number(t.jobs) || 0),
      funds: Number(t.funds) || 0,
      month: Math.max(0, Number(t.month) || 0),
      savedAt: Math.max(0, Number(t.savedAt) || 0),
      sparePower: Math.max(0, Number(t.sparePower) || 0),
      spareGarbage: Math.max(0, Number(t.spareGarbage) || 0),
      spareWater: Math.max(0, Number(t.spareWater) || 0),
      edges: {
        n: nums((edges as Record<string, unknown>).n),
        e: nums((edges as Record<string, unknown>).e),
        s: nums((edges as Record<string, unknown>).s),
        w: nums((edges as Record<string, unknown>).w),
      },
    };
  });
  base.deals = Array.isArray(r.deals)
    ? r.deals.filter(
        (d): d is Region['deals'][number] =>
          !!d &&
          typeof d === 'object' &&
          typeof (d as { id?: unknown }).id === 'string' &&
          ((d as { kind?: unknown }).kind === 'power' ||
            (d as { kind?: unknown }).kind === 'garbage' ||
            (d as { kind?: unknown }).kind === 'water') &&
          Number.isFinite((d as { seller?: unknown }).seller) &&
          Number.isFinite((d as { buyer?: unknown }).buyer) &&
          Number.isFinite((d as { amount?: unknown }).amount),
      )
    : [];
  return base;
}

export function createRegionStore(storage: Storage) {
  const warnings: string[] = [];

  function readIndex(): RegionMeta[] {
    try {
      const raw = JSON.parse(storage.getItem(INDEX_KEY) ?? 'null');
      if (!Array.isArray(raw)) return [];
      return raw.filter(
        (m): m is RegionMeta =>
          !!m && typeof m === 'object' && typeof m.slug === 'string' && typeof m.name === 'string',
      );
    } catch {
      return []; // a corrupt index loses the listing, never the regions
    }
  }

  function writeIndex(list: RegionMeta[]): boolean {
    try {
      storage.setItem(INDEX_KEY, JSON.stringify(list));
      return true;
    } catch {
      return false;
    }
  }

  function metaOf(region: Region, now: number): RegionMeta {
    return {
      slug: region.slug,
      name: region.name,
      saved: now,
      cities: foundedCount(region),
      population: regionPopulation(region),
    };
  }

  function freeSlug(name: string): string {
    const taken = new Set(readIndex().map((m) => m.slug));
    const base = slugify(name);
    if (!taken.has(base)) return base;
    for (let n = 2; ; n++) {
      const candidate = `${base}-${n}`;
      if (!taken.has(candidate)) return candidate;
    }
  }

  return {
    warnings(): string[] {
      return warnings.slice();
    },

    /** Every region, newest write first. */
    list(): RegionMeta[] {
      return readIndex().sort((a, b) => b.saved - a.saved);
    },

    /** Make a region and put it down. The seed decides its whole landscape. */
    create(name: string, seed: number, now: number, cols?: number, rows?: number):
      { ok: true; region: Region; meta: RegionMeta } | { ok: false; error: string } {
      const clean = cleanName(name);
      if (!clean) return { ok: false, error: 'give the region a name' };
      const region = newRegion(clean, freeSlug(clean), seed, cols, rows);
      const res = this.saveRegion(region, now);
      if (!res.ok) return res;
      return { ok: true, region, meta: res.meta };
    },

    /** Write the region document and refresh its index entry. */
    saveRegion(region: Region, now: number): RegionResult {
      const meta = metaOf(region, now);
      try {
        storage.setItem(REGION_PREFIX + region.slug, JSON.stringify(region));
      } catch {
        return { ok: false, error: FULL };
      }
      const index = readIndex();
      const at = index.findIndex((m) => m.slug === region.slug);
      if (at >= 0) index[at] = meta;
      else index.push(meta);
      if (!writeIndex(index)) {
        // the document landed but the listing didn't; without an index entry
        // it is unreachable, so give the space back rather than strand it
        if (at < 0) storage.removeItem(REGION_PREFIX + region.slug);
        return { ok: false, error: FULL };
      }
      return { ok: true, meta };
    },

    loadRegion(slug: string): Region | null {
      let raw: string | null = null;
      try {
        raw = storage.getItem(REGION_PREFIX + slug);
      } catch {
        return null;
      }
      if (!raw) return null;
      try {
        return reviveRegion(JSON.parse(raw));
      } catch {
        return null;
      }
    },

    /** Write one city of a region. The region document is saved separately. */
    saveCity(region: Region, col: number, row: number, city: CityState): RegionResult {
      try {
        storage.setItem(cityKey(region.slug, col, row), serialize(city));
      } catch {
        return { ok: false, error: FULL };
      }
      return { ok: true, meta: metaOf(region, 0) };
    },

    loadCity(slug: string, col: number, row: number): CityState | null {
      let raw: string | null = null;
      try {
        raw = storage.getItem(cityKey(slug, col, row));
      } catch {
        return null;
      }
      return raw ? deserialize(raw) : null;
    },

    /** Raze one city back to unclaimed land, blob and metadata together. */
    removeCity(region: Region, col: number, row: number): void {
      storage.removeItem(cityKey(region.slug, col, row));
      const t = region.tiles[regionIndex(region, col, row)];
      if (t) {
        t.founded = false;
        t.name = '';
        t.population = 0;
        t.jobs = 0;
        t.funds = 0;
        t.month = 0;
        t.savedAt = 0;
        t.sparePower = 0;
        t.spareGarbage = 0;
        t.edges = { n: [], e: [], s: [], w: [] };
      }
      // contracts with a city that no longer exists cannot survive it
      region.deals = region.deals.filter(
        (d) => d.seller !== regionIndex(region, col, row) && d.buyer !== regionIndex(region, col, row),
      );
    },

    /** Delete a region and every city in it. */
    remove(slug: string): void {
      const region = this.loadRegion(slug);
      if (region) {
        for (const t of region.tiles) storage.removeItem(cityKey(slug, t.col, t.row));
      }
      storage.removeItem(REGION_PREFIX + slug);
      writeIndex(readIndex().filter((m) => m.slug !== slug));
    },

    /** The whole region as one JSON document, for saving it to a file. */
    exportRegion(slug: string): string | null {
      const region = this.loadRegion(slug);
      if (!region) return null;
      const cities: Record<string, string> = {};
      for (const t of region.tiles) {
        if (!t.founded) continue;
        const raw = storage.getItem(cityKey(slug, t.col, t.row));
        if (raw) cities[`${t.col}-${t.row}`] = raw;
      }
      return JSON.stringify({ region, cities });
    },

    /** Take a region in from a file, under a name of the player's choosing. */
    importRegion(name: string, json: string, now: number): RegionResult {
      let parsed: { region?: unknown; cities?: Record<string, string> };
      try {
        parsed = JSON.parse(json);
      } catch {
        return { ok: false, error: 'that file is not a readable region' };
      }
      const region = reviveRegion(parsed.region);
      if (!region) return { ok: false, error: 'that file is not a readable region' };
      const clean = cleanName(name) || region.name;
      region.name = clean;
      region.slug = freeSlug(clean);
      for (const [key, raw] of Object.entries(parsed.cities ?? {})) {
        const [c, r] = key.split('-').map(Number);
        if (!Number.isFinite(c) || !Number.isFinite(r)) continue;
        try {
          storage.setItem(cityKey(region.slug, c, r), raw);
        } catch {
          return { ok: false, error: FULL };
        }
      }
      return this.saveRegion(region, now);
    },
  };
}

export type RegionStore = ReturnType<typeof createRegionStore>;
