import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { cleanName, createSaveStore, MAX_NAME, slugify } from '../src/ui/savestore';
import { agoLabel } from '../src/ui/filemenu';
import { ensureCoreContent } from '../src/sim/content';
import { mulberry32, newCity, simTick } from '../src/sim/city';
import { serialize } from '../src/sim/save';

beforeAll(() => {
  ensureCoreContent();
});

/** A Storage stand-in — the store is written against the interface, not the DOM. */
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, v),
  } as Storage;
}

/**
 * A Storage that runs out, the way a real browser's does once it is near its
 * few-megabyte ceiling.
 */
function cappedStorage(budget: number): Storage {
  const map = new Map<string, string>();
  const used = () => [...map].reduce((n, [k, v]) => n + k.length + v.length, 0);
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => {
      const already = map.has(k) ? k.length + (map.get(k) as string).length : 0;
      if (used() - already + k.length + v.length > budget) {
        const err = new Error(`Setting the value of '${k}' exceeded the quota.`);
        err.name = 'QuotaExceededError';
        throw err;
      }
      map.set(k, v);
    },
  } as Storage;
}

let storage: Storage;
beforeEach(() => {
  storage = memoryStorage();
});

const city = () => newCity(3);

describe('slugs and names', () => {
  test('a name becomes a safe key', () => {
    expect(slugify('New Springfield')).toBe('new-springfield');
    expect(slugify('  Ålborg!! 2  ')).toBe('lborg-2');
  });

  test('a name that slugifies to nothing still gets a key', () => {
    expect(slugify('!!!')).toBe('city');
    expect(slugify('')).toBe('city');
  });

  test('names are trimmed, collapsed and bounded', () => {
    expect(cleanName('  Twin   Peaks  ')).toBe('Twin Peaks');
    expect(cleanName('   ')).toBe('');
    expect(cleanName('x'.repeat(200))).toHaveLength(MAX_NAME);
  });
});

describe('saving and loading', () => {
  test('a saved city comes back, with its metadata alongside', () => {
    const store = createSaveStore(storage);
    const c = city();
    c.funds = 1234;
    const r = store.save('Twin Peaks', c, 1000);
    expect(r.ok).toBe(true);

    const list = store.list();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Twin Peaks');
    expect(list[0].funds).toBe(1234);
    expect(store.load(list[0].slug)!.funds).toBe(1234);
  });

  test('an unnamed save is refused rather than filed under nothing', () => {
    const store = createSaveStore(storage);
    const r = store.save('   ', city(), 1000);
    expect(r.ok).toBe(false);
    expect(store.list()).toHaveLength(0);
  });

  test('two cities can be kept at once — that is the point', () => {
    const store = createSaveStore(storage);
    const a = city();
    a.funds = 10;
    const b = city();
    b.funds = 20;
    store.save('Alpha', a, 1000);
    store.save('Beta', b, 2000);

    expect(store.list()).toHaveLength(2);
    const slugs = store.list().map((m) => m.slug);
    expect(new Set(slugs).size).toBe(2);
    const byName = Object.fromEntries(store.list().map((m) => [m.name, m.slug]));
    expect(store.load(byName.Alpha)!.funds).toBe(10);
    expect(store.load(byName.Beta)!.funds).toBe(20);
  });

  test('saving to the same slug overwrites in place', () => {
    const store = createSaveStore(storage);
    const c = city();
    c.funds = 1;
    const first = store.save('Alpha', c, 1000);
    c.funds = 2;
    store.save('Alpha', c, 2000, first.ok ? first.meta.slug : undefined);
    expect(store.list()).toHaveLength(1);
    expect(store.load(first.ok ? first.meta.slug : '')!.funds).toBe(2);
  });

  test('two cities with the same name get distinct keys, not one clobbering the other', () => {
    const store = createSaveStore(storage);
    const a = city();
    a.funds = 10;
    const b = city();
    b.funds = 20;
    const first = store.save('Springfield', a, 1000);
    const second = store.save('Springfield', b, 2000);
    expect(first.ok && second.ok && first.meta.slug !== second.meta.slug).toBe(true);
    expect(store.list()).toHaveLength(2);
  });

  test('the newest write leads the list', () => {
    const store = createSaveStore(storage);
    store.save('Older', city(), 1000);
    store.save('Newer', city(), 5000);
    expect(store.list()[0].name).toBe('Newer');
  });

  test('loading something that was never saved returns nothing', () => {
    const store = createSaveStore(storage);
    expect(store.load('ghost-town')).toBeNull();
    expect(store.has('ghost-town')).toBe(false);
  });
});

describe('managing the list', () => {
  test('renaming keeps the city where it is', () => {
    const store = createSaveStore(storage);
    const c = city();
    c.funds = 77;
    const r = store.save('Old Name', c, 1000);
    const slug = r.ok ? r.meta.slug : '';
    expect(store.rename(slug, 'New Name').ok).toBe(true);
    expect(store.list()[0].name).toBe('New Name');
    expect(store.load(slug)!.funds).toBe(77);
  });

  test('renaming to nothing, or renaming a ghost, is refused', () => {
    const store = createSaveStore(storage);
    const r = store.save('Alpha', city(), 1000);
    const slug = r.ok ? r.meta.slug : '';
    expect(store.rename(slug, '  ').ok).toBe(false);
    expect(store.rename('nope', 'Beta').ok).toBe(false);
  });

  test('deleting removes the city and its listing, leaving the rest', () => {
    const store = createSaveStore(storage);
    const a = store.save('Alpha', city(), 1000);
    store.save('Beta', city(), 2000);
    const slug = a.ok ? a.meta.slug : '';
    store.remove(slug);
    expect(store.list().map((m) => m.name)).toEqual(['Beta']);
    expect(store.load(slug)).toBeNull();
  });
});

describe('import and export', () => {
  test('a city round-trips through exported JSON', () => {
    const store = createSaveStore(storage);
    const c = city();
    const rand = mulberry32(1);
    for (let i = 0; i < 16; i++) simTick(c, rand);
    const saved = store.save('Source', c, 1000);
    const json = store.exportCity(saved.ok ? saved.meta.slug : '')!;

    const fresh = createSaveStore(memoryStorage());
    const r = fresh.importCity('Copy', json, 2000);
    expect(r.ok).toBe(true);
    expect(fresh.load(r.ok ? r.meta.slug : '')).toEqual(c);
  });

  test('importing junk is refused and files nothing', () => {
    const store = createSaveStore(storage);
    expect(store.importCity('Bad', 'not json at all', 1000).ok).toBe(false);
    expect(store.importCity('Bad', '{"version":99}', 1000).ok).toBe(false);
    expect(store.list()).toHaveLength(0);
  });
});

describe('resilience', () => {
  test('a corrupt index loses the listing, never the stored cities', () => {
    const store = createSaveStore(storage);
    const r = store.save('Alpha', city(), 1000);
    const slug = r.ok ? r.meta.slug : '';
    storage.setItem('simcity.saves', '{{{not json');
    const reopened = createSaveStore(storage);
    expect(reopened.list()).toEqual([]);
    expect(reopened.load(slug)).not.toBeNull(); // the city itself is untouched
  });

  test('index entries that are not save metadata are dropped', () => {
    storage.setItem('simcity.saves', JSON.stringify([{ nonsense: true }, 5, null]));
    expect(createSaveStore(storage).list()).toEqual([]);
  });
});

describe('the single pre-v0.55 save', () => {
  test('is adopted as a named city on first open', () => {
    const c = city();
    c.funds = 4242;
    storage.setItem('simcity.save', serialize(c));

    const store = createSaveStore(storage);
    const list = store.list();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('My City');
    expect(store.load(list[0].slug)!.funds).toBe(4242);
    // and the old key is retired, so it is not adopted twice
    expect(storage.getItem('simcity.save')).toBeNull();
  });

  test('a corrupt legacy save is not filed, and not destroyed either', () => {
    storage.setItem('simcity.save', 'garbage');
    const store = createSaveStore(storage);
    expect(store.list()).toEqual([]);
    // left where it is: deleting the only copy of something we could not
    // parse is worse than leaving a key behind that a later version may read
    expect(storage.getItem('simcity.save')).toBe('garbage');
    expect(store.warnings().join(' ')).toMatch(/could not be read/i);
  });

  test('it is re-serialized, not copied — the old format is far bulkier', () => {
    const c = city();
    // a pre-v0.55 save: the same data, written the roomy way
    const bulky = JSON.stringify(JSON.parse(serialize(c)), null, 2);
    storage.setItem('simcity.save', bulky);

    const store = createSaveStore(storage);
    const stored = storage.getItem('simcity.city.my-city')!;
    expect(stored.length).toBeLessThan(bulky.length);
    expect(store.load('my-city')!.funds).toBe(c.funds);
  });

  test('migration does not run twice over an existing city of that name', () => {
    const c = city();
    storage.setItem('simcity.save', serialize(c));
    createSaveStore(storage);
    storage.setItem('simcity.save', serialize(c)); // as if it reappeared
    const store = createSaveStore(storage);
    expect(store.list().filter((m) => m.slug === 'my-city')).toHaveLength(1);
  });
});

describe('the "saved when" label', () => {
  test('reads in the units a person would use', () => {
    const now = 1_700_000_000_000; // a realistic epoch, so subtractions stay positive
    expect(agoLabel(now - 5_000, now)).toBe('just now');
    expect(agoLabel(now - 120_000, now)).toBe('2 min ago');
    expect(agoLabel(now - 3 * 3_600_000, now)).toBe('3 h ago');
    expect(agoLabel(now - 2 * 86_400_000, now)).toBe('2 d ago');
  });

  test('a write with no timestamp — a migrated city — says so vaguely', () => {
    expect(agoLabel(0, 1_700_000_000_000)).toBe('earlier');
  });
});

describe('a browser storage that has run out', () => {
  test('building the store never throws — it is on the path to booting the game', () => {
    // the real failure: an exception here escaped module scope in main.ts and
    // the player got a black screen with a console message
    const full = cappedStorage(400);
    full.setItem('simcity.save', serialize(city()).slice(0, 380));
    expect(() => createSaveStore(full)).not.toThrow();
  });

  test('a migration that will not fit leaves the old save alone and says so', () => {
    const c = city();
    const legacy = serialize(c);
    // room for the legacy save and almost nothing else
    const full = cappedStorage(legacy.length + 40);
    full.setItem('simcity.save', legacy);

    const store = createSaveStore(full);
    expect(full.getItem('simcity.save')).toBe(legacy); // not destroyed
    expect(store.warnings().join(' ')).toMatch(/storage is full/i);
  });

  test('a failed migration strands nothing behind it', () => {
    const c = city();
    const legacy = serialize(c);
    const full = cappedStorage(legacy.length + 40);
    full.setItem('simcity.save', legacy);
    createSaveStore(full);
    expect(full.getItem('simcity.city.my-city')).toBeNull();
  });

  test('the store still works afterwards, so the game is playable', () => {
    const c = city();
    const legacy = serialize(c);
    const full = cappedStorage(legacy.length + 40);
    full.setItem('simcity.save', legacy);
    const store = createSaveStore(full);
    expect(store.list()).toEqual([]);
    expect(() => store.load('anything')).not.toThrow();
  });

  test('saving reports the problem instead of throwing', () => {
    const c = city();
    const full = cappedStorage(serialize(c).length - 10);
    const store = createSaveStore(full);
    const res = store.save('Nowhere', c, 1);
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toMatch(/full/i);
  });

  test('a save that cannot be listed does not leave an unreachable blob', () => {
    const c = city();
    const body = serialize(c);
    // enough for the city, not enough for the index entry beside it
    const full = cappedStorage(body.length + 'simcity.city.nowhere'.length + 5);
    const store = createSaveStore(full);
    expect(store.save('Nowhere', c, 1).ok).toBe(false);
    expect(full.getItem('simcity.city.nowhere')).toBeNull();
    expect(store.list()).toEqual([]);
  });

  test('a rename that cannot be written reports rather than half-applying', () => {
    const c = city();
    const store = createSaveStore(storage);
    store.save('Alpha', c, 1);
    // now cap a fresh store around the existing contents
    const tight = cappedStorage(0);
    const tightStore = createSaveStore(tight);
    expect(tightStore.rename('alpha', 'Beta').ok).toBe(false);
  });
});
