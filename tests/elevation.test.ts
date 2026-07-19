import { describe, expect, test } from 'vitest';
import { idx } from '../src/sim/grid';
import { BRIDGE_COST, COSTS, MAX_ELEV, START_FUNDS, Terrain, Zone } from '../src/sim/types';
import { applyTool, canApply, newCity } from '../src/sim/city';
import { roadAccess, updateTraffic } from '../src/sim/traffic';
import { updateLandValue } from '../src/sim/landvalue';
import { deserialize, serialize } from '../src/sim/save';
import { clearLand, makeCity, road, zone } from './helpers';

describe('raise/lower tools', () => {
  test('raise and lower change elevation within 0..MAX_ELEV', () => {
    const city = makeCity();
    city.funds = 10_000;
    const t = city.tiles[idx(10, 10)];
    expect(applyTool(city, 'terraRaise', 10, 10).ok).toBe(true);
    expect(t.elevation).toBe(1);
    for (let i = 0; i < 10; i++) applyTool(city, 'terraRaise', 10, 10);
    expect(t.elevation).toBe(MAX_ELEV);
    expect(applyTool(city, 'terraRaise', 10, 10).ok).toBe(false); // at the cap
    for (let i = 0; i < 10; i++) applyTool(city, 'terraLower', 10, 10);
    expect(t.elevation).toBe(0);
    expect(applyTool(city, 'terraLower', 10, 10).ok).toBe(false);
  });

  test('cannot terraform under a structure', () => {
    const city = makeCity();
    city.funds = 10_000;
    zone(city, 10, 10, Zone.Road);
    expect(canApply(city, 'terraRaise', 10, 10)).toBe(false);
  });

  test('free while the map is pristine, charged once founded', () => {
    const city = newCity(7);
    clearLand(city);
    const before = city.funds;
    applyTool(city, 'terraRaise', 10, 10);
    expect(city.funds).toBe(before); // god-mode window
    zone(city, 20, 20, Zone.Residential, 1); // developed tile ends the window
    applyTool(city, 'terraRaise', 11, 10);
    expect(city.funds).toBe(before - COSTS.terraRaise);
  });
});

describe('map generation', () => {
  test('new maps have hills and are deterministic per seed', () => {
    const a = newCity(42);
    const b = newCity(42);
    const elevs = a.tiles.map((t) => t.elevation);
    expect(Math.max(...elevs)).toBeGreaterThan(0);
    expect(b.tiles.map((t) => t.elevation)).toEqual(elevs);
    expect(newCity(43).tiles.map((t) => t.elevation)).not.toEqual(elevs);
  });
});

describe('cliffs block roads', () => {
  test('a road over a 2-level cliff does not connect traffic', () => {
    const city = makeCity();
    road(city, 10, 10, 14, 10);
    city.tiles[idx(13, 10)].elevation = 2; // cliff in mid-run
    city.tiles[idx(14, 10)].elevation = 2;
    zone(city, 10, 11, Zone.Residential, 1);
    zone(city, 14, 11, Zone.Commercial, 1);
    city.tiles[idx(14, 11)].elevation = 2;
    updateTraffic(city);
    expect(city.tiles[idx(10, 11)].commute).toBe(Infinity); // jobs unreachable
  });

  test('a 1-level slope still connects', () => {
    const city = makeCity();
    road(city, 10, 10, 14, 10);
    city.tiles[idx(13, 10)].elevation = 1; // gentle ramp
    city.tiles[idx(14, 10)].elevation = 2;
    zone(city, 10, 11, Zone.Residential, 1);
    zone(city, 14, 11, Zone.Commercial, 1);
    city.tiles[idx(14, 11)].elevation = 2;
    updateTraffic(city);
    expect(city.tiles[idx(10, 11)].commute).toBeLessThan(10);
  });

  test('a zone two levels above its road has no access', () => {
    const city = makeCity();
    zone(city, 10, 10, Zone.Road);
    zone(city, 10, 11, Zone.Residential, 1);
    city.tiles[idx(10, 11)].elevation = 2;
    expect(roadAccess(city, 10, 11)).toBeNull();
    city.tiles[idx(10, 11)].elevation = 1;
    expect(roadAccess(city, 10, 11)).not.toBeNull();
  });
});

describe('bridges', () => {
  test('the road tool builds over water at bridge cost', () => {
    const city = makeCity();
    city.funds = START_FUNDS;
    city.tiles[idx(10, 10)].terrain = Terrain.Water;
    const res = applyTool(city, 'road', 10, 10);
    expect(res.ok).toBe(true);
    const t = city.tiles[idx(10, 10)];
    expect(t.zone).toBe(Zone.Road);
    expect(t.terrain).toBe(Terrain.Water); // still water underneath
    expect(city.funds).toBe(START_FUNDS - BRIDGE_COST);
  });

  test('zones and stations still cannot be built on water', () => {
    const city = makeCity();
    city.funds = START_FUNDS;
    city.tiles[idx(10, 10)].terrain = Terrain.Water;
    expect(canApply(city, 'zoneR', 10, 10)).toBe(false);
    expect(canApply(city, 'fire', 10, 10)).toBe(false);
    expect(canApply(city, 'line', 10, 10)).toBe(false);
  });

  test('bulldozing a bridge restores open water', () => {
    const city = makeCity();
    city.funds = START_FUNDS;
    city.tiles[idx(10, 10)].terrain = Terrain.Water;
    applyTool(city, 'road', 10, 10);
    applyTool(city, 'bulldoze', 10, 10);
    const t = city.tiles[idx(10, 10)];
    expect(t.zone).toBe(Zone.None);
    expect(t.terrain).toBe(Terrain.Water);
  });

  test('bridges carry traffic across water', () => {
    const city = makeCity();
    city.funds = START_FUNDS;
    for (let x = 11; x <= 13; x++) city.tiles[idx(x, 10)].terrain = Terrain.Water;
    road(city, 10, 10, 14, 10); // road tool paints the bridge span too
    zone(city, 10, 11, Zone.Residential, 1);
    zone(city, 14, 11, Zone.Commercial, 1);
    updateTraffic(city);
    expect(city.tiles[idx(10, 11)].commute).toBeLessThan(10);
  });
});

describe('elevation effects and persistence', () => {
  test('higher ground carries a land value bonus', () => {
    const city = makeCity();
    city.tiles[idx(40, 40)].elevation = 3;
    updateLandValue(city);
    expect(city.tiles[idx(40, 40)].landValue).toBeGreaterThan(city.tiles[idx(10, 10)].landValue);
  });

  test('elevation and bridges survive a save round-trip', () => {
    const city = makeCity();
    city.tiles[idx(5, 5)].elevation = 2;
    city.tiles[idx(10, 10)].terrain = Terrain.Water;
    city.tiles[idx(10, 10)].zone = Zone.Road;
    const revived = deserialize(serialize(city))!;
    expect(revived.tiles[idx(5, 5)].elevation).toBe(2);
    expect(revived.tiles[idx(10, 10)].zone).toBe(Zone.Road);
    expect(revived.tiles[idx(10, 10)].terrain).toBe(Terrain.Water);
  });

  test('legacy saves revive at sea level and crafted elevations are clamped', () => {
    const city = makeCity();
    const raw = JSON.parse(serialize(city));
    delete raw.tiles[0].elevation;
    raw.tiles[1].elevation = 99;
    raw.tiles[2].elevation = -5;
    const revived = deserialize(JSON.stringify(raw))!;
    expect(revived.tiles[0].elevation).toBe(0);
    expect(revived.tiles[1].elevation).toBe(MAX_ELEV);
    expect(revived.tiles[2].elevation).toBe(0);
  });
});
