import { describe, expect, test } from 'vitest';
import {
  BORDER_SHARE,
  worldOf,
  DEFAULT_COLS,
  DEFAULT_ROWS,
  GARBAGE_PRICE,
  POWER_PRICE,
  canOpenDeal,
  closeDeal,
  connected,
  dealPrice,
  neighborStateFor,
  newRegion,
  openDeal,
  pruneDeals,
  recordCity,
  regionIndex,
  regionPopulation,
  sharedEdge,
  tileAt,
} from '../src/sim/region';
import { newCity } from '../src/sim/city';
import { idx } from '../src/sim/grid';
import { GRID, Zone } from '../src/sim/types';
import { makeCity } from './helpers';

function region() {
  return newRegion('Twin Valleys', 'twin-valleys', 42);
}

/** Found a tile with the spare capacity a deal needs. */
function found(
  r: ReturnType<typeof region>,
  col: number,
  row: number,
  opts: { power?: number; garbage?: number; population?: number } = {},
) {
  const t = tileAt(r, col, row)!;
  t.founded = true;
  t.name = `City ${col}${row}`;
  t.sparePower = opts.power ?? 0;
  t.spareGarbage = opts.garbage ?? 0;
  t.population = opts.population ?? 0;
  return t;
}

describe('newRegion', () => {
  test('lays out a full grid of unclaimed land', () => {
    const r = region();
    expect(r.cols).toBe(DEFAULT_COLS);
    expect(r.rows).toBe(DEFAULT_ROWS);
    expect(r.tiles).toHaveLength(DEFAULT_COLS * DEFAULT_ROWS);
    expect(r.tiles.every((t) => !t.founded)).toBe(true);
  });

  test('every tile knows where it sits', () => {
    const r = region();
    for (let row = 0; row < r.rows; row++) {
      for (let col = 0; col < r.cols; col++) {
        const t = tileAt(r, col, row)!;
        expect(t.col).toBe(col);
        expect(t.row).toBe(row);
      }
    }
  });

  test('tile seeds differ, so nine cities are not the same map nine times', () => {
    const r = region();
    expect(new Set(r.tiles.map((t) => t.seed)).size).toBe(r.tiles.length);
  });

  test('the same region seed always lays out the same region', () => {
    const a = newRegion('A', 'a', 7);
    const b = newRegion('B', 'b', 7);
    expect(a.tiles.map((t) => t.seed)).toEqual(b.tiles.map((t) => t.seed));
    expect(a.biome).toBe(b.biome);
  });

  test('one biome for the whole region — it is one place, not nine', () => {
    const r = region();
    expect(['temperate', 'desert']).toContain(r.biome);
  });

  test('a region off the map has no tile there', () => {
    const r = region();
    expect(tileAt(r, -1, 0)).toBeNull();
    expect(tileAt(r, r.cols, 0)).toBeNull();
    expect(tileAt(r, 0, r.rows)).toBeNull();
  });
});

describe('sharedEdge', () => {
  test('the tile to the east is reached across the eastern edge', () => {
    const r = region();
    expect(sharedEdge(r, regionIndex(r, 0, 0), regionIndex(r, 1, 0))).toEqual(['e', 'w']);
  });

  test('and the tile to the south across the southern one', () => {
    const r = region();
    expect(sharedEdge(r, regionIndex(r, 0, 0), regionIndex(r, 0, 1))).toEqual(['s', 'n']);
  });

  test('it is symmetric', () => {
    const r = region();
    const a = regionIndex(r, 1, 1);
    const b = regionIndex(r, 1, 0);
    expect(sharedEdge(r, a, b)).toEqual(['n', 's']);
    expect(sharedEdge(r, b, a)).toEqual(['s', 'n']);
  });

  test('tiles that only touch at a corner share no edge', () => {
    const r = region();
    expect(sharedEdge(r, regionIndex(r, 0, 0), regionIndex(r, 1, 1))).toBeNull();
  });

  test('nor do distant tiles, or a tile with itself', () => {
    const r = region();
    expect(sharedEdge(r, regionIndex(r, 0, 0), regionIndex(r, 2, 0))).toBeNull();
    expect(sharedEdge(r, regionIndex(r, 0, 0), regionIndex(r, 0, 0))).toBeNull();
  });
});

describe('connected', () => {
  test('two founded cities whose roads meet at the border are connected', () => {
    const r = region();
    const a = found(r, 0, 0);
    const b = found(r, 1, 0);
    a.edges.e = [30, 31];
    b.edges.w = [31, 40];
    expect(connected(r, regionIndex(r, 0, 0), regionIndex(r, 1, 0))).toBe(true);
  });

  test('roads that reach the border at different places do not meet', () => {
    const r = region();
    found(r, 0, 0).edges.e = [10];
    found(r, 1, 0).edges.w = [50];
    expect(connected(r, regionIndex(r, 0, 0), regionIndex(r, 1, 0))).toBe(false);
  });

  test('a border with no road on one side is not a connection', () => {
    const r = region();
    found(r, 0, 0).edges.e = [10];
    found(r, 1, 0).edges.w = [];
    expect(connected(r, regionIndex(r, 0, 0), regionIndex(r, 1, 0))).toBe(false);
  });

  test('unclaimed land connects to nothing, however its neighbour builds', () => {
    const r = region();
    found(r, 0, 0).edges.e = [10];
    tileAt(r, 1, 0)!.edges.w = [10]; // not founded
    expect(connected(r, regionIndex(r, 0, 0), regionIndex(r, 1, 0))).toBe(false);
  });
});

describe('dealPrice', () => {
  test('power and garbage are priced by the unit', () => {
    expect(dealPrice('power', 100)).toBe(Math.round(100 * POWER_PRICE));
    expect(dealPrice('garbage', 900)).toBe(Math.round(900 * GARBAGE_PRICE));
  });

  test('buying more costs more', () => {
    expect(dealPrice('power', 200)).toBeGreaterThan(dealPrice('power', 100));
  });

  test('importing costs more than running your own plant, or nobody would build one', () => {
    // core:coal_plant is 240 capacity for §150 a month
    expect(dealPrice('power', 240)).toBeGreaterThan(150);
    // core:landfill is 900 tonnes for §40 a month
    expect(dealPrice('garbage', 900)).toBeGreaterThan(40);
  });
});

describe('canOpenDeal', () => {
  test('a neighbour with spare capacity can sell it', () => {
    const r = region();
    found(r, 0, 0, { power: 300 });
    found(r, 1, 0);
    expect(canOpenDeal(r, 'power', regionIndex(r, 0, 0), regionIndex(r, 1, 0), 200)).toBeNull();
  });

  test('you cannot buy from a city that has nothing spare', () => {
    const r = region();
    found(r, 0, 0, { power: 50 });
    found(r, 1, 0);
    expect(canOpenDeal(r, 'power', regionIndex(r, 0, 0), regionIndex(r, 1, 0), 200)).toMatch(/spare/i);
  });

  test('you cannot buy from unclaimed land', () => {
    const r = region();
    found(r, 1, 0);
    expect(canOpenDeal(r, 'power', regionIndex(r, 0, 0), regionIndex(r, 1, 0), 10)).toMatch(/founded/i);
  });

  test('you cannot buy from across the region — only from a neighbour', () => {
    const r = region();
    found(r, 0, 0, { power: 300 });
    found(r, 2, 0);
    expect(canOpenDeal(r, 'power', regionIndex(r, 0, 0), regionIndex(r, 2, 0), 100)).toMatch(/neighbour/i);
  });

  test('a city cannot sell to itself', () => {
    const r = region();
    found(r, 0, 0, { power: 300 });
    const i = regionIndex(r, 0, 0);
    expect(canOpenDeal(r, 'power', i, i, 100)).toBeTruthy();
  });

  test('nor buy nothing', () => {
    const r = region();
    found(r, 0, 0, { power: 300 });
    found(r, 1, 0);
    expect(canOpenDeal(r, 'power', regionIndex(r, 0, 0), regionIndex(r, 1, 0), 0)).toBeTruthy();
  });

  test('one contract per pair per kind — raise the amount instead', () => {
    const r = region();
    found(r, 0, 0, { power: 300 });
    found(r, 1, 0);
    const s = regionIndex(r, 0, 0);
    const b = regionIndex(r, 1, 0);
    openDeal(r, 'power', s, b, 100);
    expect(canOpenDeal(r, 'power', s, b, 100)).toMatch(/already/i);
  });

  test('an existing contract still counts against what is spare', () => {
    const r = region();
    found(r, 0, 0, { power: 300 });
    found(r, 1, 0);
    found(r, 0, 1);
    const s = regionIndex(r, 0, 0);
    openDeal(r, 'power', s, regionIndex(r, 1, 0), 250);
    expect(canOpenDeal(r, 'power', s, regionIndex(r, 0, 1), 100)).toMatch(/spare/i);
  });
});

describe('openDeal and closeDeal', () => {
  test('an opened deal is priced and kept', () => {
    const r = region();
    found(r, 0, 0, { power: 300 });
    found(r, 1, 0);
    const d = openDeal(r, 'power', regionIndex(r, 0, 0), regionIndex(r, 1, 0), 200)!;
    expect(d.price).toBe(dealPrice('power', 200));
    expect(r.deals).toHaveLength(1);
  });

  test('a deal that cannot be struck is not struck', () => {
    const r = region();
    found(r, 0, 0, { power: 10 });
    found(r, 1, 0);
    expect(openDeal(r, 'power', regionIndex(r, 0, 0), regionIndex(r, 1, 0), 200)).toBeNull();
    expect(r.deals).toHaveLength(0);
  });

  test('closing one removes it and leaves the rest alone', () => {
    const r = region();
    found(r, 0, 0, { power: 300, garbage: 900 });
    found(r, 1, 0);
    const s = regionIndex(r, 0, 0);
    const b = regionIndex(r, 1, 0);
    const p = openDeal(r, 'power', s, b, 100)!;
    openDeal(r, 'garbage', s, b, 400);
    closeDeal(r, p.id);
    expect(r.deals.map((d) => d.kind)).toEqual(['garbage']);
  });

  test('closing something that is not there changes nothing', () => {
    const r = region();
    found(r, 0, 0, { power: 300 });
    found(r, 1, 0);
    openDeal(r, 'power', regionIndex(r, 0, 0), regionIndex(r, 1, 0), 100);
    closeDeal(r, 'no-such-deal');
    expect(r.deals).toHaveLength(1);
  });
});

describe('neighborStateFor', () => {
  test('the buyer gains the capacity and pays for it', () => {
    const r = region();
    found(r, 0, 0, { power: 300 });
    found(r, 1, 0);
    const s = regionIndex(r, 0, 0);
    const b = regionIndex(r, 1, 0);
    const d = openDeal(r, 'power', s, b, 200)!;
    const n = neighborStateFor(r, b);
    expect(n.power).toBe(200);
    expect(n.income).toBe(-d.price);
  });

  test('and the seller loses it and is paid', () => {
    const r = region();
    found(r, 0, 0, { power: 300 });
    found(r, 1, 0);
    const s = regionIndex(r, 0, 0);
    const d = openDeal(r, 'power', s, regionIndex(r, 1, 0), 200)!;
    const n = neighborStateFor(r, s);
    expect(n.power).toBe(-200);
    expect(n.income).toBe(d.price);
  });

  test('the region balances: what one city imports another exports', () => {
    const r = region();
    found(r, 0, 0, { power: 300, garbage: 900 });
    found(r, 1, 0);
    const s = regionIndex(r, 0, 0);
    const b = regionIndex(r, 1, 0);
    openDeal(r, 'power', s, b, 150);
    openDeal(r, 'garbage', s, b, 500);
    const total = r.tiles.reduce(
      (acc, _t, i) => {
        const n = neighborStateFor(r, i);
        return {
          power: acc.power + n.power,
          garbage: acc.garbage + n.garbage,
          income: acc.income + n.income,
        };
      },
      { power: 0, garbage: 0, income: 0 },
    );
    expect(total).toEqual({ power: 0, garbage: 0, income: 0 });
  });

  test('a city with no contracts trades nothing', () => {
    const r = region();
    found(r, 0, 0);
    const n = neighborStateFor(r, regionIndex(r, 0, 0));
    expect(n).toMatchObject({ power: 0, garbage: 0, income: 0, jobs: 0, workers: 0 });
  });

  test('a connected neighbour lends its jobs and workers across the border', () => {
    const r = region();
    const a = found(r, 0, 0, { population: 10000 });
    a.jobs = 4000;
    a.edges.e = [30];
    const b = found(r, 1, 0);
    b.edges.w = [30];
    const n = neighborStateFor(r, regionIndex(r, 1, 0));
    expect(n.jobs).toBeGreaterThan(0);
    expect(n.workers).toBeGreaterThan(0);
  });

  test('an unconnected neighbour lends nothing, however big it is', () => {
    const r = region();
    const a = found(r, 0, 0, { population: 100000 });
    a.jobs = 50000;
    a.edges.e = [30];
    found(r, 1, 0).edges.w = [70]; // roads miss each other
    const n = neighborStateFor(r, regionIndex(r, 1, 0));
    expect(n.jobs).toBe(0);
    expect(n.workers).toBe(0);
  });

  test('a tile off the map trades nothing rather than throwing', () => {
    const r = region();
    expect(() => neighborStateFor(r, 999)).not.toThrow();
    expect(neighborStateFor(r, 999).power).toBe(0);
  });
});

describe('pruneDeals', () => {
  test('a seller that lost its plant cannot keep exporting', () => {
    const r = region();
    const seller = found(r, 0, 0, { power: 300 });
    found(r, 1, 0);
    openDeal(r, 'power', regionIndex(r, 0, 0), regionIndex(r, 1, 0), 200);
    seller.sparePower = 0; // the plant burned down
    const dropped = pruneDeals(r);
    expect(dropped).toHaveLength(1);
    expect(r.deals).toHaveLength(0);
  });

  test('a deal the seller can still honour survives', () => {
    const r = region();
    found(r, 0, 0, { power: 300 });
    found(r, 1, 0);
    openDeal(r, 'power', regionIndex(r, 0, 0), regionIndex(r, 1, 0), 200);
    expect(pruneDeals(r)).toHaveLength(0);
    expect(r.deals).toHaveLength(1);
  });

  test('a deal whose city was abandoned goes with it', () => {
    const r = region();
    found(r, 0, 0, { power: 300 });
    const buyer = found(r, 1, 0);
    openDeal(r, 'power', regionIndex(r, 0, 0), regionIndex(r, 1, 0), 200);
    buyer.founded = false;
    expect(pruneDeals(r)).toHaveLength(1);
  });

  test('spare is measured against everything already sold, not each deal alone', () => {
    const r = region();
    const seller = found(r, 0, 0, { power: 500 });
    found(r, 1, 0);
    found(r, 0, 1);
    const s = regionIndex(r, 0, 0);
    openDeal(r, 'power', s, regionIndex(r, 1, 0), 250);
    openDeal(r, 'power', s, regionIndex(r, 0, 1), 250);
    seller.sparePower = 300; // now only enough for one of them
    expect(pruneDeals(r)).toHaveLength(1);
    expect(r.deals).toHaveLength(1);
  });
});

describe('recordCity', () => {
  test('it mirrors what the region map needs without parsing a city again', () => {
    const r = region();
    const city = makeCity();
    city.population = 1234;
    city.funds = 5678;
    city.month = 90;
    recordCity(r, 0, 0, city);
    const t = tileAt(r, 0, 0)!;
    expect(t.founded).toBe(true);
    expect(t.population).toBe(1234);
    expect(t.funds).toBe(5678);
    expect(t.month).toBe(90);
  });

  test('it records where roads reach each edge, so borders can be matched', () => {
    const r = region();
    const city = makeCity();
    for (const [x, y] of [
      [0, 12],
      [GRID - 1, 30],
      [44, 0],
      [45, GRID - 1],
    ]) {
      city.tiles[idx(x, y)].zone = Zone.Road;
    }
    recordCity(r, 1, 1, city);
    const t = tileAt(r, 1, 1)!;
    expect(t.edges.w).toEqual([12]);
    expect(t.edges.e).toEqual([30]);
    expect(t.edges.n).toEqual([44]);
    expect(t.edges.s).toEqual([45]);
  });

  test('a planted median at the border is not a road connection', () => {
    const r = region();
    const city = makeCity();
    const t = city.tiles[idx(0, 20)];
    t.zone = Zone.Road;
    t.median = true;
    recordCity(r, 0, 0, city);
    expect(tileAt(r, 0, 0)!.edges.w).toEqual([]);
  });

  test('recording a city off the map does nothing rather than throwing', () => {
    const r = region();
    expect(() => recordCity(r, 9, 9, makeCity())).not.toThrow();
  });
});

describe('regionPopulation', () => {
  test('it is every founded city added up', () => {
    const r = region();
    found(r, 0, 0, { population: 1000 });
    found(r, 1, 0, { population: 2500 });
    expect(regionPopulation(r)).toBe(3500);
  });

  test('unclaimed land counts for nothing', () => {
    expect(regionPopulation(region())).toBe(0);
  });
});

describe('one world per region', () => {
  test('two tiles of one region share a landscape', () => {
    const r = newRegion('Shire', 'shire', 11, 2, 1);
    const a = newCity(r.tiles[0].seed, r.biome, { world: worldOf(r), col: 0, row: 0 });
    const b = newCity(r.tiles[1].seed, r.biome, { world: worldOf(r), col: 1, row: 0 });
    for (let y = 0; y < GRID; y++) {
      expect(
        Math.abs(a.tiles[idx(GRID - 1, y)].elevation - b.tiles[idx(0, y)].elevation),
      ).toBeLessThanOrEqual(1);
    }
  });

  test('a revived old region still yields a world', () => {
    const r = newRegion('Old', 'old', 3);
    expect(worldOf(r)).toEqual({ seed: 3, cols: 3, rows: 3, biome: r.biome });
  });
});

describe('gates', () => {
  test('one gate per matching border position, shares split evenly', () => {
    const r = newRegion('G', 'g', 1, 2, 1);
    const a = found(r, 0, 0);
    const b = found(r, 1, 0);
    b.jobs = 1000;
    b.population = 2000;
    a.edges.e = [10, 20, 30];
    b.edges.w = [20, 30, 40];
    const s = neighborStateFor(r, 0);
    expect(s.gates.map((g) => g.tile)).toEqual([idx(GRID - 1, 20), idx(GRID - 1, 30)]);
    expect(s.gates[0].jobs).toBe(Math.round((1000 * BORDER_SHARE) / 2));
    expect(s.gates[0].workers).toBe(Math.round((2000 * 0.55 * BORDER_SHARE) / 2));
    expect(s.jobs).toBe(Math.round(1000 * BORDER_SHARE));
    // the other side's gates face west
    expect(neighborStateFor(r, 1).gates.map((g) => g.tile)).toEqual([idx(0, 20), idx(0, 30)]);
  });

  test('no gates without a connection', () => {
    const r = newRegion('G', 'g', 1, 2, 1);
    found(r, 0, 0).edges.e = [10];
    found(r, 1, 0).edges.w = [11];
    expect(neighborStateFor(r, 0).gates).toEqual([]);
  });
});
