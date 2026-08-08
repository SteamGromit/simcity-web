/**
 * Named save slots.
 *
 * There used to be exactly one save — `simcity.save` — so building a second
 * city meant destroying the first. A save is now a named entry with a little
 * metadata beside it (population, funds, date, when it was written), so the
 * File menu can list what is there and the player can keep as many cities as
 * their browser storage will hold.
 *
 * Storage is deliberately one key per city (`simcity.city.<slug>`) plus one
 * small index. A city is a large blob; keeping them in separate keys means
 * listing the saves never has to parse them, and one corrupt city can't take
 * the rest of the list down with it.
 *
 * Everything here is pure over an injected Storage, so it is testable without
 * a browser — the same shape ui/modstore.ts uses.
 */

import { deserialize, serialize } from '../sim/save';
import type { CityState } from '../sim/types';

const INDEX_KEY = 'simcity.saves';
const CITY_PREFIX = 'simcity.city.';
/** The single save every version before this one wrote. */
const LEGACY_KEY = 'simcity.save';

export interface SaveMeta {
  /** Storage key suffix — stable, derived from the name at creation. */
  slug: string;
  name: string;
  /** Epoch millis of the last write. */
  saved: number;
  population: number;
  funds: number;
  /** Months since Jan 2000, for a human date without parsing the city. */
  month: number;
}

export type SaveResult = { ok: true; meta: SaveMeta } | { ok: false; error: string };

/** A filesystem-safe, collision-resistant key for a display name. */
export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base || 'city';
}

export const MAX_NAME = 40;

/** Trim and bound a player-typed name; empty input has no valid name. */
export function cleanName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME);
}

export function createSaveStore(storage: Storage) {
  function readIndex(): SaveMeta[] {
    try {
      const raw = JSON.parse(storage.getItem(INDEX_KEY) ?? 'null');
      if (!Array.isArray(raw)) return [];
      return raw.filter(
        (m): m is SaveMeta =>
          !!m &&
          typeof m === 'object' &&
          typeof m.slug === 'string' &&
          typeof m.name === 'string' &&
          typeof m.saved === 'number',
      );
    } catch {
      return []; // a corrupt index loses the listing, never the cities
    }
  }

  /** False when the write failed — a full quota, realistically. Never throws:
   * storage is the one thing here that can fail at any moment. */
  function writeIndex(list: SaveMeta[]): boolean {
    try {
      storage.setItem(INDEX_KEY, JSON.stringify(list));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Adopt the pre-v0.55 single save as a normal named city, once. Runs on
   * every construction and is a no-op after the first, so a player who
   * upgrades mid-city finds it waiting under a name rather than gone.
   *
   * Nothing in here may throw. The store is built at module scope on the way
   * to booting the game, so an exception escaping it takes the whole game
   * down before anything is drawn — which is exactly what a quota error here
   * used to do, leaving a black screen and a console message.
   */
  function migrateLegacy(): void {
    let legacy: string | null = null;
    try {
      legacy = storage.getItem(LEGACY_KEY);
    } catch {
      return; // storage unreadable (private mode, disabled) — just play
    }
    if (legacy === null) return;

    try {
      const index = readIndex();
      if (index.some((m) => m.slug === 'my-city')) {
        storage.removeItem(LEGACY_KEY); // already migrated on an earlier run
        return;
      }
      const city = deserialize(legacy);
      if (!city) {
        // unreadable: leave it where it is rather than destroying the only
        // copy — a later version may know how to read it
        warnings.push('An old save could not be read, so it was left untouched.');
        return;
      }
      // Re-serialize rather than copying the blob across. The old format is
      // roughly thirty times larger, so copying it verbatim both doubled the
      // space it took and left the migrated city stuck in the old shape.
      storage.setItem(CITY_PREFIX + 'my-city', serialize(city));
      index.push({
        slug: 'my-city',
        name: 'My City',
        saved: 0, // unknown: it predates saves carrying a timestamp
        population: city.population,
        funds: city.funds,
        month: city.month,
      });
      if (!writeIndex(index)) {
        storage.removeItem(CITY_PREFIX + 'my-city'); // don't strand a blob
        throw new Error('index write failed');
      }
      storage.removeItem(LEGACY_KEY); // only once the new copy is safely down
    } catch {
      warnings.push(
        'Your old save could not be moved into the city list — browser storage is full. ' +
          'Delete a city from File → Load, then reload.',
      );
    }
  }

  /** Anything the player should be told about once there is a feed to tell. */
  const warnings: string[] = [];

  migrateLegacy();

  /** A slug not already taken, by suffixing a counter. */
  function freeSlug(name: string, exclude?: string): string {
    const taken = new Set(readIndex().map((m) => m.slug));
    taken.delete(exclude ?? '');
    const base = slugify(name);
    if (!taken.has(base)) return base;
    for (let n = 2; ; n++) {
      const candidate = `${base}-${n}`;
      if (!taken.has(candidate)) return candidate;
    }
  }

  return {
    /** Trouble met while starting up, for the event log once it exists. */
    warnings(): string[] {
      return warnings.slice();
    },

    /** Every save, newest write first. */
    list(): SaveMeta[] {
      return readIndex().sort((a, b) => b.saved - a.saved);
    },

    has(slug: string): boolean {
      return readIndex().some((m) => m.slug === slug);
    },

    /**
     * Write a city under a name. An existing slug is overwritten in place —
     * that is what "save" means once a city has a name — and a new name gets
     * a fresh slot, which is how you keep the city you started from.
     */
    save(name: string, city: CityState, now: number, slug?: string): SaveResult {
      const clean = cleanName(name);
      if (!clean) return { ok: false, error: 'give the city a name' };
      const index = readIndex();
      const target = slug && index.some((m) => m.slug === slug) ? slug : freeSlug(clean);
      const meta: SaveMeta = {
        slug: target,
        name: clean,
        saved: now,
        population: city.population,
        funds: city.funds,
        month: city.month,
      };
      try {
        storage.setItem(CITY_PREFIX + target, serialize(city));
      } catch {
        // quota is the realistic failure here, and it must not corrupt the
        // index by recording a city that did not land
        return { ok: false, error: 'browser storage is full — delete a city first' };
      }
      const at = index.findIndex((m) => m.slug === target);
      if (at >= 0) index[at] = meta;
      else index.push(meta);
      if (!writeIndex(index)) {
        // the city landed but the listing didn't; without the index entry it
        // is unreachable, so give the space back rather than stranding it
        if (at < 0) storage.removeItem(CITY_PREFIX + target);
        return { ok: false, error: 'browser storage is full — delete a city first' };
      }
      return { ok: true, meta };
    },

    /** Read a city back, or null when it is missing or unreadable. */
    load(slug: string): CityState | null {
      const raw = storage.getItem(CITY_PREFIX + slug);
      return raw ? deserialize(raw) : null;
    },

    /** Rename in place, keeping the slug so the stored city needn't move. */
    rename(slug: string, name: string): SaveResult {
      const clean = cleanName(name);
      if (!clean) return { ok: false, error: 'give the city a name' };
      const index = readIndex();
      const at = index.findIndex((m) => m.slug === slug);
      if (at < 0) return { ok: false, error: 'no such city' };
      index[at] = { ...index[at], name: clean };
      if (!writeIndex(index)) return { ok: false, error: 'browser storage is full' };
      return { ok: true, meta: index[at] };
    },

    remove(slug: string): void {
      storage.removeItem(CITY_PREFIX + slug);
      writeIndex(readIndex().filter((m) => m.slug !== slug));
    },

    /** The raw JSON of a save, for downloading it to a file. */
    exportCity(slug: string): string | null {
      return storage.getItem(CITY_PREFIX + slug);
    },

    /** Take a city in from a file, under a name of the player's choosing. */
    importCity(name: string, json: string, now: number): SaveResult {
      const city = deserialize(json);
      if (!city) return { ok: false, error: 'that file is not a readable city' };
      return this.save(name, city, now);
    },
  };
}

export type SaveStore = ReturnType<typeof createSaveStore>;
