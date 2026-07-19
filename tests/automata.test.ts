import { describe, expect, test } from 'vitest';
import { idx } from '../src/sim/grid';
import { Zone } from '../src/sim/types';
import { Automata } from '../src/render/automata';
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
      for (let i = 0; i < 64 * 64; i++) automata.drawTile(ctx, i);
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
