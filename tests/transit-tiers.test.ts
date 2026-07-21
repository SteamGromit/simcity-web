import { describe, expect, it } from 'vitest';
import { TRANSIT_SPECS, TRANSIT_ZONES, isTransit, transitUnlocked } from '../src/sim/transit';
import { deserialize, serialize } from '../src/sim/save';
import { updateCoverage } from '../src/sim/services';
import { updateTraffic } from '../src/sim/traffic';
import { Zone } from '../src/sim/types';
import { clearLand, makeCity, road, zone } from './helpers';

function idx96(x: number, y: number): number {
  return y * 96 + x;
}

describe('transit roster', () => {
  it('covers the four tiered modes (bus stays a service, not a tier)', () => {
    expect(TRANSIT_ZONES).toContain(Zone.StreetcarStop);
    expect(TRANSIT_ZONES).toContain(Zone.MonorailStation);
    expect(TRANSIT_ZONES).toContain(Zone.SubwayStation);
    expect(TRANSIT_ZONES).toContain(Zone.RailTerminal);
    expect(TRANSIT_ZONES).toHaveLength(4);
    expect(isTransit(Zone.SubwayStation)).toBe(true);
    expect(isTransit(Zone.BusStop)).toBe(false);
  });

  it('rides get better up the ladder: wider reach, fewer cars', () => {
    expect(TRANSIT_SPECS[Zone.RailTerminal]!.radius).toBeGreaterThan(
      TRANSIT_SPECS[Zone.StreetcarStop]!.radius,
    );
    expect(TRANSIT_SPECS[Zone.RailTerminal]!.share).toBeLessThan(
      TRANSIT_SPECS[Zone.StreetcarStop]!.share,
    );
  });

  it('streetcar unlocks exactly at pop 5,000; rail at 50,000', () => {
    expect(transitUnlocked(Zone.StreetcarStop, 4999)).toBe(false);
    expect(transitUnlocked(Zone.StreetcarStop, 5000)).toBe(true);
    expect(transitUnlocked(Zone.RailTerminal, 49999)).toBe(false);
    expect(transitUnlocked(Zone.RailTerminal, 50000)).toBe(true);
  });
});

describe('transit coverage and traffic', () => {
  it('a powered subway spreads busCov to radius 11 and stamps its share', () => {
    const city = makeCity();
    zone(city, 40, 40, Zone.SubwayStation);
    city.tiles[idx96(40, 40)].powered = true;
    updateCoverage(city);
    expect(city.tiles[idx96(40, 51)].busCov).toBeGreaterThan(0);
    expect(city.tiles[idx96(40, 51)].transitShare).toBeCloseTo(0.22, 5);
    expect(city.tiles[idx96(40, 52)].busCov).toBe(0);
    expect(city.tiles[idx96(40, 52)].transitShare).toBe(1);
  });

  it('overlapping bus and subway: the better share wins', () => {
    const city = makeCity();
    zone(city, 40, 40, Zone.BusStop);
    zone(city, 42, 40, Zone.SubwayStation);
    city.tiles[idx96(40, 40)].powered = true;
    city.tiles[idx96(42, 40)].powered = true;
    updateCoverage(city);
    expect(city.tiles[idx96(40, 41)].transitShare).toBeCloseTo(0.22, 5);
  });

  it('a subway-served commute puts fewer cars on the road than a bus one', () => {
    const build = (stationZone: Zone) => {
      const city = makeCity();
      zone(city, 5, 5, Zone.Residential, 1);
      road(city, 5, 6, 10, 6);
      zone(city, 10, 7, Zone.Industrial, 1);
      zone(city, 4, 5, stationZone);
      zone(city, 11, 7, stationZone);
      city.tiles[idx96(4, 5)].powered = true;
      city.tiles[idx96(11, 7)].powered = true;
      updateCoverage(city);
      updateTraffic(city);
      return city.tiles[idx96(7, 6)].traffic;
    };
    expect(build(Zone.BusStop)).toBeCloseTo(0.5, 5);
    expect(build(Zone.SubwayStation)).toBeCloseTo(0.22, 5);
  });

  it('the worse end bounds the ride: bus at home, subway at work rides at bus share', () => {
    // commute long enough that neither station reaches the far end
    const city = makeCity();
    zone(city, 5, 5, Zone.Residential, 1);
    road(city, 5, 6, 25, 6);
    zone(city, 25, 7, Zone.Industrial, 1);
    zone(city, 4, 5, Zone.BusStop);
    zone(city, 26, 7, Zone.SubwayStation);
    city.tiles[idx96(4, 5)].powered = true;
    city.tiles[idx96(26, 7)].powered = true;
    updateCoverage(city);
    updateTraffic(city);
    expect(city.tiles[idx96(15, 6)].traffic).toBeCloseTo(0.5, 5);
  });

  it('fare-free transit halves the ladder share too', () => {
    const city = makeCity();
    zone(city, 5, 5, Zone.Residential, 1);
    road(city, 5, 6, 10, 6);
    zone(city, 10, 7, Zone.Industrial, 1);
    zone(city, 4, 5, Zone.SubwayStation);
    zone(city, 11, 7, Zone.SubwayStation);
    city.tiles[idx96(4, 5)].powered = true;
    city.tiles[idx96(11, 7)].powered = true;
    city.ordinances.freeBus = true;
    updateCoverage(city);
    updateTraffic(city);
    expect(city.tiles[idx96(7, 6)].traffic).toBeCloseTo(0.11, 5);
  });
});

describe('transit save round-trip', () => {
  it('new station zones survive serialize → deserialize', () => {
    const city = makeCity();
    clearLand(city);
    city.tiles[idx96(5, 5)].zone = Zone.RailTerminal;
    city.tiles[idx96(6, 5)].zone = Zone.MonorailStation;
    const revived = deserialize(serialize(city))!;
    expect(revived.tiles[idx96(5, 5)].zone).toBe(Zone.RailTerminal);
    expect(revived.tiles[idx96(6, 5)].zone).toBe(Zone.MonorailStation);
  });
});
