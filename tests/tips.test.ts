import { describe, expect, test } from 'vitest';
import { idx } from '../src/sim/grid';
import { Zone } from '../src/sim/types';
import { updatePower } from '../src/sim/power';
import { adviseTips } from '../src/sim/tips';
import { makeCity, road, zone } from './helpers';

const ids = (city: ReturnType<typeof makeCity>) => adviseTips(city).map((t) => t.id);

describe('adviseTips', () => {
  test('pristine city gets the welcome tip and nothing else', () => {
    const city = makeCity();
    expect(ids(city)).toEqual(['welcome']);
  });

  test('zoned city without a power plant is told to build one', () => {
    const city = makeCity();
    road(city, 10, 10, 14, 10);
    zone(city, 10, 11, Zone.Residential);
    const tips = ids(city);
    expect(tips[0]).toBe('no-power-plant');
    expect(tips).not.toContain('welcome');
  });

  test('with a plant but unpowered zones, suggests power lines instead', () => {
    const city = makeCity();
    zone(city, 30, 30, Zone.PowerPlant);
    road(city, 10, 10, 14, 10);
    zone(city, 10, 11, Zone.Residential);
    updatePower(city);
    const tips = ids(city);
    expect(tips[0]).toBe('unpowered-zones');
    expect(tips).not.toContain('no-power-plant');
  });

  test('zones with no adjacent road trigger the road-access tip', () => {
    const city = makeCity();
    zone(city, 30, 30, Zone.PowerPlant);
    zone(city, 31, 30, Zone.Residential); // powered by adjacency, but roadless
    updatePower(city);
    expect(ids(city)).toContain('no-road-access');
  });

  test('developed buildings without fire coverage trigger the fire tip', () => {
    const city = makeCity();
    road(city, 10, 10, 14, 10);
    zone(city, 10, 11, Zone.Residential, 2);
    city.tiles[idx(10, 11)].powered = true;
    expect(ids(city)).toContain('no-fire-coverage');
    city.tiles[idx(10, 11)].fireCov = 0.5;
    expect(ids(city)).not.toContain('no-fire-coverage');
  });

  test('a deficit budget triggers the deficit tip', () => {
    const city = makeCity();
    zone(city, 30, 30, Zone.PowerPlant);
    city.lastBudget = { rIncome: 0, cIncome: 0, iIncome: 0, expenses: 100, net: -100 };
    expect(ids(city)).toContain('deficit');
  });

  test('taxes above 12% trigger the high-taxes tip', () => {
    const city = makeCity();
    zone(city, 30, 30, Zone.PowerPlant);
    city.taxes.i = 0.15;
    expect(ids(city)).toContain('high-taxes');
  });

  test('polluted developed residential triggers the pollution tip', () => {
    const city = makeCity();
    road(city, 10, 10, 14, 10);
    zone(city, 10, 11, Zone.Residential, 3);
    city.tiles[idx(10, 11)].powered = true;
    city.tiles[idx(10, 11)].fireCov = 1;
    city.tiles[idx(10, 11)].pollution = 0.7;
    expect(ids(city)).toContain('pollution');
  });

  test('abandoned buildings trigger the abandonment tip', () => {
    const city = makeCity();
    road(city, 10, 10, 14, 10);
    zone(city, 10, 11, Zone.Commercial, 2);
    city.tiles[idx(10, 11)].abandoned = true;
    expect(ids(city)).toContain('abandoned');
  });

  test('a healthy city gets no tips', () => {
    const city = makeCity();
    zone(city, 12, 12, Zone.PowerPlant);
    road(city, 10, 10, 14, 10);
    zone(city, 10, 11, Zone.Residential, 2);
    const t = city.tiles[idx(10, 11)];
    t.powered = true;
    t.watered = true;
    t.fireCov = 0.8;
    expect(ids(city)).toEqual([]);
  });

  test('every tip carries display text', () => {
    const city = makeCity();
    for (const tip of adviseTips(city)) {
      expect(tip.text.length).toBeGreaterThan(10);
    }
  });
});
