import { beforeEach, describe, expect, test } from 'vitest';
import { registerPack, resetRegistry, slotOf } from '../src/content/registry';
import { ensureCoreContent } from '../src/sim/content';
import { idx } from '../src/sim/grid';
import { updateCoverage } from '../src/sim/services';
import { updatePower } from '../src/sim/power';
import { updatePollution } from '../src/sim/pollution';
import { updateLandValue } from '../src/sim/landvalue';
import { demandReading, developTile } from '../src/sim/develop';
import { garbageOf, updateWasteMonthly } from '../src/sim/waste';
import { CityState, Zone } from '../src/sim/types';
import { clearLand, makeCity, zone } from './helpers';

/**
 * A disposal building registered as a mod, so these tests describe the
 * mechanism rather than whatever the core landfill's numbers happen to be.
 */
function dump(capacity: number, opts: { divert?: number; radius?: number } = {}): Zone {
  const r = registerPack({
    id: 'waste-test',
    name: 'Waste Test',
    version: '1.0.0',
    buildings: [
      {
        id: 'wt:dump',
        name: 'Test Dump',
        tool: 'wt__dump',
        cost: 10,
        upkeep: 1,
        service: { kind: 'garbage', radius: opts.radius ?? 6 },
        waste: { capacity, divert: opts.divert },
      },
    ],
  });
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return slotOf('wt:dump')! as Zone;
}

/** Bring coverage and power up to date, then run a month of waste. */
function settle(city: CityState): void {
  updatePower(city);
  updateCoverage(city);
  updateWasteMonthly(city);
}

/** A developed residential tile at (x,y). */
function home(city: CityState, x: number, y: number, stage = 3): void {
  zone(city, x, y, Zone.Residential);
  city.tiles[idx(x, y)].stage = stage as never;
}

function base(): CityState {
  const city = makeCity();
  clearLand(city);
  return city;
}

beforeEach(() => {
  resetRegistry();
  ensureCoreContent();
});

describe('garbage production', () => {
  test('a developed home produces; an empty lot and an abandoned one do not', () => {
    const city = base();
    home(city, 10, 10);
    zone(city, 11, 10, Zone.Residential); // stage 0
    home(city, 12, 10);
    city.tiles[idx(12, 10)].abandoned = true;

    expect(garbageOf(city, city.tiles[idx(10, 10)])).toBeGreaterThan(0);
    expect(garbageOf(city, city.tiles[idx(11, 10)])).toBe(0);
    expect(garbageOf(city, city.tiles[idx(12, 10)])).toBe(0);
  });

  test('a taller building produces more', () => {
    const city = base();
    home(city, 10, 10, 1);
    home(city, 12, 10, 5);
    expect(garbageOf(city, city.tiles[idx(12, 10)])).toBeGreaterThan(
      garbageOf(city, city.tiles[idx(10, 10)]),
    );
  });

  test('roads and civic buildings produce nothing', () => {
    const city = base();
    zone(city, 10, 10, Zone.Road);
    zone(city, 11, 10, Zone.FireStation);
    expect(garbageOf(city, city.tiles[idx(10, 10)])).toBe(0);
    expect(garbageOf(city, city.tiles[idx(11, 10)])).toBe(0);
  });
});

describe('collection', () => {
  test('with a powered dump in range and spare capacity, nothing piles up', () => {
    const city = base();
    const slot = dump(10_000);
    zone(city, 9, 10, Zone.PowerPlant);
    zone(city, 10, 10, slot);
    home(city, 11, 10);

    settle(city);

    expect(city.tiles[idx(11, 10)].garbage).toBe(0);
    expect(city.waste.uncollected).toBe(0);
    expect(city.waste.collected).toBeGreaterThan(0);
  });

  test('with nowhere to take it, every producing tile piles up', () => {
    const city = base();
    home(city, 10, 10);
    home(city, 20, 20);

    settle(city);

    expect(city.tiles[idx(10, 10)].garbage).toBeGreaterThan(0);
    expect(city.tiles[idx(20, 20)].garbage).toBeGreaterThan(0);
    expect(city.waste.capacity).toBe(0);
    expect(city.waste.collected).toBe(0);
  });

  test('a tile outside every radius piles up while a covered one stays clean', () => {
    const city = base();
    const slot = dump(10_000, { radius: 4 });
    zone(city, 9, 10, Zone.PowerPlant);
    zone(city, 10, 10, slot);
    home(city, 12, 10); // inside
    home(city, 40, 40); // far outside

    settle(city);

    expect(city.tiles[idx(12, 10)].garbage).toBe(0);
    expect(city.tiles[idx(40, 40)].garbage).toBeGreaterThan(0);
  });

  test('an unpowered dump collects nothing and offers no capacity', () => {
    const city = base();
    const slot = dump(10_000);
    zone(city, 10, 10, slot); // no plant anywhere
    home(city, 11, 10);

    settle(city);

    expect(city.waste.capacity).toBe(0);
    expect(city.tiles[idx(11, 10)].garbage).toBeGreaterThan(0);
  });
});

describe('capacity', () => {
  test('over capacity, the shortfall is shared across covered tiles', () => {
    const city = base();
    zone(city, 9, 10, Zone.PowerPlant);
    home(city, 11, 10);
    home(city, 12, 10);
    const per = garbageOf(city, city.tiles[idx(11, 10)]);

    // room for roughly half of what the two homes put out
    const slot = dump(per);
    zone(city, 10, 10, slot);

    settle(city);

    const a = city.tiles[idx(11, 10)].garbage;
    const b = city.tiles[idx(12, 10)].garbage;
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(0);
    expect(a).toBeCloseTo(b, 5); // shared evenly, not one buried and one clean
    expect(city.waste.uncollected).toBeGreaterThan(0);
  });

  test('capacity sums across several dumps', () => {
    const city = base();
    const slot = dump(500);
    zone(city, 9, 10, Zone.PowerPlant);
    zone(city, 10, 10, slot);
    zone(city, 8, 10, slot);
    settle(city);
    expect(city.waste.capacity).toBe(1000);
  });
});

describe('recycling', () => {
  test('a diverting building removes tonnage before disposal', () => {
    const city = base();
    const slot = dump(10_000, { divert: 0.25 });
    zone(city, 9, 10, Zone.PowerPlant);
    zone(city, 10, 10, slot);
    home(city, 11, 10);

    settle(city);

    expect(city.waste.diverted).toBeGreaterThan(0);
    expect(city.waste.diverted).toBeCloseTo(city.waste.produced * 0.25, 5);
    expect(city.waste.collected).toBeCloseTo(city.waste.produced - city.waste.diverted, 5);
  });

  test('diversion is capped so a city can never recycle everything', () => {
    const city = base();
    const slot = dump(10_000, { divert: 0.5 });
    zone(city, 9, 10, Zone.PowerPlant);
    for (const [x, y] of [[10, 10], [8, 10], [10, 12], [8, 12]] as const) zone(city, x, y, slot);
    home(city, 11, 10);

    settle(city);

    expect(city.waste.diverted).toBeLessThan(city.waste.produced);
  });

  test('the production modifier lowers what is produced at all', () => {
    const city = base();
    home(city, 10, 10);
    settle(city);
    const plain = city.waste.produced;

    const city2 = base();
    home(city2, 10, 10);
    registerPack({
      id: 'ord', name: 'Ord', version: '1',
      ordinances: [
        { id: 'ord:sort', label: 'Sort', blurb: 'x', cost: 1, effects: { 'garbage.production': 0.5 } },
      ],
    });
    city2.ordinances['ord:sort'] = true;
    settle(city2);

    expect(city2.waste.produced).toBeCloseTo(plain * 0.5, 5);
  });
});

describe('heaps settle over time', () => {
  test('a heap grows month over month while nothing collects it', () => {
    const city = base();
    home(city, 10, 10);
    settle(city);
    const first = city.tiles[idx(10, 10)].garbage;
    settle(city);
    expect(city.tiles[idx(10, 10)].garbage).toBeGreaterThan(first);
  });

  test('a heap clears once capacity arrives, but not instantly', () => {
    const city = base();
    home(city, 10, 10);
    for (let i = 0; i < 6; i++) settle(city);
    const piled = city.tiles[idx(10, 10)].garbage;
    expect(piled).toBeGreaterThan(0);

    const slot = dump(10_000);
    zone(city, 9, 10, Zone.PowerPlant);
    zone(city, 10, 11, slot);

    settle(city);
    const after = city.tiles[idx(10, 10)].garbage;
    expect(after).toBeLessThan(piled);
    expect(after).toBeGreaterThan(0); // gradual, not a snap to clean

    for (let i = 0; i < 20; i++) settle(city);
    expect(city.tiles[idx(10, 10)].garbage).toBe(0);
  });

  test('a heap never exceeds 1', () => {
    const city = base();
    home(city, 10, 10, 7);
    for (let i = 0; i < 200; i++) settle(city);
    expect(city.tiles[idx(10, 10)].garbage).toBe(1);
  });
});

describe('the waste ledger', () => {
  test('what is produced is either diverted, collected, or left behind', () => {
    const city = base();
    const slot = dump(1, { divert: 0.2 }); // deliberately far too small
    zone(city, 9, 10, Zone.PowerPlant);
    zone(city, 10, 10, slot);
    home(city, 11, 10);
    home(city, 12, 10);

    settle(city);

    const { produced, diverted, collected, uncollected } = city.waste;
    expect(produced).toBeGreaterThan(0);
    expect(diverted + collected + uncollected).toBeCloseTo(produced, 5);
  });

  test('an empty city reports an empty ledger', () => {
    const city = base();
    settle(city);
    expect(city.waste).toEqual({
      produced: 0, diverted: 0, capacity: 0, collected: 0, uncollected: 0,
    });
  });
});

describe('what a heap does to the neighbourhood', () => {
  /** Two identical cities; only the heap differs. */
  function pair(): [CityState, CityState] {
    const mk = () => {
      const c = base();
      home(c, 10, 10);
      return c;
    };
    return [mk(), mk()];
  }

  test('rubbish in the street pollutes', () => {
    const [clean, dirty] = pair();
    dirty.tiles[idx(10, 10)].garbage = 1;
    updatePollution(clean);
    updatePollution(dirty);
    expect(dirty.tiles[idx(10, 10)].pollution).toBeGreaterThan(
      clean.tiles[idx(10, 10)].pollution,
    );
  });

  test('a landfill pollutes on its own account, heap or no heap', () => {
    const city = base();
    zone(city, 9, 10, Zone.PowerPlant);
    zone(city, 10, 10, Zone.Landfill);
    updatePollution(city);
    expect(city.tiles[idx(10, 10)].pollution).toBeGreaterThan(0);
  });

  test('it drags land value down', () => {
    const [clean, dirty] = pair();
    dirty.tiles[idx(10, 10)].garbage = 1;
    for (const c of [clean, dirty]) {
      updatePollution(c);
      updateLandValue(c);
    }
    expect(dirty.tiles[idx(10, 10)].landValue).toBeLessThan(
      clean.tiles[idx(10, 10)].landValue,
    );
  });

  test('it takes the pressure out of growth', () => {
    const [clean, dirty] = pair();
    dirty.tiles[idx(10, 10)].garbage = 1;
    for (const c of [clean, dirty]) {
      c.demand.r = 1;
      c.tiles[idx(10, 10)].powered = true;
      zone(c, 10, 11, Zone.Road);
      updatePollution(c);
      updateLandValue(c);
    }
    const a = demandReading(clean, 10, 10)!.pressure;
    const b = demandReading(dirty, 10, 10)!.pressure;
    expect(b).toBeLessThan(a);
  });

  test('a clean, collected city is not penalised at all', () => {
    const city = base();
    const slot = dump(10_000);
    zone(city, 9, 10, Zone.PowerPlant);
    zone(city, 10, 10, slot);
    home(city, 11, 10);
    settle(city);
    expect(city.tiles[idx(11, 10)].garbage).toBe(0);
  });
});

describe('growth needs a collection round', () => {
  /** A well-served block at stage 3, ready to reach for stage 4. */
  function servedBlock(withPickup: boolean): CityState {
    const city = base();
    zone(city, 9, 10, Zone.PowerPlant);
    zone(city, 10, 10, Zone.FireStation);
    zone(city, 10, 11, Zone.PoliceStation);
    zone(city, 10, 12, Zone.School);
    zone(city, 10, 13, Zone.Hospital);
    if (withPickup) zone(city, 10, 14, Zone.Landfill);
    zone(city, 11, 9, Zone.Road);
    home(city, 11, 10, 3);
    const t = city.tiles[idx(11, 10)];
    t.density = 3; // low-density zoning caps at stage 3 on its own
    t.watered = true;
    t.landValue = 1;
    city.demand.r = 1;
    updatePower(city);
    updateCoverage(city);
    return city;
  }

  test('stage 4 is refused with no rubbish collection', () => {
    const city = servedBlock(false);
    const t = city.tiles[idx(11, 10)];
    expect(t.garbageCov).toBe(0);
    for (let i = 0; i < 200; i++) developTile(city, 11, 10, () => 0.01);
    expect(t.stage).toBe(3);
  });

  test('and allowed once a landfill covers the block', () => {
    const city = servedBlock(true);
    const t = city.tiles[idx(11, 10)];
    expect(t.garbageCov).toBeGreaterThan(0);
    for (let i = 0; i < 200; i++) {
      developTile(city, 11, 10, () => 0.01);
      t.watered = true;
      t.landValue = 1;
    }
    expect(t.stage).toBeGreaterThan(3);
  });
});
