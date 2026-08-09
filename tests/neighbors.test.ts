import { describe, expect, test } from 'vitest';
import { collectBudget } from '../src/sim/budget';
import { updateDemand } from '../src/sim/demand';
import { powerSupply, updatePower } from '../src/sim/power';
import { updateWasteMonthly, wasteSupply } from '../src/sim/waste';
import { idx } from '../src/sim/grid';
import { Zone } from '../src/sim/types';
import { clearLand, makeCity, zone } from './helpers';

/**
 * A town whose houses draw more power than its one plant can make. The coal
 * plant carries 240 consumers, so this lays comfortably more than that in one
 * connected block, which conducts without any wires needing to be strung.
 */
function brownedOut() {
  const city = makeCity();
  clearLand(city);
  zone(city, 10, 10, Zone.PowerPlant); // core:coal_plant, 240 capacity
  for (let x = 10; x < 30; x++) {
    for (let y = 10; y < 30; y++) {
      if (x === 10 && y === 10) continue; // the plant itself
      const t = city.tiles[idx(x, y)];
      t.zone = Zone.Residential;
      t.stage = 1;
    }
  }
  return city;
}

describe('imported power', () => {
  test('power bought from a neighbour lights lots the plant could not', () => {
    const city = brownedOut();
    updatePower(city);
    const dark = city.brownouts;
    expect(dark).toBeGreaterThan(0);

    city.neighbors.power = dark;
    updatePower(city);
    expect(city.brownouts).toBe(0);
  });

  test('power sold to a neighbour is really gone', () => {
    const city = makeCity();
    clearLand(city);
    zone(city, 10, 10, Zone.PowerPlant);
    for (let x = 11; x < 40; x++) {
      const t = city.tiles[idx(x, 10)];
      t.zone = Zone.Residential;
      t.stage = 1;
    }
    updatePower(city);
    expect(city.brownouts).toBe(0);

    city.neighbors.power = -235; // sell nearly the whole plant
    updatePower(city);
    expect(city.brownouts).toBeGreaterThan(0);
  });

  test('a city with no contracts is unaffected', () => {
    const a = brownedOut();
    const b = brownedOut();
    updatePower(a);
    b.neighbors.power = 0;
    updatePower(b);
    expect(b.brownouts).toBe(a.brownouts);
  });
});

describe('powerSupply', () => {
  test('it reports what the plants make and what the city draws', () => {
    const city = makeCity();
    clearLand(city);
    zone(city, 10, 10, Zone.PowerPlant);
    for (let x = 11; x < 21; x++) {
      const t = city.tiles[idx(x, 10)];
      t.zone = Zone.Residential;
      t.stage = 1;
    }
    const s = powerSupply(city);
    expect(s.capacity).toBe(240);
    expect(s.demand).toBe(10);
    expect(s.spare).toBe(230);
  });

  test('spare is measured before contracts, so a megawatt is never sold twice', () => {
    const city = makeCity();
    clearLand(city);
    zone(city, 10, 10, Zone.PowerPlant);
    const before = powerSupply(city).spare;
    city.neighbors.power = -100; // already selling 100
    expect(powerSupply(city).spare).toBe(before);
  });

  test('a city with no plant has nothing to sell', () => {
    expect(powerSupply(makeCity()).spare).toBe(0);
  });
});

describe('exported and imported refuse', () => {
  /** A town that makes more rubbish than it can bury. */
  function overflowing() {
    const city = makeCity();
    clearLand(city);
    zone(city, 5, 5, Zone.PowerPlant);
    for (let x = 10; x < 70; x++) {
      for (let y = 10; y < 20; y++) {
        const t = city.tiles[idx(x, y)];
        t.zone = Zone.Residential;
        t.stage = 3;
        t.powered = true;
        t.garbageCov = 1;
      }
    }
    return city;
  }

  test('capacity bought from a neighbour takes refuse the city could not', () => {
    const city = overflowing();
    updateWasteMonthly(city);
    const left = city.waste.uncollected;
    expect(left).toBeGreaterThan(0);

    city.neighbors.garbage = city.waste.produced * 2;
    updateWasteMonthly(city);
    expect(city.waste.uncollected).toBeLessThan(left);
  });

  test('capacity sold to a neighbour leaves less for home', () => {
    const city = overflowing();
    const landfill = city.tiles[idx(40, 40)];
    landfill.zone = Zone.Landfill;
    landfill.powered = true;
    updateWasteMonthly(city);
    const collected = city.waste.collected;

    city.neighbors.garbage = -800;
    updateWasteMonthly(city);
    expect(city.waste.collected).toBeLessThan(collected);
  });

  test('an export can never drive the city below no capacity at all', () => {
    const city = overflowing();
    city.neighbors.garbage = -99999;
    expect(() => updateWasteMonthly(city)).not.toThrow();
    expect(city.waste.capacity).toBeGreaterThanOrEqual(0);
  });

  test('wasteSupply measures spare before contracts', () => {
    const city = makeCity();
    clearLand(city);
    const landfill = city.tiles[idx(40, 40)];
    landfill.zone = Zone.Landfill;
    landfill.powered = true;
    const before = wasteSupply(city).spare;
    city.neighbors.garbage = -300;
    expect(wasteSupply(city).spare).toBe(before);
    expect(before).toBeGreaterThan(0);
  });
});

describe('the budget line', () => {
  test('money from a neighbour lands in the report and in the bank', () => {
    const city = makeCity();
    clearLand(city);
    city.neighbors.income = 500;
    const funds = city.funds;
    const report = collectBudget(city);
    expect(report.neighbors).toBe(500);
    expect(city.funds).toBe(funds + report.net);
  });

  test('paying a neighbour shows as a negative line, not as an expense', () => {
    const city = makeCity();
    clearLand(city);
    city.neighbors.income = -300;
    const report = collectBudget(city);
    expect(report.neighbors).toBe(-300);
    expect(report.expenses).toBe(0);
  });

  test('the net is the tax lines plus the neighbours less the expenses', () => {
    const city = makeCity();
    clearLand(city);
    city.neighbors.income = -250;
    const r = collectBudget(city);
    expect(r.net).toBe(r.rIncome + r.cIncome + r.iIncome + r.neighbors - r.expenses);
  });

  test('a city with no contracts reports nothing there', () => {
    const city = makeCity();
    clearLand(city);
    expect(collectBudget(city).neighbors).toBe(0);
  });
});

describe('cross-border demand', () => {
  /**
   * A town with all three sectors already built out, so none of the three
   * demands is sitting against its clamp — otherwise a neighbour cannot push
   * any of them higher and the test proves nothing.
   */
  function town() {
    const city = makeCity();
    clearLand(city);
    for (let x = 10; x < 40; x++) {
      for (let y = 10; y < 14; y++) {
        const t = city.tiles[idx(x, y)];
        t.zone =
          y < 11 ? Zone.Residential : y < 13 ? Zone.Commercial : Zone.Industrial;
        t.stage = 3;
      }
    }
    return city;
  }

  /** Houses and nothing to do: residential demand has nowhere to go but up. */
  function bedroom() {
    const city = makeCity();
    clearLand(city);
    for (let x = 10; x < 50; x++) {
      const t = city.tiles[idx(x, 10)];
      t.zone = Zone.Residential;
      t.stage = 2;
    }
    return city;
  }

  test('jobs next door make this a place people want to live', () => {
    const alone = bedroom();
    updateDemand(alone);
    expect(alone.demand.r).toBeLessThan(1); // the fixture must leave room to rise
    const joined = bedroom();
    joined.neighbors.jobs = 4000;
    updateDemand(joined);
    expect(joined.demand.r).toBeGreaterThan(alone.demand.r);
  });

  test('workers next door are customers and hands', () => {
    const alone = town();
    updateDemand(alone);
    const joined = town();
    joined.neighbors.workers = 5000;
    updateDemand(joined);
    expect(joined.demand.c).toBeGreaterThan(alone.demand.c);
    expect(joined.demand.i).toBeGreaterThan(alone.demand.i);
  });

  test('an unconnected city is exactly as it was before regions existed', () => {
    const a = town();
    const b = town();
    updateDemand(a);
    updateDemand(b);
    expect(b.demand).toEqual(a.demand);
  });

  test('demand stays inside its bounds however big the neighbour', () => {
    const city = town();
    city.neighbors.jobs = 10_000_000;
    city.neighbors.workers = 10_000_000;
    updateDemand(city);
    for (const v of [city.demand.r, city.demand.c, city.demand.i]) {
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
