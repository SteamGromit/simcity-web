import { describe, expect, test } from 'vitest';
import { deserialize, serialize } from '../src/sim/save';
import { newCity } from '../src/sim/city';
import { Zone } from '../src/sim/types';
import { idx } from '../src/sim/grid';
import { registerPack, resetRegistry, slotOf } from '../src/content/registry';
import { ensureCoreContent } from '../src/sim/content';

describe('save legend', () => {
  test('a save records the ids of the slots the city uses', () => {
    const city = newCity(1);
    city.tiles[idx(5, 5)].zone = Zone.PowerPlant;
    const raw = JSON.parse(serialize(city));
    expect(raw.zoneIds[Zone.PowerPlant]).toBe('core:coal_plant');
  });

  test('a legend round-trips unchanged', () => {
    const city = newCity(1);
    city.tiles[idx(5, 5)].zone = Zone.PowerPlant;
    city.tiles[idx(6, 5)].zone = Zone.Road;
    const back = deserialize(serialize(city))!;
    expect(back.tiles[idx(5, 5)].zone).toBe(Zone.PowerPlant);
    expect(back.tiles[idx(6, 5)].zone).toBe(Zone.Road);
  });

  test('a legacy save with no legend revives exactly as before', () => {
    const city = newCity(1);
    city.tiles[idx(5, 5)].zone = Zone.NuclearPlant;
    const raw = JSON.parse(serialize(city));
    delete raw.zoneIds;
    const back = deserialize(JSON.stringify(raw))!;
    expect(back.tiles[idx(5, 5)].zone).toBe(Zone.NuclearPlant);
  });

  test('a slot whose id this session does not know clears that tile only', () => {
    const city = newCity(1);
    city.tiles[idx(5, 5)].zone = Zone.PowerPlant;
    city.tiles[idx(6, 5)].zone = Zone.Road;
    const raw = JSON.parse(serialize(city));
    raw.zoneIds[Zone.PowerPlant] = 'ghostpack:reactor';
    const back = deserialize(JSON.stringify(raw))!;
    expect(back.tiles[idx(5, 5)].zone).toBe(Zone.None);
    expect(back.tiles[idx(6, 5)].zone).toBe(Zone.Road); // untouched
  });

  test('a legend that remaps a slot moves the tile to the current slot', () => {
    const city = newCity(1);
    city.tiles[idx(5, 5)].zone = 1234 as Zone; // a slot this session does not use
    const raw = JSON.parse(serialize(city));
    raw.zoneIds = { 1234: 'core:coal_plant' };
    const back = deserialize(JSON.stringify(raw))!;
    expect(back.tiles[idx(5, 5)].zone).toBe(Zone.PowerPlant);
  });

  test('a Zone.None-keyed legend entry is ignored, leaving blank tiles blank', () => {
    const city = newCity(1);
    city.tiles[idx(6, 5)].zone = Zone.Road;
    const raw = JSON.parse(serialize(city));
    // a hand-edited / third-party save claiming slot 0 (Zone.None) means
    // something — legendFor never emits this, so a reader that honored it
    // would remap every blank tile in the grid to the claimed building
    raw.zoneIds = { ...raw.zoneIds, 0: 'core:coal_plant' };
    const back = deserialize(JSON.stringify(raw))!;
    expect(back.tiles[idx(0, 0)].zone).toBe(Zone.None);
    expect(back.tiles[idx(6, 5)].zone).toBe(Zone.Road);
  });
});

describe('save legend and authored buildings', () => {
  const LOOK = {
    footprint: 0.8, height: 20, hue: 200, sat: 40, light: 50,
    roof: 'flat' as const, props: [],
  };

  function loadMod(id = 'mod:depot'): number {
    const r = registerPack({
      id: 'mod', name: 'Mod', version: '1.0.0',
      buildings: [{ id, name: 'Depot', tool: 'mod__depot', cost: 10, upkeep: 1, visual: LOOK }],
    });
    if (!r.ok) throw new Error(r.errors.join('\n'));
    return slotOf(id)!;
  }

  test('a placed authored building round-trips through a save', () => {
    resetRegistry();
    ensureCoreContent();
    const slot = loadMod();

    const city = newCity(1);
    city.tiles[idx(5, 5)].zone = slot as Zone;
    const raw = JSON.parse(serialize(city));
    expect(raw.zoneIds[slot]).toBe('mod:depot');

    const back = deserialize(serialize(city))!;
    expect(back.tiles[idx(5, 5)].zone).toBe(slot);
  });

  test('it survives the mod being allocated a different slot next session', () => {
    resetRegistry();
    ensureCoreContent();
    loadMod();
    const city = newCity(1);
    city.tiles[idx(5, 5)].zone = slotOf('mod:depot')! as Zone;
    const saved = serialize(city);

    // a new session where another pack registered first, so 'mod' would
    // otherwise land on a different number
    resetRegistry();
    ensureCoreContent();
    registerPack({
      id: 'other', name: 'Other', version: '1',
      buildings: [{ id: 'other:a', name: 'A', cost: 1, upkeep: 0 }],
    });
    loadMod();

    const back = deserialize(saved)!;
    expect(back.tiles[idx(5, 5)].zone).toBe(slotOf('mod:depot'));
    expect(back.tiles[idx(5, 5)].zone).not.toBe(slotOf('other:a'));
  });

  test('a tile whose mod is absent clears, leaving the rest intact', () => {
    resetRegistry();
    ensureCoreContent();
    const slot = loadMod();
    const city = newCity(1);
    city.tiles[idx(5, 5)].zone = slot as Zone;
    city.tiles[idx(6, 5)].zone = Zone.PowerPlant;
    const saved = serialize(city);

    resetRegistry();
    ensureCoreContent(); // the mod is gone this session

    const back = deserialize(saved)!;
    expect(back.tiles[idx(5, 5)].zone).toBe(Zone.None);
    expect(back.tiles[idx(6, 5)].zone).toBe(Zone.PowerPlant);
  });
});

describe('garbage state in a save', () => {
  test("a tile's heap round-trips", () => {
    const city = newCity(1);
    city.tiles[idx(5, 5)].zone = Zone.Residential;
    city.tiles[idx(5, 5)].garbage = 0.42;
    const back = deserialize(serialize(city))!;
    expect(back.tiles[idx(5, 5)].garbage).toBeCloseTo(0.42);
  });

  test('a heap outside 0..1 is clamped rather than trusted', () => {
    const city = newCity(1);
    const raw = JSON.parse(serialize(city));
    raw.tiles[idx(5, 5)].garbage = 99;
    const back = deserialize(JSON.stringify(raw))!;
    expect(back.tiles[idx(5, 5)].garbage).toBe(1);
  });

  test('a save from before garbage existed loads with clean streets', () => {
    const city = newCity(1);
    const raw = JSON.parse(serialize(city));
    for (const t of raw.tiles) delete t.garbage;
    delete raw.waste;
    const back = deserialize(JSON.stringify(raw))!;
    expect(back.tiles[idx(5, 5)].garbage).toBe(0);
    expect(back.waste).toEqual({
      produced: 0, diverted: 0, capacity: 0, collected: 0, uncollected: 0,
    });
  });
});

describe('crime state in a save', () => {
  test("a tile's crime rate round-trips", () => {
    const city = newCity(1);
    city.tiles[idx(5, 5)].zone = Zone.Residential;
    city.tiles[idx(5, 5)].crime = 0.6;
    const back = deserialize(serialize(city))!;
    expect(back.tiles[idx(5, 5)].crime).toBeCloseTo(0.6);
  });

  test('a rate outside 0..1 is clamped, not trusted', () => {
    const city = newCity(1);
    const raw = JSON.parse(serialize(city));
    raw.tiles[idx(5, 5)].crime = -3;
    const back = deserialize(JSON.stringify(raw))!;
    expect(back.tiles[idx(5, 5)].crime).toBe(0);
  });

  test('a save from before crime existed loads crime-free', () => {
    const city = newCity(1);
    const raw = JSON.parse(serialize(city));
    for (const t of raw.tiles) delete t.crime;
    const back = deserialize(JSON.stringify(raw))!;
    expect(back.tiles[idx(5, 5)].crime).toBe(0);
  });

  test('crimeFlash is render-only and not persisted', () => {
    const city = newCity(1);
    city.tiles[idx(5, 5)].crimeFlash = 30;
    const raw = JSON.parse(serialize(city));
    expect(raw.tiles[idx(5, 5)].crimeFlash).toBeUndefined();
  });
});

describe('accident state in a save', () => {
  test('a blocked road round-trips', () => {
    const city = newCity(1);
    city.tiles[idx(5, 5)].zone = Zone.Road;
    city.tiles[idx(5, 5)].accident = 12;
    const back = deserialize(serialize(city))!;
    expect(back.tiles[idx(5, 5)].accident).toBe(12);
  });

  test('a wild accident value is clamped', () => {
    const city = newCity(1);
    const raw = JSON.parse(serialize(city));
    raw.tiles[idx(5, 5)].accident = 9999;
    const back = deserialize(JSON.stringify(raw))!;
    expect(back.tiles[idx(5, 5)].accident).toBe(40);
  });

  test('a save from before accidents existed loads clear', () => {
    const city = newCity(1);
    const raw = JSON.parse(serialize(city));
    for (const t of raw.tiles) delete t.accident;
    const back = deserialize(JSON.stringify(raw))!;
    expect(back.tiles[idx(5, 5)].accident).toBe(0);
  });
});
