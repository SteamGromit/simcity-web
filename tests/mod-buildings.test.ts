import { beforeEach, describe, expect, test } from 'vitest';
import { registerPack, resetRegistry, slotOf } from '../src/content/registry';
import type { Pack } from '../src/content/types';
import { applyTool, canApply, newCity } from '../src/sim/city';
import { ensureCoreContent } from '../src/sim/content';
import { idx } from '../src/sim/grid';
import { Terrain, Zone } from '../src/sim/types';

/** A minimal look; placement doesn't care what it is, only that it validates. */
const LOOK = {
  footprint: 0.8,
  height: 20,
  hue: 200,
  sat: 40,
  light: 50,
  roof: 'flat' as const,
  props: [],
};

function pack(building: Record<string, unknown>): Pack {
  return {
    id: 'mod',
    name: 'Mod',
    version: '1.0.0',
    buildings: [{ name: 'Thing', cost: 100, upkeep: 5, visual: LOOK, ...building }],
  } as unknown as Pack;
}

function load(building: Record<string, unknown>): void {
  const r = registerPack(pack(building));
  if (!r.ok) throw new Error(r.errors.join('\n'));
}

describe('placing an authored building', () => {
  beforeEach(() => {
    resetRegistry();
    ensureCoreContent();
  });

  test('a mod tool places its own slot and charges its cost', () => {
    load({ id: 'mod:depot', tool: 'mod__depot' });
    const city = newCity(1);
    city.funds = 5000;
    const before = city.funds;

    expect(canApply(city, 'mod__depot', 4, 4)).toBe(true);
    const res = applyTool(city, 'mod__depot', 4, 4);

    expect(res.ok).toBe(true);
    expect(city.tiles[idx(4, 4)].zone).toBe(slotOf('mod:depot'));
    expect(city.funds).toBe(before - 100);
  });

  test('a placed authored building sits at a mod slot, not a core zone', () => {
    load({ id: 'mod:depot', tool: 'mod__depot' });
    const city = newCity(1);
    city.funds = 5000;
    applyTool(city, 'mod__depot', 4, 4);
    expect(city.tiles[idx(4, 4)].zone).toBeGreaterThanOrEqual(1000);
  });

  test('an unknown tool is still refused', () => {
    const city = newCity(1);
    city.funds = 5000;
    expect(canApply(city, 'nope__nothing', 4, 4)).toBe(false);
  });

  test('too little money refuses the placement', () => {
    load({ id: 'mod:depot', tool: 'mod__depot' });
    const city = newCity(1);
    city.funds = 10;
    expect(canApply(city, 'mod__depot', 4, 4)).toBe(false);
  });

  test('an occupied tile refuses the placement', () => {
    load({ id: 'mod:depot', tool: 'mod__depot' });
    const city = newCity(1);
    city.funds = 5000;
    applyTool(city, 'mod__depot', 4, 4);
    expect(canApply(city, 'mod__depot', 4, 4)).toBe(false);
  });

  describe('siting', () => {
    test('needsWater refuses dry land and allows a waterside tile', () => {
      load({ id: 'mod:dock', tool: 'mod__dock', siting: { needsWater: true } });
      const city = newCity(1);
      city.funds = 5000;
      for (const t of city.tiles) t.terrain = Terrain.Grass;

      expect(canApply(city, 'mod__dock', 4, 4)).toBe(false);

      city.tiles[idx(5, 4)].terrain = Terrain.Water;
      expect(canApply(city, 'mod__dock', 4, 4)).toBe(true);
    });

    test('without needsWater, dry land is fine', () => {
      load({ id: 'mod:depot', tool: 'mod__depot' });
      const city = newCity(1);
      city.funds = 5000;
      for (const t of city.tiles) t.terrain = Terrain.Grass;
      expect(canApply(city, 'mod__depot', 4, 4)).toBe(true);
    });
  });

  describe('unlock gating', () => {
    test('a locked building refuses placement until its condition is met', () => {
      load({
        id: 'mod:tower',
        tool: 'mod__tower',
        unlock: { expr: 'population >= 500', label: 'pop 500' },
      });
      const city = newCity(1);
      city.funds = 5000;
      city.population = 0;
      expect(canApply(city, 'mod__tower', 4, 4)).toBe(false);

      city.population = 900;
      expect(canApply(city, 'mod__tower', 4, 4)).toBe(true);
    });
  });

  test('core placement is unchanged', () => {
    const city = newCity(1);
    city.funds = 50000;
    expect(applyTool(city, 'park', 6, 6).ok).toBe(true);
    expect(city.tiles[idx(6, 6)].zone).toBe(Zone.Park);
  });

  test('core transit stations stay wizard-only, even though they own a tool id', () => {
    // They declare `tool` for pricing but are absent from TOOL_ZONE on
    // purpose; the registry fallback must not re-open direct placement.
    load({ id: 'mod:depot', tool: 'mod__depot' });
    const city = newCity(1);
    city.funds = 100000;
    city.population = 30000;
    for (const t of city.tiles) t.terrain = Terrain.Grass;

    for (const wizardTool of ['streetcar', 'monorail', 'subway', 'rail']) {
      expect(applyTool(city, wizardTool, 10, 10).err).toBe('placed via the transit wizard');
    }
  });
});
