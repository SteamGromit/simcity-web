import { describe, expect, it } from 'vitest';
import { TRANSIT_SPECS, TRANSIT_ZONES, isTransit, transitUnlocked } from '../src/sim/transit';
import { deserialize, serialize } from '../src/sim/save';
import { collectBudget } from '../src/sim/budget';
import { applyTool } from '../src/sim/city';
import { buildLine, rasterizePath } from '../src/sim/transitlines';
import { updatePower } from '../src/sim/power';
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
  it('a powered subway spreads busCov to its radius and stamps its share', () => {
    const R = TRANSIT_SPECS[Zone.SubwayStation]!.radius;
    const city = makeCity();
    zone(city, 40, 40, Zone.SubwayStation);
    city.tiles[idx96(40, 40)].powered = true;
    updateCoverage(city);
    expect(city.tiles[idx96(40, 40 + R)].busCov).toBeGreaterThan(0);
    expect(city.tiles[idx96(40, 40 + R)].transitShare).toBeCloseTo(0.22, 5);
    expect(city.tiles[idx96(40, 40 + R + 1)].busCov).toBe(0);
    expect(city.tiles[idx96(40, 40 + R + 1)].transitShare).toBe(1);
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

describe('transit placement and power', () => {
  it('station tools are gone — stations arrive via the wizard/buildLine', () => {
    const city = makeCity();
    clearLand(city);
    city.funds = 100000;
    city.population = 30000;
    expect(applyTool(city, 'subway', 10, 10).err).toBe('placed via the transit wizard');
    const ok = buildLine(city, {
      mode: Zone.SubwayStation,
      color: '#3d6ea8',
      path: rasterizePath([
        [10, 10],
        [13, 10],
      ]),
      stops: [[10, 10]],
    });
    expect(ok).toBe(true);
    expect(city.tiles[idx96(10, 10)].zone).toBe(Zone.SubwayStation);
  });

  it('stations draw from the plant pool like any service building', () => {
    const city = makeCity();
    clearLand(city);
    city.tiles[idx96(0, 0)].zone = Zone.WindTurbine;
    city.tiles[idx96(1, 0)].zone = Zone.SubwayStation;
    for (let x = 2; x <= 51; x++) city.tiles[idx96(x, 0)].zone = Zone.Residential;
    updatePower(city);
    // 51 consumers against a 50-tile pool: the farthest goes dark
    expect(city.brownouts).toBe(1);
    expect(city.tiles[idx96(51, 0)].powered).toBe(false);
  });
});

describe('transit economics', () => {
  it('charges each station its monthly upkeep', () => {
    const city = makeCity();
    clearLand(city);
    city.tiles[idx96(0, 0)].zone = Zone.StreetcarStop;
    city.tiles[idx96(2, 0)].zone = Zone.RailTerminal;
    collectBudget(city);
    expect(city.lastBudget.expenses).toBe(25 + 150);
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
