import { describe, expect, test } from 'vitest';
import { deserialize, serialize } from '../src/sim/save';
import { newCity } from '../src/sim/city';
import { Zone } from '../src/sim/types';
import { idx } from '../src/sim/grid';

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
});
