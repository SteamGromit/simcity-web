import { describe, expect, it } from 'vitest';
import {
  LINE_COLORS,
  TRACK_COST,
  buildLine,
  lineCost,
  rasterizePath,
  validPathTile,
  validStopSite,
} from '../src/sim/transitlines';
import { deserialize, serialize } from '../src/sim/save';
import { COSTS, Terrain, Zone } from '../src/sim/types';
import { clearLand, makeCity, zone } from './helpers';

function idx96(x: number, y: number): number {
  return y * 96 + x;
}

describe('rasterizePath', () => {
  it('connects consecutive vertices without duplicating joints', () => {
    const path = rasterizePath([
      [10, 10],
      [13, 10],
      [13, 12],
    ]);
    expect(path).toEqual([
      [10, 10],
      [11, 10],
      [12, 10],
      [13, 10],
      [13, 11],
      [13, 12],
    ]);
  });
});

describe('validPathTile', () => {
  it('bus and streetcar cannot route over water; monorail can', () => {
    const city = makeCity();
    clearLand(city);
    city.tiles[idx96(20, 20)].terrain = Terrain.Water;
    expect(validPathTile(city, Zone.BusStop, 20, 20)).toBe(false);
    expect(validPathTile(city, Zone.StreetcarStop, 20, 20)).toBe(false);
    expect(validPathTile(city, Zone.MonorailStation, 20, 20)).toBe(true);
    expect(validPathTile(city, Zone.BusStop, 21, 20)).toBe(true);
  });
});

describe('validStopSite', () => {
  const path: [number, number][] = [
    [10, 10],
    [11, 10],
    [12, 10],
  ];

  it('accepts empty land and stage-0 zoned lots on or beside the path', () => {
    const city = makeCity();
    clearLand(city);
    expect(validStopSite(city, path, 11, 10)).toBe(true); // on the path
    expect(validStopSite(city, path, 11, 11)).toBe(true); // touching it
    zone(city, 12, 11, Zone.Residential, 0);
    expect(validStopSite(city, path, 12, 11)).toBe(true); // empty zoning overridden
  });

  it('rejects water, structures, developed lots, and tiles away from the path', () => {
    const city = makeCity();
    clearLand(city);
    city.tiles[idx96(10, 11)].terrain = Terrain.Water;
    expect(validStopSite(city, path, 10, 11)).toBe(false);
    zone(city, 11, 11, Zone.Road);
    expect(validStopSite(city, path, 11, 11)).toBe(false);
    zone(city, 12, 11, Zone.Residential, 3);
    expect(validStopSite(city, path, 12, 11)).toBe(false);
    expect(validStopSite(city, path, 14, 14)).toBe(false); // not touching
  });
});

describe('lineCost and buildLine', () => {
  it('charges track per path tile plus the station price per stop', () => {
    const path = rasterizePath([
      [10, 10],
      [14, 10],
    ]); // 5 tiles
    expect(lineCost(Zone.StreetcarStop, path, [[11, 10]])).toBe(
      5 * TRACK_COST[Zone.StreetcarStop]! + COSTS.streetcar,
    );
    expect(lineCost(Zone.BusStop, path, [[11, 10]])).toBe(COSTS.bus); // free streets
  });

  it('builds atomically: funds, stop zones, and the saved line', () => {
    const city = makeCity();
    clearLand(city);
    city.funds = 10000;
    const draft = {
      mode: Zone.StreetcarStop,
      color: LINE_COLORS[1],
      path: rasterizePath([
        [10, 10],
        [14, 10],
      ]),
      stops: [
        [10, 10],
        [14, 10],
      ] as [number, number][],
    };
    const cost = lineCost(draft.mode, draft.path, draft.stops);
    expect(buildLine(city, draft)).toBe(true);
    expect(city.funds).toBe(10000 - cost);
    expect(city.tiles[idx96(10, 10)].zone).toBe(Zone.StreetcarStop);
    expect(city.tiles[idx96(14, 10)].zone).toBe(Zone.StreetcarStop);
    expect(city.transitLines).toHaveLength(1);
    expect(city.transitLines[0].color).toBe(LINE_COLORS[1]);
  });

  it('does nothing when funds are short', () => {
    const city = makeCity();
    clearLand(city);
    city.funds = 10;
    const draft = {
      mode: Zone.BusStop,
      color: LINE_COLORS[0],
      path: rasterizePath([
        [10, 10],
        [12, 10],
      ]),
      stops: [[11, 10]] as [number, number][],
    };
    expect(buildLine(city, draft)).toBe(false);
    expect(city.funds).toBe(10);
    expect(city.tiles[idx96(11, 10)].zone).toBe(Zone.None);
    expect(city.transitLines).toHaveLength(0);
  });

  it('lines survive a save round-trip', () => {
    const city = makeCity();
    clearLand(city);
    city.funds = 10000;
    buildLine(city, {
      mode: Zone.BusStop,
      color: LINE_COLORS[2],
      path: rasterizePath([
        [10, 10],
        [13, 10],
      ]),
      stops: [[11, 10]],
    });
    const revived = deserialize(serialize(city))!;
    expect(revived.transitLines).toHaveLength(1);
    expect(revived.transitLines[0].mode).toBe(Zone.BusStop);
    expect(revived.transitLines[0].path).toHaveLength(4);
  });
});
