import { describe, expect, it } from 'vitest';
import { TRANSIT_SPECS } from '../src/sim/transit';
import { GRID, SERVICE_RADII, Zone, mapScaled } from '../src/sim/types';
import { HALO_RADII } from '../src/ui/shortcuts';

describe('map-relative balance', () => {
  it('mapScaled applies the GRID/64 factor with rounding', () => {
    expect(GRID).toBe(96); // the table below assumes the 1.5× factor
    expect(mapScaled(5)).toBe(8);
    expect(mapScaled(8)).toBe(12);
    expect(mapScaled(10)).toBe(15);
  });

  it('service radii match the 64-era shares on the 96 map', () => {
    expect(SERVICE_RADII).toEqual({ fire: 12, police: 12, school: 15, health: 15, bus: 8 });
  });

  it('the transit ladder rides above the scaled bus', () => {
    expect(TRANSIT_SPECS[Zone.StreetcarStop]!.radius).toBe(10);
    expect(TRANSIT_SPECS[Zone.MonorailStation]!.radius).toBe(13);
    expect(TRANSIT_SPECS[Zone.SubwayStation]!.radius).toBe(16);
    expect(TRANSIT_SPECS[Zone.RailTerminal]!.radius).toBe(20);
    const ladder = [
      SERVICE_RADII.bus,
      TRANSIT_SPECS[Zone.StreetcarStop]!.radius,
      TRANSIT_SPECS[Zone.MonorailStation]!.radius,
      TRANSIT_SPECS[Zone.SubwayStation]!.radius,
      TRANSIT_SPECS[Zone.RailTerminal]!.radius,
    ];
    for (let i = 1; i < ladder.length; i++) {
      expect(ladder[i]).toBeGreaterThan(ladder[i - 1]);
    }
  });

  it('placement halos track the live tables', () => {
    expect(HALO_RADII.fire).toBe(SERVICE_RADII.fire);
    expect(HALO_RADII.bus).toBe(SERVICE_RADII.bus);
    expect(HALO_RADII.subway).toBe(TRANSIT_SPECS[Zone.SubwayStation]!.radius);
    expect(HALO_RADII.rail).toBe(TRANSIT_SPECS[Zone.RailTerminal]!.radius);
  });
});
