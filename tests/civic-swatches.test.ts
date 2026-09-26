import { describe, expect, test } from 'vitest';
import { civicSwatch } from '../src/render/buildings';
import { SWATCHES } from '../src/render/palette';
import { Zone } from '../src/sim/types';

describe('civic swatches', () => {
  const CIVIC_ZONES = [
    Zone.FireStation, Zone.PoliceStation, Zone.Hospital, Zone.School, Zone.Prison,
    Zone.BusStop, Zone.StreetcarStop, Zone.MonorailStation, Zone.SubwayStation,
    Zone.RailTerminal, Zone.RecyclingCentre, Zone.Incinerator, Zone.WaterPump,
    Zone.PowerPlant, Zone.SolarPlant, Zone.HydroPlant, Zone.NuclearPlant, Zone.WindTurbine,
  ];
  test('every civic building is built of a swatch from the library', () => {
    for (const z of CIVIC_ZONES) {
      const id = civicSwatch(z);
      expect(id, `zone ${z}`).not.toBeNull();
      expect(SWATCHES[id!]).toBeDefined();
    }
  });
  test('a growable zone has no civic swatch', () => {
    expect(civicSwatch(Zone.Residential)).toBeNull();
  });
  test('a fire station is red brick', () => {
    expect(SWATCHES[civicSwatch(Zone.FireStation)!].family).toBe('brick');
  });
});
