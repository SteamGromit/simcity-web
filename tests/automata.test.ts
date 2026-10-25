import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { idx } from '../src/sim/grid';
import { GRID, Zone } from '../src/sim/types';
import {
  Automata,
  GAP,
  junctionKind,
  MAX_CARS,
  pickBody,
  pickKind,
  routeTo,
  signalPhase,
  SIGNAL_PERIOD,
  STOP_AT,
  targetCars,
  vehicleWeights,
} from '../src/render/automata';
import type { VehicleKind } from '../src/render/automata';
import { clearSprites, setCanvasFactory } from '../src/render/spritecache';
import { makeCity, road, zone } from './helpers';
import { strictCtx, stubCanvasFactory } from './stubctx';

beforeEach(() => {
  setCanvasFactory(stubCanvasFactory().factory);
  clearSprites();
});
afterEach(() => setCanvasFactory(null));

describe('Automata', () => {
  test('cars only ever occupy road tiles, even after demolition', () => {
    const city = makeCity();
    road(city, 10, 10, 30, 10);
    for (let x = 10; x <= 30; x++) city.tiles[idx(x, 10)].traffic = 5;
    const automata = new Automata();
    for (let t = 0; t < 20; t++) automata.step(city, t * 100);
    expect(automata.carCount()).toBeGreaterThan(0);

    // demolish the whole road
    for (let x = 10; x <= 30; x++) {
      city.tiles[idx(x, 10)].zone = Zone.None;
      city.tiles[idx(x, 10)].traffic = 0;
    }
    for (let t = 20; t < 40; t++) automata.step(city, t * 100);
    expect(automata.carCount()).toBe(0);
  });

  test('automata pace with the simulation speed: frozen at 0, moving at 1', () => {
    const city = makeCity();
    road(city, 10, 10, 30, 10);
    for (let x = 10; x <= 30; x++) city.tiles[idx(x, 10)].traffic = 8;
    const automata = new Automata();
    for (let t = 0; t < 20; t++) automata.step(city, t * 100, 1);
    expect(automata.carCount()).toBeGreaterThan(0);

    const positions = () => {
      const { ctx, trace } = strictCtx();
      for (let i = 0; i < GRID * GRID; i++) automata.drawTile(ctx, i);
      return trace.filter((t) => t.startsWith('drawImage(')).join('|');
    };

    automata.step(city, 2100, 1);
    const a = positions();
    automata.step(city, 2200, 0); // paused: time passes, nothing moves
    expect(positions()).toBe(a);
    automata.step(city, 2300, 1); // running again
    expect(positions()).not.toBe(a);
  });

  test('a pandemic empties the streets', () => {
    const city = makeCity();
    road(city, 10, 10, 30, 10);
    for (let x = 10; x <= 30; x++) city.tiles[idx(x, 10)].traffic = 8;
    for (let x = 10; x <= 30; x += 2) zone(city, x, 12, Zone.Residential, 2);
    const automata = new Automata();
    for (let t = 0; t < 20; t++) automata.step(city, t * 100);
    const cars = automata.carCount();
    const peds = automata.pedCount();
    city.disasters.pandemicMonths = 3;
    for (let t = 20; t < 40; t++) automata.step(city, t * 100);
    expect(automata.carCount()).toBeLessThan(cars);
    expect(automata.pedCount()).toBeLessThan(peds);
  });

  test('pedestrians appear on developed lots', () => {
    const city = makeCity();
    zone(city, 5, 5, Zone.Residential, 2);
    const automata = new Automata();
    automata.step(city, 0);
    automata.step(city, 100);
    expect(automata.pedCount()).toBeGreaterThan(0);
  });
});

describe('vehicle mix', () => {
  const bare = [Zone.None, Zone.None, Zone.None, Zone.None];

  test('industry neighbors favor trucks', () => {
    const ind = vehicleWeights([Zone.Industrial, Zone.Industrial, Zone.None, Zone.None]);
    expect(ind.truck).toBeGreaterThan(vehicleWeights(bare).truck);
  });

  test('commerce favors taxis and vans', () => {
    const com = vehicleWeights([Zone.Commercial, Zone.Commercial, Zone.None, Zone.None]);
    expect(com.taxi).toBeGreaterThan(vehicleWeights(bare).taxi);
    expect(com.van).toBeGreaterThan(vehicleWeights(bare).van);
  });

  test('buses only appear near bus stops', () => {
    expect(vehicleWeights(bare).bus).toBe(0);
    expect(vehicleWeights([Zone.BusStop, Zone.None, Zone.None, Zone.None]).bus).toBeGreaterThan(0);
  });

  test('weights are non-negative with a positive total everywhere', () => {
    for (const zones of [bare, [Zone.Residential, Zone.Park, Zone.Road, Zone.School]]) {
      const w = vehicleWeights(zones);
      const total = w.car + w.taxi + w.van + w.truck + w.bus;
      expect(total).toBeGreaterThan(0);
      for (const v of Object.values(w)) expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  test('pickKind honors the dominant weight across the roll range', () => {
    const w = { car: 0, taxi: 0, van: 0, truck: 5, bus: 0 };
    expect(pickKind(w, 0.01)).toBe('truck');
    expect(pickKind(w, 0.99)).toBe('truck');
    expect(pickKind({ ...w, truck: 0, car: 1 }, 0.5)).toBe('car');
  });
});

describe('vehicle bodies', () => {
  test('every kind resolves to a body style for any roll', () => {
    const kinds: VehicleKind[] = ['car', 'taxi', 'van', 'truck', 'bus'];
    for (const kind of kinds) {
      for (let k = 0; k < 20; k++) {
        expect(typeof pickBody(kind, k / 20)).toBe('string');
      }
    }
  });

  test('a roll of exactly 1 stays in range rather than falling off the list', () => {
    expect(pickBody('car', 1)).toBeTruthy();
    expect(pickBody('truck', 0.9999)).toBeTruthy();
  });

  test('cars come in several shapes; a taxi is always a taxi', () => {
    const cars = new Set(Array.from({ length: 20 }, (_, k) => pickBody('car', k / 20)));
    expect(cars.size).toBeGreaterThan(2);
    const taxis = new Set(Array.from({ length: 20 }, (_, k) => pickBody('taxi', k / 20)));
    expect(taxis).toEqual(new Set(['taxi']));
  });

  test('trucks are only ever truck bodies, never a hatchback', () => {
    const truckBodies = new Set(['boxTruck', 'semi', 'flatbed']);
    for (let k = 0; k < 20; k++) expect(truckBodies.has(pickBody('truck', k / 20))).toBe(true);
  });

  test('the same roll always yields the same body', () => {
    expect(pickBody('van', 0.42)).toBe(pickBody('van', 0.42));
  });
});

describe('routes', () => {
  test('a straight road routes from end to end', () => {
    const city = makeCity();
    road(city, 10, 10, 30, 10);
    const path = routeTo(city, idx(10, 10), idx(30, 10))!;
    expect(path).not.toBeNull();
    expect(path[0]).toBe(idx(10, 10));
    expect(path[path.length - 1]).toBe(idx(30, 10));
    expect(path).toHaveLength(21);
  });

  test('no road, no route', () => {
    const city = makeCity();
    road(city, 10, 10, 20, 10);
    road(city, 30, 10, 40, 10);
    expect(routeTo(city, idx(10, 10), idx(40, 10))).toBeNull();
  });

  test('a route never drives against a carriageway', () => {
    const city = makeCity();
    // a four-lane highway: rows 20..23, class 3; the north lanes run west
    for (let y = 20; y <= 23; y++) {
      for (let x = 10; x <= 40; x++) {
        const t = city.tiles[idx(x, y)];
        t.zone = Zone.Road;
        t.road = 3;
        t.median = false;
      }
    }
    // from the west end of a westbound lane to the east end: must cross to an eastbound lane
    const path = routeTo(city, idx(10, 20), idx(40, 20));
    expect(path).not.toBeNull();
    for (let k = 1; k < path!.length; k++) {
      const a = path![k - 1];
      const b = path![k];
      const dx = (b % GRID) - (a % GRID);
      const y = (a / GRID) | 0;
      if (dx !== 0 && y <= 21) expect(dx, `westbound lane at step ${k}`).toBe(-1);
      if (dx !== 0 && y >= 22) expect(dx, `eastbound lane at step ${k}`).toBe(1);
    }
  });
});

describe('driving', () => {
  const straight = () => {
    const city = makeCity();
    road(city, 10, 10, 50, 10);
    return city;
  };
  // wall time only ever moves forward, as it does for the renderer
  let wall = 1000;
  const stepFor = (a: Automata, city: ReturnType<typeof makeCity>, seconds: number) => {
    const n = Math.round(seconds / 0.016);
    for (let k = 1; k <= n; k++) {
      wall += 16;
      a.step(city, wall, 1);
    }
  };

  test('a follower keeps its distance and never passes', () => {
    const city = straight();
    const a = new Automata();
    a.step(city, wall, 1);
    const path = routeTo(city, idx(10, 10), idx(50, 10))!;
    const leader = a.plant(city, path, { kind: 'truck', style: 'semi', s: 0.5 });
    const follower = a.plant(city, path, { kind: 'taxi', s: 0.0 });
    leader.at = 6;
    leader.tile = path[6];
    let minGap = Infinity;
    for (let k = 1; k <= 400; k++) {
      wall += 16;
      a.step(city, wall, 1);
      const gap = leader.at - follower.at + leader.s - follower.s;
      minGap = Math.min(minGap, gap);
      expect(gap, `step ${k}`).toBeGreaterThan(0);
    }
    expect(minGap).toBeGreaterThanOrEqual(GAP - 0.02);
    expect(follower.v).toBeGreaterThan(0);
  });

  test('a signalled crossroads holds a red arm at the line and releases it on green', () => {
    const city = makeCity();
    road(city, 10, 20, 30, 20);
    road(city, 20, 10, 20, 30);
    const j = idx(20, 20);
    expect(junctionKind(city, j)).toBe(4);
    const a = new Automata();
    a.step(city, wall, 1);
    // find a clock at which east-west is green, so a northbound car must wait
    // the start of an east-west window, not somewhere inside one
    let clock = 0;
    while (signalPhase(j, clock) === 'ew') clock += 0.25;
    while (signalPhase(j, clock) !== 'ew') clock += 0.25;
    a.setClock(clock + 0.1);
    const path = routeTo(city, idx(20, 28), idx(20, 12))!;
    const car = a.plant(city, path, { s: 0.2 });
    car.at = 7; // the tile just south of the junction
    car.tile = path[7];
    stepFor(a, city, 3);
    expect(car.tile).toBe(path[7]);
    expect(car.s).toBeLessThanOrEqual(STOP_AT + 0.02);
    expect(car.v).toBeLessThan(0.05);
    // the same car, now with north-south green
    clock = 0;
    while (signalPhase(j, clock) === 'ns') clock += 0.25;
    while (signalPhase(j, clock) !== 'ns') clock += 0.25;
    a.setClock(clock + 0.1);
    stepFor(a, city, 2);
    expect(car.at).toBeGreaterThan(7);
  });

  test('a car with a route drives it to the end and leaves', () => {
    const city = straight();
    const a = new Automata();
    a.step(city, wall, 1);
    const path = routeTo(city, idx(10, 10), idx(20, 10))!;
    a.plant(city, path, { s: 0.5 });
    expect(a.carCount()).toBe(1);
    stepFor(a, city, 12);
    expect(a.carCount()).toBe(0);
  });

  test('a routed car is gone the step after its road is bulldozed', () => {
    const city = straight();
    const a = new Automata();
    a.step(city, wall, 1);
    const path = routeTo(city, idx(10, 10), idx(30, 10))!;
    a.plant(city, path, { s: 0.5 });
    city.tiles[idx(15, 10)].zone = Zone.None;
    wall += 16;
    a.step(city, wall, 1);
    expect(a.carCount()).toBe(0);
  });

  test('the car count follows the traffic, the night and a pandemic', () => {
    expect(targetCars(250, 0, false)).toBe(10);
    expect(targetCars(1e6, 0, false)).toBe(MAX_CARS);
    expect(targetCars(250, 1, false)).toBe(4);
    expect(targetCars(250, 0, true)).toBe(Math.round(10 * 0.25));
    expect(SIGNAL_PERIOD).toBeGreaterThan(0);
  });
});
