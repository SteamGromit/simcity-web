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

  test('pedestrians appear on developed lots', () => {
    const city = makeCity();
    zone(city, 5, 5, Zone.Residential, 2);
    const automata = new Automata();
    automata.step(city, 0);
    automata.step(city, 100);
    expect(automata.pedCount()).toBeGreaterThan(0);
  });
});
