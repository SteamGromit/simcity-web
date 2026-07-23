import { beforeEach, describe, expect, test } from 'vitest';
import { createModStore, slugify, type StorageLike } from '../src/ui/modstore';
import { allOrdinances, resetRegistry } from '../src/content/registry';

/** In-memory StorageLike; the store never sees a real localStorage in Node. */
function fakeStorage(seed?: string): StorageLike {
  const m = new Map<string, string>();
  if (seed !== undefined) m.set('simcity.mods', seed);
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

const ORD = (id: string) => ({ id, label: 'Law', blurb: 'A law.', cost: 5, effects: { 'fire.ignition': 0.5 } });

beforeEach(() => resetRegistry());

describe('slugify', () => {
  test('lowercases, strips punctuation, hyphenates', () => {
    expect(slugify('My Cool Mod!')).toBe('my-cool-mod');
    expect(slugify('  spaced  out ')).toBe('spaced-out');
  });
  test('never empty', () => {
    expect(slugify('!!!')).toBe('mod');
  });
});

describe('mod store — list CRUD', () => {
  test('create adds an enabled mod with a slugged id and empty ordinances', () => {
    const store = createModStore(fakeStorage());
    const mod = store.create('Eco Pack');
    expect(mod.pack.id).toBe('eco-pack');
    expect(mod.enabled).toBe(true);
    expect(mod.pack.ordinances).toEqual([]);
    expect(store.list()).toHaveLength(1);
  });

  test('duplicate names get unique ids', () => {
    const store = createModStore(fakeStorage());
    store.create('Eco');
    store.create('Eco');
    expect(store.list().map((m) => m.pack.id)).toEqual(['eco', 'eco-2']);
  });

  test('rename changes the display name, not the id', () => {
    const store = createModStore(fakeStorage());
    const m = store.create('Eco');
    store.rename(m.pack.id, 'Green Pack');
    expect(store.list()[0].pack.name).toBe('Green Pack');
    expect(store.list()[0].pack.id).toBe('eco');
  });

  test('remove drops the mod', () => {
    const store = createModStore(fakeStorage());
    const m = store.create('Eco');
    store.remove(m.pack.id);
    expect(store.list()).toHaveLength(0);
  });

  test('onChange fires on every mutation', () => {
    const store = createModStore(fakeStorage());
    let n = 0;
    store.onChange(() => n++);
    const m = store.create('Eco');
    store.rename(m.pack.id, 'X');
    store.setEnabled(m.pack.id, false);
    store.remove(m.pack.id);
    expect(n).toBe(4);
  });
});

describe('mod store — enable/disable registers content', () => {
  test('an enabled mod seeded in storage registers its ordinance at construction', () => {
    const seed = JSON.stringify([
      { enabled: true, pack: { id: 'eco', name: 'Eco', version: '1.0.0', ordinances: [ORD('eco:law')] } },
    ]);
    createModStore(fakeStorage(seed));
    expect(allOrdinances().some((o) => o.id === 'eco:law')).toBe(true);
  });

  test('a disabled mod seeded in storage does not register', () => {
    const seed = JSON.stringify([
      { enabled: false, pack: { id: 'eco', name: 'Eco', version: '1.0.0', ordinances: [ORD('eco:law')] } },
    ]);
    createModStore(fakeStorage(seed));
    expect(allOrdinances().some((o) => o.id === 'eco:law')).toBe(false);
  });

  test('toggling enable registers, disable unregisters', () => {
    const seed = JSON.stringify([
      { enabled: true, pack: { id: 'eco', name: 'Eco', version: '1.0.0', ordinances: [ORD('eco:law')] } },
    ]);
    const store = createModStore(fakeStorage(seed));
    store.setEnabled('eco', false);
    expect(allOrdinances().some((o) => o.id === 'eco:law')).toBe(false);
    store.setEnabled('eco', true);
    expect(allOrdinances().some((o) => o.id === 'eco:law')).toBe(true);
  });
});

describe('mod store — persistence', () => {
  test('mutations write simcity.mods and a fresh store reconstructs the list', () => {
    const storage = fakeStorage();
    const a = createModStore(storage);
    a.create('Eco');
    const b = createModStore(storage);
    expect(b.list().map((m) => m.pack.id)).toEqual(['eco']);
  });

  test('a corrupt stored value yields an empty list, not a throw', () => {
    expect(() => createModStore(fakeStorage('{not json'))).not.toThrow();
    expect(createModStore(fakeStorage('{not json')).list()).toEqual([]);
    expect(createModStore(fakeStorage('42')).list()).toEqual([]);
  });
});

describe('mod store — import/export', () => {
  test('export round-trips through import to an equivalent pack', () => {
    const seed = JSON.stringify([
      { enabled: true, pack: { id: 'eco', name: 'Eco', version: '1.0.0', ordinances: [ORD('eco:law')] } },
    ]);
    const src = createModStore(fakeStorage(seed));
    const json = src.exportMod('eco');
    expect(JSON.parse(json).id).toBe('eco');

    resetRegistry();
    const dst = createModStore(fakeStorage());
    const r = dst.importMod(json);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.id).toBe('eco');
    expect(dst.list()).toHaveLength(1);
  });

  test('import rejects malformed JSON', () => {
    const r = createModStore(fakeStorage()).importMod('{nope');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/json/i);
  });

  test('import rejects an invalid pack (bad modifier key)', () => {
    const bad = JSON.stringify({
      id: 'x', name: 'X', version: '1', ordinances: [{ id: 'x:l', label: 'L', blurb: 'b', cost: 1, effects: { nope: 1 } }],
    });
    const r = createModStore(fakeStorage()).importMod(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toContain('nope');
  });

  test('import rejects a duplicate mod id', () => {
    const store = createModStore(fakeStorage());
    store.create('Eco'); // id 'eco'
    const dup = JSON.stringify({ id: 'eco', name: 'Eco2', version: '1', ordinances: [] });
    const r = store.importMod(dup);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toContain('eco');
  });
});
