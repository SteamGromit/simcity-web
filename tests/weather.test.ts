import { describe, expect, test } from 'vitest';
import { idx } from '../src/sim/grid';
import { FIRE_RISK, Zone } from '../src/sim/types';
import { updateWeatherMonthly, WEATHER_KINDS } from '../src/sim/weather';
import { fireRisk } from '../src/sim/services';
import { updateTraffic } from '../src/sim/traffic';
import { newCity } from '../src/sim/city';
import { deserialize, serialize } from '../src/sim/save';
import { makeCity, road, zone } from './helpers';

describe('weather transitions', () => {
  test('a new city starts with clear skies', () => {
    expect(newCity(1).weather.kind).toBe('clear');
  });

  test('monthly updates always land on a valid kind', () => {
    const city = makeCity();
    let r = 0.05;
    for (let m = 0; m < 24; m++) {
      city.month = m;
      updateWeatherMonthly(city, () => (r = (r + 0.31) % 1));
      expect(WEATHER_KINDS).toContain(city.weather.kind);
    }
  });

  test('precipitation is snow in winter and rain in summer', () => {
    const city = makeCity();
    city.month = 12; // January (months since Jan 2000: 12 = Jan 2001)
    updateWeatherMonthly(city, () => 0.95); // roll deep into precipitation
    expect(city.weather.kind).toBe('snow');
    city.month = 6; // July
    updateWeatherMonthly(city, () => 0.95);
    expect(city.weather.kind).toBe('rain');
  });
});

describe('weather sim effects', () => {
  test('rain damps fire ignition', () => {
    const run = (kind: 'clear' | 'rain') => {
      const city = makeCity();
      zone(city, 10, 10, Zone.Residential, 2);
      city.weather.kind = kind;
      fireRisk(city, () => FIRE_RISK * 0.7);
      return city.tiles[idx(10, 10)].burning > 0;
    };
    expect(run('clear')).toBe(true);
    expect(run('rain')).toBe(false);
  });

  test('snow slows every commute', () => {
    const run = (kind: 'clear' | 'snow') => {
      const city = makeCity();
      city.weather.kind = kind;
      zone(city, 5, 5, Zone.Residential, 1);
      road(city, 5, 6, 10, 6);
      zone(city, 10, 7, Zone.Industrial, 1);
      updateTraffic(city);
      return city.tiles[idx(5, 5)].commute;
    };
    expect(run('snow')).toBeGreaterThan(run('clear'));
  });
});

describe('persistence', () => {
  test('weather survives a save round-trip; legacy saves default clear', () => {
    const city = makeCity();
    city.weather.kind = 'snow';
    expect(deserialize(serialize(city))!.weather.kind).toBe('snow');
    const raw = JSON.parse(serialize(city));
    delete raw.weather;
    expect(deserialize(JSON.stringify(raw))!.weather.kind).toBe('clear');
  });
});
