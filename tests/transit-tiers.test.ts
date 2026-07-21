import { describe, expect, it } from 'vitest';
import { TRANSIT_SPECS, TRANSIT_ZONES, isTransit, transitUnlocked } from '../src/sim/transit';
import { deserialize, serialize } from '../src/sim/save';
import { Zone } from '../src/sim/types';
import { clearLand, makeCity } from './helpers';

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
