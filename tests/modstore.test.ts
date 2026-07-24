import { beforeEach, describe, expect, test } from 'vitest';
import { createModStore, slugify, type StorageLike } from '../src/ui/modstore';
import { ensureCoreContent } from '../src/sim/content';
import {
  allOrdinances,
  buildingById,
  ordinanceById,
  resetRegistry,
  slotOf,
} from '../src/content/registry';

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

  test('import surfaces a registerPack failure (cross-pack pinned-slot collision) and does not add the mod', () => {
    const store = createModStore(fakeStorage());
    const a = JSON.stringify({
      id: 'a',
      name: 'A',
      version: '1',
      buildings: [{ id: 'a:x', name: 'X', slot: 1000, cost: 1, upkeep: 0 }],
    });
    const ra = store.importMod(a);
    expect(ra.ok).toBe(true);

    const b = JSON.stringify({
      id: 'b',
      name: 'B',
      version: '1',
      buildings: [{ id: 'b:y', name: 'Y', slot: 1000, cost: 1, upkeep: 0 }],
    });
    const rb = store.importMod(b);
    expect(rb.ok).toBe(false);
    if (!rb.ok) expect(rb.errors.join(' ')).toContain('1000');

    expect(store.list().map((m) => m.pack.id)).toEqual(['a']);
  });

  test('exportMod on an unknown id returns an empty string', () => {
    const store = createModStore(fakeStorage());
    expect(store.exportMod('nope')).toBe('');
  });
});

describe('mod store — setEnabled no-op', () => {
  test('setEnabled to the current value does not fire onChange or change the list', () => {
    const store = createModStore(fakeStorage());
    const m = store.create('Eco'); // enabled: true
    let n = 0;
    store.onChange(() => n++);
    store.setEnabled(m.pack.id, true); // already true
    expect(n).toBe(0);
    expect(store.list()).toEqual([m]);
  });
});

describe('mod store — load drops malformed entries', () => {
  test('a malformed entry is dropped while a good one still loads', () => {
    const good = { enabled: true, pack: { id: 'eco', name: 'Eco', version: '1.0.0', ordinances: [] } };
    const seed = JSON.stringify([good, { enabled: 'yes', pack: { id: 'bad', name: 'Bad', version: '1', ordinances: [] } }]);
    const store = createModStore(fakeStorage(seed));
    expect(store.list().map((m) => m.pack.id)).toEqual(['eco']);
  });

  test('a non-object entry (a number) is dropped while a good one still loads', () => {
    const good = { enabled: true, pack: { id: 'eco', name: 'Eco', version: '1.0.0', ordinances: [] } };
    const seed = JSON.stringify([good, 5]);
    const store = createModStore(fakeStorage(seed));
    expect(store.list().map((m) => m.pack.id)).toEqual(['eco']);
  });
});

const DRAFT = {
  label: 'Carbon Tax',
  blurb: 'Industry pollutes less.',
  cost: 50,
  effects: [{ key: 'pollution.industry' as const, value: 0.5 }],
};

describe('mod store — ordinance authoring', () => {
  test('addOrdinance namespaces the id and registers it', () => {
    resetRegistry();
    const store = createModStore(fakeStorage());
    const m = store.create('Eco');
    const r = store.addOrdinance(m.pack.id, DRAFT);
    expect(r.ok).toBe(true);
    const ord = ordinanceById('eco:carbon-tax');
    expect(ord).toBeDefined();
    expect(ord!.cost).toBe(50);
    expect(ord!.effects).toEqual({ 'pollution.industry': 0.5 });
  });

  test('addOrdinance rejects a negative cost and changes nothing', () => {
    resetRegistry();
    const store = createModStore(fakeStorage());
    const m = store.create('Eco');
    const r = store.addOrdinance(m.pack.id, { ...DRAFT, cost: -1 });
    expect(r.ok).toBe(false);
    expect(store.list()[0].pack.ordinances).toHaveLength(0);
  });

  test('updateOrdinance keeps the id stable across a label change', () => {
    resetRegistry();
    const store = createModStore(fakeStorage());
    const m = store.create('Eco');
    store.addOrdinance(m.pack.id, DRAFT);
    const r = store.updateOrdinance(m.pack.id, 'eco:carbon-tax', { ...DRAFT, label: 'Carbon Levy', cost: 60 });
    expect(r.ok).toBe(true);
    const ord = ordinanceById('eco:carbon-tax');
    expect(ord!.label).toBe('Carbon Levy');
    expect(ord!.cost).toBe(60);
    // no second ordinance under a new id
    expect(store.list()[0].pack.ordinances).toHaveLength(1);
  });

  test('removeOrdinance unregisters it', () => {
    resetRegistry();
    const store = createModStore(fakeStorage());
    const m = store.create('Eco');
    store.addOrdinance(m.pack.id, DRAFT);
    store.removeOrdinance(m.pack.id, 'eco:carbon-tax');
    expect(ordinanceById('eco:carbon-tax')).toBeUndefined();
  });

  test('two ordinances whose labels slug the same are rejected as a duplicate id', () => {
    resetRegistry();
    const store = createModStore(fakeStorage());
    const m = store.create('Eco');
    store.addOrdinance(m.pack.id, DRAFT);
    const r = store.addOrdinance(m.pack.id, { ...DRAFT, cost: 10 }); // same label → same slug
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toContain('duplicate');
  });
});

const LOOK = {
  footprint: 0.8,
  height: 24,
  hue: 120,
  sat: 40,
  light: 50,
  roof: 'gabled' as const,
  props: ['vent' as const],
};

const BUILDING_DRAFT = {
  name: 'Solar Grove',
  category: 'power' as const,
  cost: 800,
  upkeep: 20,
  capacity: 120,
  pollution: 0,
  needsWater: false,
  visual: LOOK,
};

describe('mod store — building authoring', () => {
  test('addBuilding namespaces the id and tool, and registers it', () => {
    resetRegistry();
    const store = createModStore(fakeStorage());
    const m = store.create('Eco');
    const r = store.addBuilding(m.pack.id, BUILDING_DRAFT);
    expect(r.ok).toBe(true);

    const b = buildingById('eco:solar-grove');
    expect(b).toBeDefined();
    expect(b!.tool).toBe('eco__solar-grove');
    expect(b!.cost).toBe(800);
    expect(b!.power).toEqual({ capacity: 120, pollution: 0 });
    expect(b!.visual).toEqual(LOOK);
  });

  test('a mod slot is allocated, never a core zone', () => {
    resetRegistry();
    const store = createModStore(fakeStorage());
    const m = store.create('Eco');
    store.addBuilding(m.pack.id, BUILDING_DRAFT);
    expect(slotOf('eco:solar-grove')!).toBeGreaterThanOrEqual(1000);
  });

  test('each category writes only its own block', () => {
    resetRegistry();
    const store = createModStore(fakeStorage());
    const m = store.create('Eco');

    store.addBuilding(m.pack.id, { ...BUILDING_DRAFT, name: 'Plain', category: 'plain' });
    const plain = buildingById('eco:plain')!;
    expect(plain.power).toBeUndefined();
    expect(plain.service).toBeUndefined();
    expect(plain.transit).toBeUndefined();

    store.addBuilding(m.pack.id, {
      ...BUILDING_DRAFT, name: 'Firehouse', category: 'service', serviceKind: 'fire', radius: 8,
    });
    const svc = buildingById('eco:firehouse')!;
    expect(svc.service).toEqual({ kind: 'fire', radius: 8 });
    expect(svc.power).toBeUndefined();

    store.addBuilding(m.pack.id, {
      ...BUILDING_DRAFT, name: 'Tram Halt', category: 'transit', radius: 10, share: 0.4,
    });
    const tr = buildingById('eco:tram-halt')!;
    expect(tr.transit).toEqual({ radius: 10, share: 0.4 });
  });

  test('siting and unlock are carried through', () => {
    resetRegistry();
    const store = createModStore(fakeStorage());
    const m = store.create('Eco');
    store.addBuilding(m.pack.id, {
      ...BUILDING_DRAFT,
      needsWater: true,
      unlock: { expr: 'population >= 500', label: 'pop 500' },
    });
    const b = buildingById('eco:solar-grove')!;
    expect(b.siting).toEqual({ needsWater: true });
    expect(b.unlock).toEqual({ expr: 'population >= 500', label: 'pop 500' });
  });

  test('updateBuilding keeps the id and slot stable across a rename', () => {
    resetRegistry();
    const store = createModStore(fakeStorage());
    const m = store.create('Eco');
    store.addBuilding(m.pack.id, BUILDING_DRAFT);
    const slot = slotOf('eco:solar-grove');

    const r = store.updateBuilding(m.pack.id, 'eco:solar-grove', {
      ...BUILDING_DRAFT, name: 'Solar Meadow', cost: 900,
    });
    expect(r.ok).toBe(true);
    const b = buildingById('eco:solar-grove')!;
    expect(b.name).toBe('Solar Meadow');
    expect(b.cost).toBe(900);
    expect(slotOf('eco:solar-grove')).toBe(slot);
    expect(store.list()[0].pack.buildings).toHaveLength(1);
  });

  test('removeBuilding unregisters it', () => {
    resetRegistry();
    const store = createModStore(fakeStorage());
    const m = store.create('Eco');
    store.addBuilding(m.pack.id, BUILDING_DRAFT);
    store.removeBuilding(m.pack.id, 'eco:solar-grove');
    expect(buildingById('eco:solar-grove')).toBeUndefined();
  });

  test('an invalid look is rejected and nothing persists', () => {
    resetRegistry();
    const store = createModStore(fakeStorage());
    const m = store.create('Eco');
    const r = store.addBuilding(m.pack.id, {
      ...BUILDING_DRAFT,
      visual: { ...LOOK, height: 500 },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toContain('visual.height');
    expect(store.list()[0].pack.buildings ?? []).toHaveLength(0);
    expect(buildingById('eco:solar-grove')).toBeUndefined();
  });

  test('two buildings whose names slug the same are rejected', () => {
    resetRegistry();
    const store = createModStore(fakeStorage());
    const m = store.create('Eco');
    store.addBuilding(m.pack.id, BUILDING_DRAFT);
    const r = store.addBuilding(m.pack.id, { ...BUILDING_DRAFT, cost: 10 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toContain('duplicate');
  });

  test('a disabled mod contributes no buildings to the registry', () => {
    resetRegistry();
    const store = createModStore(fakeStorage());
    const m = store.create('Eco');
    store.addBuilding(m.pack.id, BUILDING_DRAFT);
    expect(buildingById('eco:solar-grove')).toBeDefined();
    store.setEnabled(m.pack.id, false);
    expect(buildingById('eco:solar-grove')).toBeUndefined();
    store.setEnabled(m.pack.id, true);
    expect(buildingById('eco:solar-grove')).toBeDefined();
  });

  test('buildings persist and re-register from storage', () => {
    resetRegistry();
    const storage = fakeStorage();
    const a = createModStore(storage);
    const m = a.create('Eco');
    a.addBuilding(m.pack.id, BUILDING_DRAFT);

    resetRegistry();
    const b = createModStore(storage);
    expect(b.list()[0].pack.buildings).toHaveLength(1);
    expect(buildingById('eco:solar-grove')).toBeDefined();
  });
});

describe('mod store — overrides', () => {
  function freshStore() {
    resetRegistry();
    ensureCoreContent();
    const store = createModStore(fakeStorage());
    return { store, mod: store.create('Balance') };
  }

  test('setOverride retunes core content and persists', () => {
    const { store, mod } = freshStore();
    const r = store.setOverride(mod.pack.id, 'building', { id: 'core:coal_plant', cost: 500 });
    expect(r.ok).toBe(true);
    expect(buildingById('core:coal_plant')!.cost).toBe(500);
    expect(store.list()[0].pack.overrides!.buildings).toHaveLength(1);
  });

  test('setting the same target twice replaces rather than appends', () => {
    const { store, mod } = freshStore();
    store.setOverride(mod.pack.id, 'building', { id: 'core:coal_plant', cost: 500 });
    store.setOverride(mod.pack.id, 'building', { id: 'core:coal_plant', cost: 900 });
    expect(store.list()[0].pack.overrides!.buildings).toHaveLength(1);
    expect(buildingById('core:coal_plant')!.cost).toBe(900);
  });

  test('clearOverride restores the core value', () => {
    const { store, mod } = freshStore();
    store.setOverride(mod.pack.id, 'building', { id: 'core:coal_plant', cost: 500 });
    store.clearOverride(mod.pack.id, 'building', 'core:coal_plant');
    expect(buildingById('core:coal_plant')!.cost).toBe(3000);
    expect(store.list()[0].pack.overrides!.buildings ?? []).toHaveLength(0);
  });

  test('ordinance overrides work the same way', () => {
    const { store, mod } = freshStore();
    const r = store.setOverride(mod.pack.id, 'ordinance', { id: 'cleanAir', cost: 42 });
    expect(r.ok).toBe(true);
    expect(ordinanceById('cleanAir')!.cost).toBe(42);
    store.clearOverride(mod.pack.id, 'ordinance', 'cleanAir');
    expect(ordinanceById('cleanAir')!.cost).toBe(100);
  });

  test('an invalid patch is rejected and nothing changes', () => {
    const { store, mod } = freshStore();
    const r = store.setOverride(mod.pack.id, 'building', { id: 'core:coal_plant', cost: -1 });
    expect(r.ok).toBe(false);
    expect(buildingById('core:coal_plant')!.cost).toBe(3000);
    expect(store.list()[0].pack.overrides?.buildings ?? []).toHaveLength(0);
  });

  test('a patch naming unknown content is rejected', () => {
    const { store, mod } = freshStore();
    const r = store.setOverride(mod.pack.id, 'building', { id: 'nope:missing', cost: 5 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toContain('nope:missing');
  });

  test('disabling the mod restores core, re-enabling reapplies', () => {
    const { store, mod } = freshStore();
    store.setOverride(mod.pack.id, 'building', { id: 'core:coal_plant', cost: 500 });

    store.setEnabled(mod.pack.id, false);
    expect(buildingById('core:coal_plant')!.cost).toBe(3000);

    store.setEnabled(mod.pack.id, true);
    expect(buildingById('core:coal_plant')!.cost).toBe(500);
  });

  test('overrides survive export and import', () => {
    const { store, mod } = freshStore();
    store.setOverride(mod.pack.id, 'building', { id: 'core:coal_plant', cost: 500 });
    const json = store.exportMod(mod.pack.id);

    resetRegistry();
    ensureCoreContent();
    const dst = createModStore(fakeStorage());
    const r = dst.importMod(json);
    expect(r.ok).toBe(true);
    expect(buildingById('core:coal_plant')!.cost).toBe(500);
  });

  test('overrides persist across a store reload', () => {
    resetRegistry();
    ensureCoreContent();
    const storage = fakeStorage();
    const a = createModStore(storage);
    const m = a.create('Balance');
    a.setOverride(m.pack.id, 'building', { id: 'core:coal_plant', cost: 500 });

    resetRegistry();
    ensureCoreContent();
    createModStore(storage); // re-registers from storage
    expect(buildingById('core:coal_plant')!.cost).toBe(500);
  });
});
