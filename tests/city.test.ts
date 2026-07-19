import { describe, expect, test } from 'vitest';
import { idx } from '../src/sim/grid';
import { GRID, START_FUNDS, Zone } from '../src/sim/types';
import { applyTool, mulberry32, newCity, simTick } from '../src/sim/city';
import { deserialize, serialize } from '../src/sim/save';
import { clearLand } from './helpers';

/** newCity with terrain flattened, so fixed-coordinate tool tests are stable. */
function newFlatCity(seed: number) {
  const city = newCity(seed);
  clearLand(city);
  return city;
}

describe('newCity', () => {
  test('starts with full funds and a blank grid', () => {
    const city = newFlatCity(7);
    expect(city.funds).toBe(START_FUNDS);
    expect(city.tiles).toHaveLength(GRID * GRID);
    expect(city.taxes).toEqual({ r: 0.09, c: 0.09, i: 0.09 });
    expect(city.tiles.every((t) => t.zone === Zone.None)).toBe(true);
  });
});

describe('applyTool', () => {
  test('placing a road deducts its cost', () => {
    const city = newFlatCity(7);
    const res = applyTool(city, 'road', 5, 5);
    expect(res.ok).toBe(true);
    expect(city.tiles[idx(5, 5)].zone).toBe(Zone.Road);
    expect(city.funds).toBe(START_FUNDS - 10);
  });

  test('zoning tools mark zones', () => {
    const city = newFlatCity(7);
    applyTool(city, 'zoneR', 1, 1);
    applyTool(city, 'zoneC', 2, 1);
    applyTool(city, 'zoneI', 3, 1);
    expect(city.tiles[idx(1, 1)].zone).toBe(Zone.Residential);
    expect(city.tiles[idx(2, 1)].zone).toBe(Zone.Commercial);
    expect(city.tiles[idx(3, 1)].zone).toBe(Zone.Industrial);
  });

  test('occupied tiles reject construction without charging', () => {
    const city = newFlatCity(7);
    applyTool(city, 'road', 5, 5);
    const res = applyTool(city, 'zoneR', 5, 5);
    expect(res.ok).toBe(false);
    expect(city.funds).toBe(START_FUNDS - 10);
  });

  test('out of bounds is rejected', () => {
    const city = newFlatCity(7);
    expect(applyTool(city, 'road', -1, 5).ok).toBe(false);
    expect(applyTool(city, 'road', 5, GRID).ok).toBe(false);
  });

  test('broke cities cannot build', () => {
    const city = newFlatCity(7);
    city.funds = 5;
    expect(applyTool(city, 'road', 5, 5).ok).toBe(false);
    expect(city.funds).toBe(5);
  });

  test('the line tool strings a wire over an existing road', () => {
    const city = newFlatCity(7);
    applyTool(city, 'road', 5, 5);
    const res = applyTool(city, 'line', 5, 5);
    expect(res.ok).toBe(true);
    const t = city.tiles[idx(5, 5)];
    expect(t.zone).toBe(Zone.Road); // still a road
    expect(t.wire).toBe(true);
    expect(city.funds).toBe(START_FUNDS - 10 - 5);
    expect(applyTool(city, 'line', 5, 5).ok).toBe(false); // no double wiring
  });

  test('bulldoze clears anything but empty land', () => {
    const city = newFlatCity(7);
    applyTool(city, 'zoneR', 5, 5);
    city.tiles[idx(5, 5)].stage = 2;
    city.tiles[idx(5, 5)].abandoned = true;
    const res = applyTool(city, 'bulldoze', 5, 5);
    expect(res.ok).toBe(true);
    const t = city.tiles[idx(5, 5)];
    expect(t.zone).toBe(Zone.None);
    expect(t.stage).toBe(0);
    expect(t.abandoned).toBe(false);
    expect(applyTool(city, 'bulldoze', 6, 6).ok).toBe(false);
  });
});

function buildStarterTown(seed: number) {
  const city = newFlatCity(seed);
  applyTool(city, 'plant', 4, 8);
  for (let x = 5; x <= 14; x++) applyTool(city, 'road', x, 9);
  for (let x = 5; x <= 9; x++) applyTool(city, 'zoneR', x, 8);
  for (let x = 10; x <= 11; x++) applyTool(city, 'zoneC', x, 8);
  for (let x = 12; x <= 14; x++) applyTool(city, 'zoneI', x, 8);
  return city;
}

describe('simTick with services', () => {
  test('serviced towns grow past the stage gates; unserviced towns stall', () => {
    const serviced = buildStarterTown(11);
    applyTool(serviced, 'fire', 9, 7);
    applyTool(serviced, 'police', 10, 7);
    applyTool(serviced, 'school', 11, 7);
    const unserviced = buildStarterTown(11);
    const randA = mulberry32(5);
    const randB = mulberry32(5);
    for (let i = 0; i < 600; i++) simTick(serviced, randA);
    for (let i = 0; i < 600; i++) simTick(unserviced, randB);
    const maxStage = (c: typeof serviced) => Math.max(...c.tiles.map((t) => t.stage));
    expect(maxStage(serviced)).toBeGreaterThanOrEqual(2);
    expect(maxStage(unserviced)).toBeLessThanOrEqual(1);
  });

  test('notices are capped so the queue cannot grow without bound', () => {
    const city = buildStarterTown(3);
    for (let i = 0; i < 20; i++) city.notices.push(`notice ${i}`);
    const rand = mulberry32(3);
    for (let i = 0; i < 8; i++) simTick(city, rand); // crosses a month boundary
    expect(city.notices.length).toBeLessThanOrEqual(8);
  });
});

describe('simTick', () => {
  test('a seeded starter town comes alive', () => {
    const city = buildStarterTown(42);
    const rand = mulberry32(42);
    for (let i = 0; i < 400; i++) simTick(city, rand);
    expect(city.population).toBeGreaterThan(0);
    expect(city.jobs).toBeGreaterThan(0);
    expect(city.month).toBe(50); // 400 ticks / 8 per month
    expect(city.funds).not.toBe(START_FUNDS);
  });

  test('the simulation is deterministic for a given seed', () => {
    const a = buildStarterTown(1);
    const b = buildStarterTown(1);
    const randA = mulberry32(9);
    const randB = mulberry32(9);
    for (let i = 0; i < 100; i++) simTick(a, randA);
    for (let i = 0; i < 100; i++) simTick(b, randB);
    expect(serialize(a)).toBe(serialize(b));
  });
});

describe('save round-trip', () => {
  test('serialize → deserialize preserves the city, including Infinity commutes', () => {
    const city = buildStarterTown(3);
    const rand = mulberry32(3);
    for (let i = 0; i < 50; i++) simTick(city, rand);
    const revived = deserialize(serialize(city));
    expect(revived).toEqual(city);
    expect(revived!.tiles.some((t) => t.commute === Infinity)).toBe(true);
  });

  test('corrupt or foreign JSON yields null', () => {
    expect(deserialize('not json{')).toBeNull();
    expect(deserialize('{"version":99}')).toBeNull();
    expect(deserialize('{"hello":"world"}')).toBeNull();
  });

  test('a version-1 save with the wrong tile count yields null', () => {
    expect(deserialize('{"version":1,"tiles":[]}')).toBeNull();
  });

  test('non-finite top-level numbers yield null', () => {
    const city = newCity(1);
    const mangled = serialize(city).replace(`"funds":${city.funds}`, '"funds":null');
    expect(deserialize(mangled)).toBeNull();
  });

  test('stations and notices survive a round-trip; junk notices are dropped', () => {
    const city = buildStarterTown(9);
    applyTool(city, 'fire', 9, 7);
    city.notices.push('Fire! A building at (5, 8) burned down — no fire coverage.');
    const revived = deserialize(serialize(city));
    expect(revived).toEqual(city);
    const junk = JSON.parse(serialize(city));
    junk.notices = ['ok', 42, null, 'also ok'];
    const cleaned = deserialize(JSON.stringify(junk));
    expect(cleaned!.notices).toEqual(['ok', 'also ok']);
  });

  test('malformed tile fields degrade to blank defaults, never NaN', () => {
    const tiles = JSON.stringify(Array.from({ length: GRID * GRID }, () => ({})));
    const json = `{"version":1,"seed":1,"tiles":${tiles},"funds":100,"tick":0,"month":0,"taxes":{"r":0.09,"c":0.09,"i":0.09}}`;
    const city = deserialize(json);
    expect(city).not.toBeNull();
    expect(city!.population).toBe(0);
    expect(city!.tiles[0].commute).toBe(Infinity);
    expect(city!.tiles[0].landValue).toBe(0.3);
    // a wedged-save regression guard: the revived city must still simulate
    const rand = mulberry32(1);
    for (let i = 0; i < 20; i++) simTick(city!, rand);
    expect(Number.isFinite(city!.funds)).toBe(true);
  });
});
