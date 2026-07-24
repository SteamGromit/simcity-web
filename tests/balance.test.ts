import { beforeAll, describe, expect, it } from 'vitest';
import { transitRadius } from '../src/sim/transit';
import { ensureCoreContent } from '../src/sim/content';
import { GRID, SERVICE_RADII, Zone, mapScaled } from '../src/sim/types';
import { HALO_RADII } from '../src/ui/shortcuts';

describe('map-relative balance', () => {
  beforeAll(() => {
    ensureCoreContent();
  });

  it('mapScaled applies the GRID/64 factor with rounding', () => {
    expect(GRID).toBe(96); // the table below assumes the 1.5× factor
    expect(mapScaled(5)).toBe(8);
    expect(mapScaled(8)).toBe(12);
    expect(mapScaled(10)).toBe(15);
  });

  it('service radii match the 64-era shares on the 96 map', () => {
    expect(SERVICE_RADII).toEqual({
      fire: 12, police: 12, school: 15, health: 15, bus: 8,
      landfill: 17, incinerator: 18, recycling: 15, prison: 21,
    });
  });

  it('the transit ladder rides above the scaled bus', () => {
    expect(transitRadius(Zone.StreetcarStop)).toBe(10);
    expect(transitRadius(Zone.MonorailStation)).toBe(13);
    expect(transitRadius(Zone.SubwayStation)).toBe(16);
    expect(transitRadius(Zone.RailTerminal)).toBe(20);
    const ladder = [
      SERVICE_RADII.bus,
      transitRadius(Zone.StreetcarStop),
      transitRadius(Zone.MonorailStation),
      transitRadius(Zone.SubwayStation),
      transitRadius(Zone.RailTerminal),
    ];
    for (let i = 1; i < ladder.length; i++) {
      expect(ladder[i]).toBeGreaterThan(ladder[i - 1]);
    }
  });

  it('placement halos track the live tables', () => {
    expect(HALO_RADII.fire).toBe(SERVICE_RADII.fire);
    expect(HALO_RADII.bus).toBe(SERVICE_RADII.bus);
    expect(HALO_RADII.subway).toBe(transitRadius(Zone.SubwayStation));
    expect(HALO_RADII.rail).toBe(transitRadius(Zone.RailTerminal));
  });
});
