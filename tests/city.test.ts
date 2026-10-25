import { describe, expect, test } from 'vitest';
import { buildingByTool } from '../src/content/registry';
import { idx } from '../src/sim/grid';
import { GRID, START_FUNDS, Terrain, TICKS_PER_MONTH, Zone } from '../src/sim/types';
import { applyTool, applyToolLine, DEV_SLICE, mulberry32, newCity, simTick } from '../src/sim/city';
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

  test('grew round-trips, and a save from before it loads with no building sites', () => {
    const city = buildStarterTown(3);
    const lot = city.tiles[idx(5, 5)];
    lot.zone = Zone.Residential;
    lot.stage = 1;
    lot.grew = 2;
    const revived = deserialize(serialize(city))!;
    expect(revived.tiles[city.tiles.indexOf(lot)].grew).toBe(2);
    const raw = JSON.parse(serialize(city));
    for (const t of raw.tiles) delete t.grew;
    const old = deserialize(JSON.stringify(raw))!;
    expect(old.tiles.every((t) => t.grew === 24)).toBe(true);
    // a blank tile carries the default, so a save does not spell it out
    expect(serialize(city)).not.toContain('"grew":24');
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

  test('out-of-range taxes and demand are clamped on revival', () => {
    const junk = JSON.parse(serialize(newCity(1)));
    junk.taxes = { r: 9, c: -0.5, i: 0.13 };
    junk.demand = { r: 50, c: -50, i: 0.4 };
    const revived = deserialize(JSON.stringify(junk));
    expect(revived!.taxes).toEqual({ r: 0.2, c: 0, i: 0.13 });
    expect(revived!.demand).toEqual({ r: 1, c: -1, i: 0.4 });
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

describe('legacy 64×64 save migration', () => {
  /** Build a minimal legacy save: a 64² city JSON with one road at (5,5). */
  function legacySave(extra: Record<string, unknown> = {}): string {
    const city = JSON.parse(serialize(newCity(1)));
    const LEGACY = 64;
    // shrink the tile grid to 64² blank-ish tiles with one road marker
    const tiles = Array.from({ length: LEGACY * LEGACY }, () => ({ zone: 0 }));
    tiles[5 * LEGACY + 5] = { zone: Zone.Road };
    return JSON.stringify({ ...city, tiles, ...extra });
  }

  test('a legacy save loads centered on the bigger grid', () => {
    const revived = deserialize(legacySave());
    expect(revived).not.toBeNull();
    expect(revived!.tiles).toHaveLength(GRID * GRID);
    expect(revived!.tiles[idx(5 + 16, 5 + 16)].zone).toBe(Zone.Road);
    expect(revived!.tiles[idx(5, 5)].zone).toBe(Zone.None); // outside stays blank
  });

  test('an active tornado shifts with the embed', () => {
    const revived = deserialize(
      legacySave({ disasters: { tornado: { x: 10, y: 12, ticksLeft: 5 }, hurricaneTicks: 0, pandemicMonths: 0 } }),
    );
    expect(revived!.disasters.tornado).toEqual({ x: 26, y: 28, ticksLeft: 5 });
  });

  test('other lengths still fail closed', () => {
    const city = JSON.parse(serialize(newCity(1)));
    city.tiles = Array.from({ length: 5000 }, () => ({ zone: 0 }));
    expect(deserialize(JSON.stringify(city))).toBeNull();
  });
});

describe('applyToolLine', () => {
  test('builds a run of power lines and pays per tile', () => {
    const city = newFlatCity(7);
    const line: [number, number][] = [
      [2, 2],
      [3, 2],
      [4, 2],
    ];
    const res = applyToolLine(city, 'line', line);
    expect(res).toEqual({ applied: 3, brokeFunds: false });
    for (const [x, y] of line) expect(city.tiles[idx(x, y)].zone).toBe(Zone.PowerLine);
    expect(city.funds).toBe(START_FUNDS - 3 * buildingByTool('line')!.cost);
  });

  test('wires and pipes cross roads as flags, not replacements', () => {
    const city = newFlatCity(7);
    applyTool(city, 'road', 3, 2);
    applyToolLine(city, 'line', [
      [2, 2],
      [3, 2],
      [4, 2],
    ]);
    expect(city.tiles[idx(3, 2)].zone).toBe(Zone.Road);
    expect(city.tiles[idx(3, 2)].wire).toBe(true);
    expect(city.tiles[idx(2, 2)].zone).toBe(Zone.PowerLine);

    applyTool(city, 'road', 5, 5);
    applyToolLine(city, 'pipe', [
      [4, 5],
      [5, 5],
      [6, 5],
    ]);
    expect(city.tiles[idx(5, 5)].zone).toBe(Zone.Road);
    expect(city.tiles[idx(5, 5)].pipe).toBe(true);
    expect(city.tiles[idx(6, 5)].zone).toBe(Zone.WaterPipe);
  });

  test('reports brokeFunds and partial count when money runs out', () => {
    const city = newFlatCity(7);
    city.funds = buildingByTool('line')!.cost * 2 + 1; // afford exactly two tiles
    const res = applyToolLine(city, 'line', [
      [1, 1],
      [2, 1],
      [3, 1],
      [4, 1],
    ]);
    expect(res.applied).toBe(2);
    expect(res.brokeFunds).toBe(true);
  });

  test('skips occupied tiles without flagging funds trouble', () => {
    const city = newFlatCity(7);
    applyTool(city, 'zoneR', 2, 8);
    const res = applyToolLine(city, 'line', [
      [1, 8],
      [2, 8],
      [3, 8],
    ]);
    expect(res).toEqual({ applied: 2, brokeFunds: false });
    expect(city.tiles[idx(2, 8)].zone).toBe(Zone.Residential);
  });
});

describe('development sweep pacing', () => {
  test('a month of ticks sweeps the whole grid exactly once', () => {
    expect(DEV_SLICE * TICKS_PER_MONTH).toBe(GRID * GRID);
  });
});

describe('Building Permits surcharge', () => {
  test('zoning costs more while permits are enacted, not otherwise', () => {
    const plain = newCity(1);
    plain.funds = 10000;
    for (const t of plain.tiles) t.terrain = Terrain.Grass;
    const before = plain.funds;
    applyTool(plain, 'zoneR', 5, 5, 1);
    const plainSpend = before - plain.funds;

    const permitted = newCity(1);
    permitted.funds = 10000;
    for (const t of permitted.tiles) t.terrain = Terrain.Grass;
    permitted.ordinances['permits'] = true;
    const before2 = permitted.funds;
    applyTool(permitted, 'zoneR', 5, 5, 1);
    expect(before2 - permitted.funds).toBeGreaterThan(plainSpend);
  });
});
