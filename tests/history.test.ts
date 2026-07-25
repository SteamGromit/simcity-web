import { describe, expect, test } from 'vitest';
import { HISTORY_MAX, Zone } from '../src/sim/types';
import { mulberry32, newCity, simTick } from '../src/sim/city';
import { deserialize, serialize } from '../src/sim/save';
import { emptyHistory, HISTORY_KEYS, HISTORY_SPECS, sampleHistory } from '../src/sim/history';
import { makeCity, zone } from './helpers';

describe('monthly history', () => {
  test('one sample per month, every series in step', () => {
    const city = newCity(1);
    const rand = mulberry32(1);
    for (let i = 0; i < 8 * 5; i++) simTick(city, rand); // 5 months
    for (const key of HISTORY_KEYS) {
      expect(city.history[key], key).toHaveLength(5);
    }
    expect(city.history.funds[4]).toBe(city.funds);
  });

  test('history is capped', () => {
    const city = newCity(1);
    for (const key of HISTORY_KEYS) city.history[key] = Array(HISTORY_MAX).fill(0);
    const rand = mulberry32(1);
    for (let i = 0; i < 8; i++) simTick(city, rand);
    for (const key of HISTORY_KEYS) {
      expect(city.history[key], key).toHaveLength(HISTORY_MAX);
    }
  });

  test('an oversized saved history is capped on revive', () => {
    const city = newCity(1);
    const mangled = JSON.parse(serialize(city));
    mangled.history = emptyHistory();
    for (const key of HISTORY_KEYS) mangled.history[key] = Array(HISTORY_MAX * 10).fill(1);
    const revived = deserialize(JSON.stringify(mangled));
    expect(revived!.history.pop).toHaveLength(HISTORY_MAX);
    expect(revived!.history.crime).toHaveLength(HISTORY_MAX);
  });

  test('history round-trips through saves; junk history degrades to empty', () => {
    const city = newCity(1);
    const rand = mulberry32(1);
    for (let i = 0; i < 16; i++) simTick(city, rand);
    expect(deserialize(serialize(city))).toEqual(city);
    const junk = JSON.parse(serialize(city));
    junk.history = 'nope';
    expect(deserialize(JSON.stringify(junk))!.history).toEqual(emptyHistory());
  });

  test('a save from before a series existed keeps what it had, zero-fills the rest', () => {
    const city = newCity(1);
    const rand = mulberry32(1);
    for (let i = 0; i < 8 * 3; i++) simTick(city, rand);
    const legacy = JSON.parse(serialize(city));
    legacy.history = { pop: city.history.pop, funds: city.history.funds }; // the v0.53 shape
    const revived = deserialize(JSON.stringify(legacy))!;
    expect(revived.history.pop).toEqual(city.history.pop);
    expect(revived.history.funds).toEqual(city.history.funds);
    expect(revived.history.crime).toEqual([0, 0, 0]);
  });

  test('mismatched series lengths do not desync the charts', () => {
    const city = newCity(1);
    const rand = mulberry32(1);
    for (let i = 0; i < 8 * 3; i++) simTick(city, rand);
    const mangled = JSON.parse(serialize(city));
    mangled.history.crime = [1, 2]; // one short
    const revived = deserialize(JSON.stringify(mangled))!;
    expect(revived.history.crime).toEqual([0, 0, 0]);
  });
});

describe('sampleHistory', () => {
  const noEvents = { fires: 0, crimes: 0, accidents: 0, collapses: 0 };

  test('counts developed lots by zone and by zoned density', () => {
    const city = makeCity();
    zone(city, 5, 5, Zone.Residential, 2);
    city.tiles[5 * 96 + 5].density = 3;
    zone(city, 6, 5, Zone.Commercial, 1);
    zone(city, 7, 5, Zone.Industrial, 1);
    zone(city, 8, 5, Zone.Residential, 0); // undeveloped: not a lot yet

    const s = sampleHistory(city, noEvents);
    expect(s.rLots).toBe(1);
    expect(s.cLots).toBe(1);
    expect(s.iLots).toBe(1);
    expect(s.densHigh).toBe(1);
    expect(s.densLow).toBe(2);
  });

  test('rates come back as whole percent, averaged over developed lots', () => {
    const city = makeCity();
    zone(city, 5, 5, Zone.Residential, 1);
    zone(city, 6, 5, Zone.Residential, 1);
    city.tiles[5 * 96 + 5].landValue = 0.8;
    city.tiles[5 * 96 + 6].landValue = 0.4;
    expect(sampleHistory(city, noEvents).landValue).toBe(60);
  });

  test('the months incident counts pass straight through', () => {
    const city = makeCity();
    const s = sampleHistory(city, { fires: 2, crimes: 7, accidents: 1, collapses: 0 });
    expect([s.fires, s.crimes, s.accidents, s.collapses]).toEqual([2, 7, 1, 0]);
  });

  test('every declared series is sampled, and every sample is declared', () => {
    const city = makeCity();
    const s = sampleHistory(city, noEvents);
    expect(Object.keys(s).sort()).toEqual([...HISTORY_KEYS].sort());
    expect(HISTORY_SPECS.map((sp) => sp.key).sort()).toEqual([...HISTORY_KEYS].sort());
  });
});
