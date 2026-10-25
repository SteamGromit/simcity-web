import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { idx } from '../src/sim/grid';
import { GRID, Zone } from '../src/sim/types';
import {
  Automata,
  GAP,
  MAX_PEDS,
  QUEUE_AT_STOP,
  targetPeds,
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
import { dayBand } from '../src/render/daynight';
import { FOOT_IN } from '../src/render/footways';
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
    const n = automata.carCount();
    automata.step(city, 2200, 0); // paused: time passes, nothing moves, nothing spawns
    expect(automata.carCount()).toBe(n);
    expect(positions()).toBe(a);
    automata.step(city, 2300, 1); // running again
    expect(positions()).not.toBe(a);
  });

  test('a pandemic empties the streets', () => {
    const city = makeCity();
    road(city, 10, 10, 30, 10);
    for (let x = 10; x <= 30; x++) city.tiles[idx(x, 10)].traffic = 8;
    for (let x = 10; x <= 30; x += 2) zone(city, x, 11, Zone.Residential, 4);
    const automata = new Automata();
    for (let t = 0; t < 20; t++) automata.step(city, t * 100);
    const cars = automata.carCount();
    const peds = automata.pedCount();
    city.disasters.pandemicMonths = 3;
    for (let t = 20; t < 40; t++) automata.step(city, t * 100);
    expect(automata.carCount()).toBeLessThan(cars);
    expect(automata.pedCount()).toBeLessThan(peds);
  });

  test('pedestrians appear on developed lots beside a street', () => {
    const city = makeCity();
    road(city, 3, 6, 8, 6);
    zone(city, 5, 5, Zone.Residential, 6);
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

  test('two stem cars crossing a double-width street do not wait on each other', () => {
    // two parallel streets: every interior tile is a T, and a car crossing from
    // one to the other is a stem car whose junction tile may hold the other
    // car, itself a stem car waiting on the first
    const city = makeCity();
    road(city, 10, 5, 10, 15);
    road(city, 11, 5, 11, 15);
    expect(junctionKind(city, idx(10, 10))).toBe(3);
    expect(junctionKind(city, idx(11, 10))).toBe(3);
    const a = new Automata();
    a.step(city, wall, 1);
    const east = a.plant(city, [idx(10, 10), idx(11, 10), idx(11, 11)], { s: 0.6 });
    const west = a.plant(city, [idx(11, 10), idx(10, 10), idx(10, 9)], { s: 0.6 });
    stepFor(a, city, 2); // well under MAX_WAIT: the direction rule, not the timeout, clears them
    expect(east.at).toBeGreaterThanOrEqual(1);
    expect(west.at).toBeGreaterThanOrEqual(1);
  });

  test('a fire on the station\'s own kerb does not block the engine for a fire further on', () => {
    const city = makeCity();
    road(city, 10, 10, 30, 10);
    const station = city.tiles[idx(12, 11)];
    station.zone = Zone.FireStation;
    station.powered = true;
    city.tiles[idx(12, 9)].burning = 3; // shares the station's kerb tile (12,10)
    city.tiles[idx(25, 9)].burning = 3;
    const a = new Automata();
    stepFor(a, city, 1);
    const engines = a.carsNow().filter((c) => c.role === 'fire');
    expect(engines).toHaveLength(1);
    expect(engines[0].stops[0].fireTile).toBe(idx(25, 9));
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

describe('people', () => {
  let wall = 5000;
  const stepFor = (a: Automata, city: ReturnType<typeof makeCity>, seconds: number) => {
    const n = Math.round(seconds / 0.016);
    for (let k = 1; k <= n; k++) {
      wall += 16;
      a.step(city, wall, 1);
    }
  };
  const street = () => {
    const city = makeCity();
    road(city, 10, 10, 30, 10);
    for (let x = 12; x <= 28; x++) {
      zone(city, x, 9, Zone.Residential, 2);
      zone(city, x, 11, x % 3 ? Zone.Residential : Zone.Commercial, 2);
    }
    return city;
  };

  test('the hour bands', () => {
    expect([0, 0.1, 0.2, 0.45, 0.7, 0.97].map(dayBand)).toEqual(['midday', 'midday', 'evening', 'night', 'morning', 'midday']);
  });

  test('the crowd follows the hour, the lots and a pandemic', () => {
    expect(targetPeds(100, 50, 'morning', false)).toBe(55);
    expect(targetPeds(100, 50, 'night', false)).toBe(10);
    expect(targetPeds(100, 50, 'morning', true)).toBe(9);
    expect(targetPeds(5000, 2000, 'midday', false)).toBe(Math.round(MAX_PEDS * 0.85));
    expect(targetPeds(5000, 2000, 'night', false)).toBe(Math.round(MAX_PEDS * 0.25));
  });

  test('people walk the kerbs, never the carriageway, and come and go by the doors', () => {
    const city = street();
    const a = new Automata();
    stepFor(a, city, 6);
    const peds = a.pedsNow();
    expect(peds.length).toBeGreaterThan(5);
    expect(peds.length).toBeLessThanOrEqual(MAX_PEDS);
    let walking = 0;
    for (const p of peds) {
      expect(p.mode).not.toBe('park');
      const l = p.leg!;
      const x = l.on % GRID;
      const y = (l.on / GRID) | 0;
      const wx = l.p0[0] + (l.p1[0] - l.p0[0]) * p.s;
      const wy = l.p0[1] + (l.p1[1] - l.p0[1]) * p.s;
      expect(city.tiles[l.on].zone).toBe(Zone.Road);
      expect(wx).toBeGreaterThanOrEqual(x - 1e-9);
      expect(wx).toBeLessThanOrEqual(x + 1 + 1e-9);
      if (l.kind === 'foot') {
        walking++;
        // this street runs east-west: a kerb walker is FOOT_IN inside the north or south edge
        const inset = Math.min(wy - y, y + 1 - wy);
        expect(inset).toBeCloseTo(FOOT_IN, 6);
      } else if (l.kind === 'door') {
        expect(Math.abs(wx - x - 0.5)).toBeLessThan(1e-6); // at the door, mid-lot
      }
    }
    expect(walking).toBeGreaterThan(0);
    // some of the first wave have gone indoors by now, so the fleet turns over
    const early = new Set(peds);
    stepFor(a, city, 40);
    expect(a.pedsNow().some((p) => !early.has(p))).toBe(true);
    expect(a.pedsNow().length).toBeLessThanOrEqual(MAX_PEDS);
  });

  test('most people step out of doors the player can see', () => {
    const city = street();
    const a = new Automata();
    a.setView(0, 2, { x0: 18, y0: 0, x1: 26, y1: 20 }); // nine of the seventeen lots along each side
    stepFor(a, city, 3);
    expect(a.pedsNow().length).toBeGreaterThan(8);
    const within = (lo: number, hi: number) =>
      a.pedsNow().filter((p) => {
        const x = p.leg!.on % GRID;
        return x >= lo && x <= hi;
      }).length / a.pedsNow().length;
    // the crowd here is sixteen people, so one walker is six points: average
    // twenty samples over five seconds rather than read one frame
    const share = (lo: number, hi: number) => {
      let t = 0;
      for (let k = 0; k < 20; k++) {
        stepFor(a, city, 0.25);
        t += within(lo, hi);
      }
      return t / 20;
    };
    // by chance alone it would be about half; three in four spawn in view and
    // the recycle keeps at least SEEN_SHARE of the crowd on screen
    expect(share(18, 26)).toBeGreaterThan(0.55);
    // the view moves: within a few seconds the crowd has followed it
    a.setView(0, 2, { x0: 10, y0: 0, x1: 18, y1: 20 });
    stepFor(a, city, 5);
    expect(share(10, 18)).toBeGreaterThan(0.5);
  });

  test('the walkers are gone the step after their street is bulldozed', () => {
    const city = street();
    const a = new Automata();
    stepFor(a, city, 3);
    expect(a.pedCount()).toBeGreaterThan(0);
    for (let x = 10; x <= 30; x++) city.tiles[idx(x, 10)].zone = Zone.None;
    wall += 16;
    a.step(city, wall, 1);
    expect(a.pedCount()).toBe(0);
  });

  test('lots with no street have no doors, so nobody comes out', () => {
    const city = makeCity();
    for (let x = 12; x <= 20; x++) zone(city, x, 9, Zone.Residential, 3);
    const a = new Automata();
    stepFor(a, city, 2);
    expect(a.pedCount()).toBe(0);
  });

  test('people queue at a bus stop, board when the bus dwells, and give up when the line goes', () => {
    const city = street();
    for (const x of [15, 25]) {
      const t = city.tiles[idx(x, 11)];
      t.zone = Zone.BusStop;
      t.stage = 0;
    }
    const path: [number, number][] = [];
    for (let x = 10; x <= 30; x++) path.push([x, 10]);
    city.transitLines.push({ id: 1, mode: Zone.BusStop, color: '#2fa38f', path, stops: [[15, 11], [25, 11]] });
    const a = new Automata();
    let t = 0;
    let maxQ = 0;
    let boarded = false;
    const tick = () => {
      wall += 16;
      t += 0.016;
      a.setView(0, 2, null, t);
      a.step(city, wall, 1);
    };
    for (let k = 0; k < 2500; k++) {
      tick();
      const q = a.pedsNow().filter((p) => p.mode === 'wait').length;
      maxQ = Math.max(maxQ, q);
      if (a.pedsNow().some((p) => p.mode === 'board')) boarded = true;
    }
    expect(maxQ).toBeGreaterThan(0);
    expect(maxQ).toBeLessThanOrEqual(2 * QUEUE_AT_STOP);
    expect(boarded).toBe(true);
    for (const p of a.pedsNow().filter((p) => p.mode === 'wait')) {
      expect([idx(15, 10), idx(25, 10)]).toContain(p.leg!.on);
      expect(p.leg!.p0[1]).toBeCloseTo(11 - FOOT_IN, 6); // on the south kerb, in front of the stop
    }
    city.transitLines.length = 0;
    for (let k = 0; k < 120; k++) tick();
    expect(a.pedsNow().filter((p) => p.mode === 'wait' || p.mode === 'board')).toHaveLength(0);
  });

  test('a park keeps a few people on its paths', () => {
    const city = street();
    for (let x = 14; x <= 16; x++) zone(city, x, 12, Zone.Park);
    const a = new Automata();
    stepFor(a, city, 4);
    const parkers = a.pedsNow().filter((p) => p.mode === 'park');
    expect(parkers.length).toBeGreaterThan(0);
    for (const p of parkers) {
      expect(city.tiles[p.tile].zone).toBe(Zone.Park);
      expect(Math.max(Math.abs(p.du), Math.abs(p.dv))).toBeLessThanOrEqual(0.46 + 1e-9);
    }
  });
});
