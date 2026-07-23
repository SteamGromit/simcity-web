import { describe, expect, test } from 'vitest';
import { newCity } from '../src/sim/city';
import { buildingByTool } from '../src/content/registry';
import { modifier, unlockContext, unlockedFor } from '../src/sim/content';

describe('sim content adapter', () => {
  test('unlockContext exposes the documented city scalars', () => {
    const city = newCity(1);
    city.population = 1234;
    const ctx = unlockContext(city);
    expect(ctx.population).toBe(1234);
    expect(ctx.year).toBe(2000);
    expect(typeof ctx.funds).toBe('number');
    expect(typeof ctx.eduLevel).toBe('number');
  });

  test('unlockedFor gates on population exactly as unlockPop did', () => {
    const city = newCity(1);
    const wind = buildingByTool('wind')!;
    city.population = 1999;
    expect(unlockedFor(wind, city)).toBe(false);
    city.population = 2000;
    expect(unlockedFor(wind, city)).toBe(true);
  });

  test('a building with no unlock is always available', () => {
    const city = newCity(1);
    expect(unlockedFor(buildingByTool('road')!, city)).toBe(true);
  });

  test('modifier is neutral with no ordinances enacted', () => {
    const city = newCity(1);
    expect(modifier(city, 'fire.ignition')).toBe(1);
  });

  test('modifier reflects an enacted ordinance', () => {
    const city = newCity(1);
    city.ordinances.fireCode = true;
    expect(modifier(city, 'fire.ignition')).toBe(0.5);
    expect(modifier(city, 'pollution.industry')).toBe(1);
  });

  test('an unknown ordinance key in city state is ignored', () => {
    const city = newCity(1);
    (city.ordinances as Record<string, boolean>)['nonesuch'] = true;
    expect(modifier(city, 'fire.ignition')).toBe(1);
  });
});
