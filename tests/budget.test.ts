import { describe, expect, test } from 'vitest';
import { GRID, Zone } from '../src/sim/types';
import { collectBudget } from '../src/sim/budget';
import { makeCity, road, zone } from './helpers';

describe('collectBudget', () => {
  test('taxes developed capacity, pays upkeep, moves funds', () => {
    const city = makeCity();
    zone(city, 5, 5, Zone.Residential, 2); // 24 pop
    zone(city, 6, 5, Zone.Residential, 2); // 24 pop
    zone(city, 7, 5, Zone.Commercial, 1); // 6 jobs
    zone(city, 8, 5, Zone.Industrial, 2); // 30 jobs
    road(city, 5, 6, 9, 6); // 5 road tiles
    zone(city, 10, 6, Zone.PowerPlant);
    zone(city, 11, 6, Zone.Park);
    zone(city, 12, 6, Zone.Park);
    for (let x = 13; x < 23; x++) zone(city, x, 6, Zone.PowerLine); // 10 lines

    const report = collectBudget(city);
    expect(report.rIncome).toBe(43); // 48 pop × 9% × 10
    expect(report.cIncome).toBe(9); // 6 jobs × 9% × 16
    expect(report.iIncome).toBe(38); // 30 jobs × 9% × 14
    expect(report.expenses).toBe(161); // 5 roads + 150 plant + 4 parks + 2 lines
    expect(report.net).toBe(-71);
    expect(city.funds).toBe(-71);
    expect(city.lastBudget).toEqual(report);
  });

  test('abandoned buildings pay no taxes', () => {
    const city = makeCity();
    zone(city, 5, 5, Zone.Residential, 3);
    city.tiles[5 * GRID + 5].abandoned = true;
    const report = collectBudget(city);
    expect(report.rIncome).toBe(0);
  });

  test('an empty city has zero budget', () => {
    const city = makeCity();
    const report = collectBudget(city);
    expect(report.net).toBe(0);
    expect(city.funds).toBe(0);
  });

  test('service buildings charge monthly upkeep', () => {
    const city = makeCity();
    zone(city, 5, 5, Zone.FireStation);
    zone(city, 6, 5, Zone.PoliceStation);
    zone(city, 7, 5, Zone.School);
    const report = collectBudget(city);
    expect(report.expenses).toBe(140); // 50 + 50 + 40
  });
});
