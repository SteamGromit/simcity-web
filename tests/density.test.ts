import { describe, expect, test } from 'vitest';
import { idx } from '../src/sim/grid';
import { START_FUNDS, Zone } from '../src/sim/types';
import { applyTool, newCity } from '../src/sim/city';
import { developTile } from '../src/sim/develop';
import { updateDemand } from '../src/sim/demand';
import { deserialize, serialize } from '../src/sim/save';
import { capacityFor } from '../src/sim/tiers';
import { clearLand, makeCity, zone } from './helpers';

function newFlatCity(seed: number) {
  const city = newCity(seed);
  clearLand(city);
  return city;
}

const always = () => 0;

/** Fully serviced, high-value, powered R tile at (5,5) with a road at (5,6). */
function primeTile(density: 1 | 2 | 3, z: Zone = Zone.Residential) {
  const city = makeCity();
  zone(city, 5, 5, z, 0);
  zone(city, 5, 6, Zone.Road);
  const t = city.tiles[idx(5, 5)];
  t.density = density;
  t.powered = true;
  t.landValue = 0.9;
  t.commute = 2;
  t.fireCov = 1;
  t.policeCov = 1;
  t.schoolCov = 1;
  t.healthCov = 1;
  t.watered = true;
  city.demand = { r: 1, c: 1, i: 1 };
  return city;
}

function growFully(city: ReturnType<typeof makeCity>) {
  for (let i = 0; i < 20; i++) developTile(city, 5, 5, always);
  return city.tiles[idx(5, 5)].stage;
}

describe('density stage caps', () => {
  test('low density stops at stage 3 no matter how good conditions are', () => {
    expect(growFully(primeTile(1))).toBe(3);
  });

  test('medium density reaches stage 5, high density reaches stage 7', () => {
    expect(growFully(primeTile(2))).toBe(5);
    expect(growFully(primeTile(3))).toBe(7);
  });

  test('stage 4 and up demand substantial service coverage', () => {
    const city = primeTile(3);
    city.tiles[idx(5, 5)].policeCov = 0.1; // above zero but below the 0.2 bar
    expect(growFully(city)).toBe(3);
  });

  test('stage 4 and up demand higher land value', () => {
    const city = primeTile(3);
    city.tiles[idx(5, 5)].landValue = 0.52; // clears stage 3 gate (0.5), not stage 4 (0.55)
    expect(growFully(city)).toBe(3);
  });

  test('high-stage buildings hold huge populations', () => {
    const city = primeTile(3);
    growFully(city);
    updateDemand(city);
    // primeTile's land value clears the stage-7 gate (0.75), which necessarily
    // clears the §§§ wealth gate (0.62) — so a maxed tower is always wealthy,
    // and wealthy lots trade headcount for tax yield. Capacity is the tier-
    // scaled figure, not the raw R_POP table.
    expect(city.tiles[idx(5, 5)].tier).toBe(3);
    expect(city.population).toBe(capacityFor(Zone.Residential, 3, 7));
    expect(city.population).toBeGreaterThan(capacityFor(Zone.Residential, 3, 3) * 5);
  });
});

describe('density zoning tool', () => {
  test('zoning at higher density costs more and stamps the tile', () => {
    const city = newFlatCity(1);
    applyTool(city, 'zoneR', 5, 5, 3);
    expect(city.tiles[idx(5, 5)].density).toBe(3);
    expect(city.funds).toBe(START_FUNDS - 20); // §5 × 4
    applyTool(city, 'zoneC', 6, 5, 2);
    expect(city.funds).toBe(START_FUNDS - 20 - 10); // §5 × 2
  });

  test('non-zone tools ignore density', () => {
    const city = newFlatCity(1);
    applyTool(city, 'road', 5, 5, 3);
    expect(city.funds).toBe(START_FUNDS - 10); // road stays §10
  });

  test('density survives a save round-trip', () => {
    const city = newFlatCity(1);
    applyTool(city, 'zoneR', 5, 5, 2);
    const revived = deserialize(serialize(city));
    expect(revived!.tiles[idx(5, 5)].density).toBe(2);
  });

  test('junk density in a save degrades to low', () => {
    const city = newFlatCity(1);
    const mangled = JSON.parse(serialize(city));
    mangled.tiles[0].density = 99;
    expect(deserialize(JSON.stringify(mangled))!.tiles[0].density).toBe(1);
  });
});
