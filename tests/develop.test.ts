import { describe, expect, test } from 'vitest';
import { idx } from '../src/sim/grid';
import { CityState, Zone } from '../src/sim/types';
import { developTile, demandReading } from '../src/sim/develop';
import { makeCity, zone } from './helpers';

const always = () => 0; // rand() < p always fires for any p > 0

/** Zoned tile at (5,5) with a road at (5,6), fully serviced; caller tweaks fields. */
function setup(z: Zone, stage: 0 | 1 | 2 | 3 = 0): CityState {
  const city = makeCity();
  zone(city, 5, 5, z, stage);
  zone(city, 5, 6, Zone.Road);
  const t = city.tiles[idx(5, 5)];
  t.powered = true;
  t.landValue = 0.5;
  t.commute = 3;
  t.fireCov = 1;
  t.policeCov = 1;
  t.schoolCov = 1;
  t.watered = true;
  return city;
}

describe('developTile', () => {
  test('an eligible zone with positive demand builds stage 1', () => {
    const city = setup(Zone.Residential);
    city.demand.r = 0.5;
    developTile(city, 5, 5, always);
    expect(city.tiles[idx(5, 5)].stage).toBe(1);
  });

  test('buildings grow a stage at a time when land value allows', () => {
    const city = setup(Zone.Residential, 1);
    city.demand.r = 0.8;
    city.tiles[idx(5, 5)].landValue = 0.45;
    developTile(city, 5, 5, always);
    expect(city.tiles[idx(5, 5)].stage).toBe(2);
    developTile(city, 5, 5, always); // LV 0.45 < 0.5 gate for stage 3
    expect(city.tiles[idx(5, 5)].stage).toBe(2);
    city.tiles[idx(5, 5)].landValue = 0.7;
    developTile(city, 5, 5, always);
    expect(city.tiles[idx(5, 5)].stage).toBe(3);
  });

  test('industry ignores the land value gates', () => {
    const city = setup(Zone.Industrial, 2);
    city.demand.i = 0.8;
    city.tiles[idx(5, 5)].landValue = 0.05;
    developTile(city, 5, 5, always);
    expect(city.tiles[idx(5, 5)].stage).toBe(3);
  });

  test('rubble blocks development until it clears', () => {
    const city = setup(Zone.Residential, 1);
    city.demand.r = 0.8;
    city.tiles[idx(5, 5)].rubble = 1;
    developTile(city, 5, 5, always);
    expect(city.tiles[idx(5, 5)].stage).toBe(1); // buried in debris
    city.tiles[idx(5, 5)].rubble = 0;
    developTile(city, 5, 5, always);
    expect(city.tiles[idx(5, 5)].stage).toBe(2); // cleared → grows again
  });

  test('losing power downgrades, then abandons', () => {
    const city = setup(Zone.Residential, 2);
    city.demand.r = 0.5;
    city.tiles[idx(5, 5)].powered = false;
    developTile(city, 5, 5, always);
    expect(city.tiles[idx(5, 5)].stage).toBe(1);
    developTile(city, 5, 5, always);
    expect(city.tiles[idx(5, 5)].abandoned).toBe(true);
  });

  test('abandoned buildings redevelop when conditions recover', () => {
    const city = setup(Zone.Residential, 1);
    city.tiles[idx(5, 5)].abandoned = true;
    city.demand.r = 0.5;
    developTile(city, 5, 5, always);
    const t = city.tiles[idx(5, 5)];
    expect(t.abandoned).toBe(false);
    expect(t.stage).toBe(1);
  });

  test('no road access, no development — ever', () => {
    const city = makeCity();
    zone(city, 30, 30, Zone.Commercial);
    city.tiles[idx(30, 30)].powered = true;
    city.demand.c = 1;
    developTile(city, 30, 30, always);
    expect(city.tiles[idx(30, 30)].stage).toBe(0);
  });

  test('collapsed demand hollows the city out', () => {
    const city = setup(Zone.Industrial, 2);
    city.demand.i = -0.6;
    developTile(city, 5, 5, always);
    expect(city.tiles[idx(5, 5)].stage).toBe(1);
    developTile(city, 5, 5, always);
    expect(city.tiles[idx(5, 5)].abandoned).toBe(true);
  });

  test('no fire coverage caps buildings at stage 1', () => {
    const city = setup(Zone.Residential, 1);
    city.demand.r = 0.9;
    city.tiles[idx(5, 5)].fireCov = 0;
    developTile(city, 5, 5, always);
    expect(city.tiles[idx(5, 5)].stage).toBe(1);
  });

  test('stage 3 homes need police and school coverage', () => {
    const city = setup(Zone.Residential, 2);
    city.demand.r = 0.9;
    city.tiles[idx(5, 5)].landValue = 0.7;
    city.tiles[idx(5, 5)].schoolCov = 0;
    developTile(city, 5, 5, always);
    expect(city.tiles[idx(5, 5)].stage).toBe(2);
    city.tiles[idx(5, 5)].schoolCov = 0.4;
    developTile(city, 5, 5, always);
    expect(city.tiles[idx(5, 5)].stage).toBe(3);
  });

  test('stage 3 industry needs police but not school', () => {
    const city = setup(Zone.Industrial, 2);
    city.demand.i = 0.9;
    city.tiles[idx(5, 5)].schoolCov = 0;
    city.tiles[idx(5, 5)].policeCov = 0;
    developTile(city, 5, 5, always);
    expect(city.tiles[idx(5, 5)].stage).toBe(2);
    city.tiles[idx(5, 5)].policeCov = 0.4;
    developTile(city, 5, 5, always);
    expect(city.tiles[idx(5, 5)].stage).toBe(3);
  });

  test('mildly negative demand leaves standing buildings alone', () => {
    const city = setup(Zone.Residential, 2);
    city.demand.r = -0.1;
    developTile(city, 5, 5, always);
    expect(city.tiles[idx(5, 5)].stage).toBe(2);
    expect(city.tiles[idx(5, 5)].abandoned).toBe(false);
  });
});

describe('demandReading', () => {
  test('null off the RCI zones', () => {
    const city = setup(Zone.Residential);
    expect(demandReading(city, 5, 6)).toBeNull(); // road
    expect(demandReading(city, 8, 8)).toBeNull(); // empty land
  });

  test('positive pressure for a powered, road-adjacent zone in demand', () => {
    const city = setup(Zone.Residential);
    city.demand.r = 0.5;
    const r = demandReading(city, 5, 5)!;
    expect(r.blocked).toBe(false);
    expect(r.collapsing).toBe(false);
    expect(r.pressure).toBeGreaterThan(0);
  });

  test('blocked when unpowered, with zero pressure', () => {
    const city = setup(Zone.Residential);
    city.demand.r = 0.5;
    city.tiles[idx(5, 5)].powered = false;
    const r = demandReading(city, 5, 5)!;
    expect(r.blocked).toBe(true);
    expect(r.pressure).toBe(0);
  });

  test('collapsing below the abandonment threshold', () => {
    const city = setup(Zone.Commercial, 2);
    city.demand.c = -0.5;
    const r = demandReading(city, 5, 5)!;
    expect(r.collapsing).toBe(true);
    expect(r.pressure).toBe(0);
  });

  test('mildly negative demand stagnates without collapsing', () => {
    const city = setup(Zone.Industrial, 1);
    city.demand.i = -0.1;
    expect(demandReading(city, 5, 5)).toEqual({
      pressure: 0,
      blocked: false,
      collapsing: false,
    });
  });
});
