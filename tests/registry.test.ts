import { beforeEach, describe, expect, test } from 'vitest';
import {
  allBuildings,
  allOrdinances,
  buildingById,
  buildingBySlot,
  buildingByTool,
  idOfSlot,
  registerPack,
  resetRegistry,
  slotOf,
  unlockExpr,
} from '../src/content/registry';
import { CORE_PACK } from '../src/content/packs/core';
import { MOD_SLOT_BASE } from '../src/content/types';
import { Zone } from '../src/sim/types';

const MOD_PACK = {
  id: 'mod',
  name: 'Mod Pack',
  version: '1.0.0',
  buildings: [
    { id: 'mod:silo', name: 'Silo', tool: 'silo', cost: 100, upkeep: 5 },
    { id: 'mod:dome', name: 'Dome', tool: 'dome', cost: 200, upkeep: 9 },
  ],
};

describe('registry', () => {
  beforeEach(() => {
    resetRegistry();
    const r = registerPack(CORE_PACK);
    if (!r.ok) throw new Error(r.errors.join('\n'));
  });

  test('core buildings land on their pinned slots', () => {
    expect(buildingBySlot(Zone.PowerPlant)!.id).toBe('core:coal_plant');
    expect(slotOf('core:coal_plant')).toBe(Zone.PowerPlant);
    expect(idOfSlot(Zone.PowerPlant)).toBe('core:coal_plant');
  });

  test('lookup by id and by tool', () => {
    expect(buildingById('core:hospital')!.name).toBe('Hospital');
    expect(buildingByTool('nuclear')!.id).toBe('core:nuclear_plant');
    expect(buildingByTool('nonesuch')).toBeUndefined();
  });

  test('unlock expressions are compiled once and reachable by id', () => {
    const e = unlockExpr('core:wind_turbine')!;
    expect(e.eval({ population: 2000 })).toBe(1);
    expect(e.eval({ population: 1999 })).toBe(0);
    expect(unlockExpr('core:road')).toBeUndefined();
  });

  test('mod buildings allocate slots at or above MOD_SLOT_BASE, in order', () => {
    const r = registerPack(MOD_PACK);
    expect(r.ok).toBe(true);
    expect(slotOf('mod:silo')).toBe(MOD_SLOT_BASE);
    expect(slotOf('mod:dome')).toBe(MOD_SLOT_BASE + 1);
    expect(buildingBySlot(MOD_SLOT_BASE)!.id).toBe('mod:silo');
  });

  test('mod slots never collide with core slots', () => {
    registerPack(MOD_PACK);
    const slots = allBuildings().map((b) => b.slot!);
    expect(new Set(slots).size).toBe(slots.length);
  });

  test('an invalid pack is rejected and changes nothing', () => {
    const before = allBuildings().length;
    const r = registerPack({ id: 'bad' });
    expect(r.ok).toBe(false);
    expect(allBuildings().length).toBe(before);
  });

  test('re-registering a pack id replaces its content rather than duplicating', () => {
    registerPack(MOD_PACK);
    const first = allBuildings().length;
    registerPack(MOD_PACK);
    expect(allBuildings().length).toBe(first);
  });

  test('ordinances are registered and keep their ids', () => {
    expect(allOrdinances().map((o) => o.id)).toContain('cleanAir');
  });

  test('a pack declaring a slot already pinned by another pack is rejected', () => {
    const COLLIDING_PACK = {
      id: 'colliding',
      name: 'Colliding Pack',
      version: '1.0.0',
      buildings: [
        { id: 'colliding:thing', name: 'Thing', slot: Zone.PowerPlant, cost: 10, upkeep: 1 },
      ],
    };
    const r = registerPack(COLLIDING_PACK);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.includes('colliding:thing') && e.includes('core:coal_plant'))).toBe(
        true,
      );
    }
    expect(buildingBySlot(Zone.PowerPlant)!.id).toBe('core:coal_plant');
  });
});
