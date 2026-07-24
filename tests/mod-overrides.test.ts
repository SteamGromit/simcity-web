import { beforeEach, describe, expect, test } from 'vitest';
import { buildingById, registerPack, resetRegistry, unregisterPack } from '../src/content/registry';
import { applyTool, newCity, toolCost } from '../src/sim/city';
import { ensureCoreContent, modifier } from '../src/sim/content';
import { plantCapacity } from '../src/sim/energy';
import { idx } from '../src/sim/grid';
import { updateCoverage } from '../src/sim/services';
import { updatePower } from '../src/sim/power';
import { Zone } from '../src/sim/types';
import { clearLand, makeCity, zone } from './helpers';

/** Register a mod that patches core content. */
function override(buildings: unknown[] = [], ordinances: unknown[] = []) {
  const r = registerPack({
    id: 'balance',
    name: 'Balance',
    version: '1.0.0',
    overrides: { buildings, ordinances },
  });
  if (!r.ok) throw new Error(r.errors.join('\n'));
}

describe('an override changes the game', () => {
  beforeEach(() => {
    resetRegistry();
    ensureCoreContent();
  });

  test('a patched cost is what the tool charges and placement deducts', () => {
    expect(toolCost('plant', 1)).toBe(3000);

    override([{ id: 'core:coal_plant', cost: 500 }]);
    expect(toolCost('plant', 1)).toBe(500);

    const city = newCity(1);
    city.funds = 10000;
    for (const t of city.tiles) t.terrain = 0; // grass
    const before = city.funds;
    expect(applyTool(city, 'plant', 4, 4).ok).toBe(true);
    expect(before - city.funds).toBe(500);
  });

  test('a patched plant capacity feeds the power pool', () => {
    const base = plantCapacity(Zone.PowerPlant);
    override([{ id: 'core:coal_plant', power: { capacity: base + 750 } }]);
    expect(plantCapacity(Zone.PowerPlant)).toBe(base + 750);
  });

  test('a patched service radius changes how far coverage reaches', () => {
    // Derive the target from the real radius rather than guessing: pick a tile
    // comfortably outside core reach, then widen the radius past it.
    const coreRadius = buildingById('core:fire_station')!.service!.radius;
    const far: [number, number] = [11 + coreRadius + 4, 10];
    const wideRadius = coreRadius + 12;

    const near = makeCity();
    clearLand(near);
    zone(near, 10, 10, Zone.PowerPlant);
    zone(near, 11, 10, Zone.FireStation);
    zone(near, far[0], far[1], Zone.Residential);
    updatePower(near);
    updateCoverage(near);
    expect(near.tiles[idx(far[0], far[1])].fireCov).toBe(0); // out of reach

    override([{ id: 'core:fire_station', service: { radius: wideRadius } }]);

    const wide = makeCity();
    clearLand(wide);
    zone(wide, 10, 10, Zone.PowerPlant);
    zone(wide, 11, 10, Zone.FireStation);
    zone(wide, far[0], far[1], Zone.Residential);
    updatePower(wide);
    updateCoverage(wide);
    expect(wide.tiles[idx(far[0], far[1])].fireCov).toBeGreaterThan(0);
  });

  test('a patched ordinance effect changes the modifier it applies', () => {
    const city = newCity(1);
    city.ordinances['cleanAir'] = true;
    const base = modifier(city, 'pollution.industry');

    override([], [{ id: 'cleanAir', effects: { 'pollution.industry': 0.1 } }]);
    expect(modifier(city, 'pollution.industry')).toBe(0.1);
    expect(modifier(city, 'pollution.industry')).not.toBe(base);
  });

  test('disabling the mod restores every core number', () => {
    override(
      [{ id: 'core:coal_plant', cost: 500, power: { capacity: 99999 } }],
      [{ id: 'cleanAir', cost: 1 }],
    );
    expect(toolCost('plant', 1)).toBe(500);

    unregisterPack('balance');

    expect(toolCost('plant', 1)).toBe(3000);
    expect(plantCapacity(Zone.PowerPlant)).not.toBe(99999);
    expect(buildingById('core:coal_plant')!.cost).toBe(3000);
  });

  test('an override never moves the slot a save depends on', () => {
    override([{ id: 'core:coal_plant', cost: 1, name: 'Tiny Coal' }]);
    expect(buildingById('core:coal_plant')!.slot).toBe(Zone.PowerPlant);
    const city = newCity(1);
    city.funds = 10000;
    for (const t of city.tiles) t.terrain = 0;
    applyTool(city, 'plant', 4, 4);
    expect(city.tiles[idx(4, 4)].zone).toBe(Zone.PowerPlant);
  });
});
