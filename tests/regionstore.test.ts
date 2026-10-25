import { beforeEach, describe, expect, test } from 'vitest';
import { createRegionStore } from '../src/ui/regionstore';
import { openDeal, recordCity, regionIndex, tileAt } from '../src/sim/region';
import { makeCity } from './helpers';

/** A Storage stand-in that can be told to run out of room. */
function memStorage() {
  const map = new Map<string, string>();
  let full = false;
  const storage = {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (full) throw new DOMException('quota', 'QuotaExceededError');
      map.set(k, v);
    },
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  } as unknown as Storage;
  return {
    storage,
    map,
    fill(v = true) {
      full = v;
    },
  };
}

let mem: ReturnType<typeof memStorage>;
let store: ReturnType<typeof createRegionStore>;

beforeEach(() => {
  mem = memStorage();
  store = createRegionStore(mem.storage);
});

describe('creating and listing', () => {
  test('a new region is written and turns up in the list', () => {
    const res = store.create('Twin Valleys', 1, 100);
    expect(res.ok).toBe(true);
    expect(store.list().map((m) => m.name)).toEqual(['Twin Valleys']);
  });

  test('a region needs a name', () => {
    expect(store.create('   ', 1, 100).ok).toBe(false);
  });

  test('two regions with the same name get their own slots', () => {
    store.create('Riverside', 1, 100);
    store.create('Riverside', 2, 200);
    expect(new Set(store.list().map((m) => m.slug)).size).toBe(2);
  });

  test('the newest write is listed first', () => {
    store.create('Older', 1, 100);
    store.create('Newer', 2, 200);
    expect(store.list()[0].name).toBe('Newer');
  });

  test('a corrupt index loses the listing, never the regions', () => {
    const res = store.create('Twin Valleys', 1, 100);
    const slug = res.ok ? res.region.slug : '';
    mem.map.set('simcity.regions', 'not json at all');
    expect(store.list()).toEqual([]);
    expect(store.loadRegion(slug)).not.toBeNull();
  });
});

describe('round-tripping a region', () => {
  test('what goes in comes back out', () => {
    const res = store.create('Twin Valleys', 42, 100);
    if (!res.ok) throw new Error('setup failed');
    const back = store.loadRegion(res.region.slug)!;
    expect(back.name).toBe('Twin Valleys');
    expect(back.seed).toBe(42);
    expect(back.biome).toBe(res.region.biome);
    expect(back.tiles.map((t) => t.seed)).toEqual(res.region.tiles.map((t) => t.seed));
  });

  test('founded cities and their contracts survive the trip', () => {
    const res = store.create('Twin Valleys', 42, 100);
    if (!res.ok) throw new Error('setup failed');
    const region = res.region;
    const a = tileAt(region, 0, 0)!;
    const b = tileAt(region, 1, 0)!;
    a.founded = true;
    a.name = 'Alpha';
    a.sparePower = 300;
    a.edges.e = [10, 11];
    b.founded = true;
    b.name = 'Beta';
    b.edges.w = [10];
    openDeal(region, 'power', regionIndex(region, 0, 0), regionIndex(region, 1, 0), 200);
    store.saveRegion(region, 200);

    const back = store.loadRegion(region.slug)!;
    expect(back.tiles[0].name).toBe('Alpha');
    expect(back.tiles[0].edges.e).toEqual([10, 11]);
    expect(back.deals).toHaveLength(1);
    expect(back.deals[0].amount).toBe(200);
  });

  test('a water contract survives the trip, and an older tile reads no spare water', () => {
    const res = store.create('Twin Valleys', 42, 100);
    if (!res.ok) throw new Error('setup failed');
    const region = res.region;
    const a = tileAt(region, 0, 0)!;
    const b = tileAt(region, 1, 0)!;
    a.founded = true;
    a.spareWater = 400;
    b.founded = true;
    openDeal(region, 'water', regionIndex(region, 0, 0), regionIndex(region, 1, 0), 250);
    store.saveRegion(region, 200);
    const raw = JSON.parse(mem.map.get('simcity.region.' + region.slug)!);
    delete raw.tiles[1].spareWater;
    mem.map.set('simcity.region.' + region.slug, JSON.stringify(raw));

    const back = store.loadRegion(region.slug)!;
    expect(back.tiles[0].spareWater).toBe(400);
    expect(back.tiles[1].spareWater).toBe(0);
    expect(back.deals).toHaveLength(1);
    expect(back.deals[0].kind).toBe('water');
  });

  test('a document written by an older version gains the fields it lacks', () => {
    const res = store.create('Twin Valleys', 42, 100);
    if (!res.ok) throw new Error('setup failed');
    const raw = JSON.parse(mem.map.get('simcity.region.' + res.region.slug)!);
    for (const t of raw.tiles) {
      delete t.jobs;
      delete t.spareGarbage;
      delete t.edges;
    }
    delete raw.deals;
    mem.map.set('simcity.region.' + res.region.slug, JSON.stringify(raw));

    const back = store.loadRegion(res.region.slug)!;
    expect(back.tiles[0].jobs).toBe(0);
    expect(back.tiles[0].spareGarbage).toBe(0);
    expect(back.tiles[0].edges).toEqual({ n: [], e: [], s: [], w: [] });
    expect(back.deals).toEqual([]);
  });

  test('junk is not a region', () => {
    mem.map.set('simcity.region.broken', '{"nope":true}');
    expect(store.loadRegion('broken')).toBeNull();
    mem.map.set('simcity.region.broken2', 'not json');
    expect(store.loadRegion('broken2')).toBeNull();
    expect(store.loadRegion('never-existed')).toBeNull();
  });

  test('a tile count that disagrees with the grid is not trusted', () => {
    const res = store.create('Twin Valleys', 42, 100);
    if (!res.ok) throw new Error('setup failed');
    const raw = JSON.parse(mem.map.get('simcity.region.' + res.region.slug)!);
    raw.tiles = raw.tiles.slice(0, 3); // says 3×3, carries 3
    mem.map.set('simcity.region.' + res.region.slug, JSON.stringify(raw));
    expect(store.loadRegion(res.region.slug)).toBeNull();
  });
});

describe('cities within a region', () => {
  function region() {
    const res = store.create('Twin Valleys', 42, 100);
    if (!res.ok) throw new Error('setup failed');
    return res.region;
  }

  test('a city round-trips under its own tile', () => {
    const r = region();
    const city = makeCity();
    city.population = 4321;
    expect(store.saveCity(r, 1, 2, city).ok).toBe(true);
    expect(store.loadCity(r.slug, 1, 2)!.population).toBe(4321);
  });

  test('cities do not tread on each other', () => {
    const r = region();
    const a = makeCity();
    a.funds = 111;
    const b = makeCity();
    b.funds = 222;
    store.saveCity(r, 0, 0, a);
    store.saveCity(r, 1, 0, b);
    expect(store.loadCity(r.slug, 0, 0)!.funds).toBe(111);
    expect(store.loadCity(r.slug, 1, 0)!.funds).toBe(222);
  });

  test('an unclaimed tile has no city', () => {
    expect(store.loadCity(region().slug, 2, 2)).toBeNull();
  });

  test('razing a city takes its metadata and its contracts with it', () => {
    const r = region();
    const a = tileAt(r, 0, 0)!;
    a.founded = true;
    a.sparePower = 300;
    a.edges.e = [5];
    const b = tileAt(r, 1, 0)!;
    b.founded = true;
    b.edges.w = [5];
    openDeal(r, 'power', regionIndex(r, 0, 0), regionIndex(r, 1, 0), 100);
    store.saveCity(r, 0, 0, makeCity());

    store.removeCity(r, 0, 0);
    expect(a.founded).toBe(false);
    expect(a.edges.e).toEqual([]);
    expect(r.deals).toEqual([]);
    expect(store.loadCity(r.slug, 0, 0)).toBeNull();
  });

  test('deleting a region takes every city in it', () => {
    const r = region();
    tileAt(r, 0, 0)!.founded = true;
    store.saveCity(r, 0, 0, makeCity());
    store.saveRegion(r, 300);
    store.remove(r.slug);
    expect(store.list()).toEqual([]);
    expect(store.loadCity(r.slug, 0, 0)).toBeNull();
    expect(store.loadRegion(r.slug)).toBeNull();
  });
});

describe('a full browser store', () => {
  test('creating a region reports the failure rather than throwing', () => {
    mem.fill();
    const res = store.create('Twin Valleys', 1, 100);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/full/i);
  });

  test('a city that will not fit does not pretend it did', () => {
    const res = store.create('Twin Valleys', 1, 100);
    if (!res.ok) throw new Error('setup failed');
    mem.fill();
    expect(store.saveCity(res.region, 0, 0, makeCity()).ok).toBe(false);
  });

  test('a region that lands without its listing is not left stranded', () => {
    const res = store.create('Twin Valleys', 1, 100);
    if (!res.ok) throw new Error('setup failed');
    // a second, brand-new region whose index write is the one that fails
    const region2 = store.create('Riverside', 2, 200);
    expect(region2.ok).toBe(true);
    const before = mem.map.size;
    mem.map.set('simcity.regions', 'corrupt'); // index unreadable → looks empty
    expect(store.list()).toEqual([]);
    expect(mem.map.size).toBe(before); // nothing was destroyed to find that out
  });

  test('nothing here throws, whatever storage does', () => {
    mem.fill();
    expect(() => store.list()).not.toThrow();
    expect(() => store.loadRegion('anything')).not.toThrow();
    expect(() => store.remove('anything')).not.toThrow();
  });
});

describe('export and import', () => {
  test('a region round-trips through an exported file, cities and all', () => {
    const res = store.create('Twin Valleys', 42, 100);
    if (!res.ok) throw new Error('setup failed');
    const r = res.region;
    const city = makeCity();
    city.population = 999;
    recordCity(r, 0, 0, city);
    store.saveCity(r, 0, 0, city);
    store.saveRegion(r, 100);

    const json = store.exportRegion(r.slug)!;
    expect(json).toBeTruthy();

    const fresh = createRegionStore(memStorage().storage);
    const imported = fresh.importRegion('Copied Valleys', json, 500);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    const back = fresh.loadRegion(imported.meta.slug)!;
    expect(back.name).toBe('Copied Valleys');
    expect(back.tiles[0].founded).toBe(true);
    expect(fresh.loadCity(imported.meta.slug, 0, 0)!.population).toBe(999);
  });

  test('exporting something that is not there gives nothing', () => {
    expect(store.exportRegion('never-existed')).toBeNull();
  });

  test('junk is not an importable region', () => {
    expect(store.importRegion('X', 'not json', 1).ok).toBe(false);
    expect(store.importRegion('X', '{"region":{"nope":1}}', 1).ok).toBe(false);
  });

  test('an import never overwrites the region already there', () => {
    const res = store.create('Twin Valleys', 42, 100);
    if (!res.ok) throw new Error('setup failed');
    const json = store.exportRegion(res.region.slug)!;
    store.importRegion('Twin Valleys', json, 200);
    expect(store.list()).toHaveLength(2);
    expect(new Set(store.list().map((m) => m.slug)).size).toBe(2);
  });
});
