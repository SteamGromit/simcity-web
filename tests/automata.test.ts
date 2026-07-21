import { describe, expect, test } from 'vitest';
import { idx } from '../src/sim/grid';
import { GRID, Zone } from '../src/sim/types';
import { Automata, pickKind, vehicleWeights } from '../src/render/automata';
import { makeCity, road, zone } from './helpers';

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
      const calls: [number, number][] = [];
      const ctx = {
        save() {},
        restore() {},
        rotate() {},
        fillRect() {},
        fillStyle: '',
        translate(x: number, y: number) {
          calls.push([x, y]);
        },
      } as unknown as CanvasRenderingContext2D;
      for (let i = 0; i < GRID * GRID; i++) automata.drawTile(ctx, i);
      return JSON.stringify(calls);
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
