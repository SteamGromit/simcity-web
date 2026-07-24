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
  unregisterPack,
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

describe('unregisterPack', () => {
  beforeEach(() => {
    resetRegistry();
    const r = registerPack(CORE_PACK);
    if (!r.ok) throw new Error(r.errors.join('\n'));
  });

  test('removes a mod pack and its content', () => {
    registerPack({
      id: 'mod', name: 'Mod', version: '1.0.0',
      ordinances: [{ id: 'mod:law', label: 'Law', blurb: 'A law.', cost: 5, effects: { 'fire.ignition': 0.5 } }],
    });
    expect(allOrdinances().some((o) => o.id === 'mod:law')).toBe(true);
    unregisterPack('mod');
    expect(allOrdinances().some((o) => o.id === 'mod:law')).toBe(false);
  });

  test('leaves core content intact after removing a mod (incl. a mod building)', () => {
    const coreBuildings = allBuildings().length;
    registerPack({
      id: 'mod', name: 'Mod', version: '1.0.0',
      buildings: [{ id: 'mod:silo', name: 'Silo', cost: 10, upkeep: 1 }],
    });
    expect(allBuildings().length).toBe(coreBuildings + 1);
    unregisterPack('mod');
    expect(allBuildings().length).toBe(coreBuildings);
    expect(buildingBySlot(Zone.PowerPlant)!.id).toBe('core:coal_plant');
  });

  test('refuses to remove core', () => {
    unregisterPack('core');
    expect(buildingBySlot(Zone.PowerPlant)!.id).toBe('core:coal_plant');
    expect(allBuildings().length).toBeGreaterThanOrEqual(19);
  });

  test('unknown id is a no-op', () => {
    const before = allBuildings().length;
    unregisterPack('nope');
    expect(allBuildings().length).toBe(before);
  });
});

describe('stable slot allocation', () => {
  beforeEach(() => {
    resetRegistry();
    const r = registerPack(CORE_PACK);
    if (!r.ok) throw new Error(r.errors.join('\n'));
  });

  const B = (id: string) => ({ id, name: id, cost: 1, upkeep: 0 });

  test('an id keeps its slot when a sibling is removed and the pack re-registers', () => {
    registerPack({ id: 'mod', name: 'Mod', version: '1', buildings: [B('mod:a'), B('mod:b')] });
    const slotB = slotOf('mod:b')!;
    expect(slotB).toBeGreaterThanOrEqual(1000);

    // drop the first building; the pack's building list shrinks
    registerPack({ id: 'mod', name: 'Mod', version: '1', buildings: [B('mod:b')] });
    expect(slotOf('mod:b')).toBe(slotB);
  });

  test('an id keeps its slot when a sibling is added', () => {
    registerPack({ id: 'mod', name: 'Mod', version: '1', buildings: [B('mod:a')] });
    const slotA = slotOf('mod:a')!;
    registerPack({ id: 'mod', name: 'Mod', version: '1', buildings: [B('mod:a'), B('mod:b')] });
    expect(slotOf('mod:a')).toBe(slotA);
    expect(slotOf('mod:b')).not.toBe(slotA);
  });

  test('a disabled-then-re-enabled mod reuses its old slot', () => {
    registerPack({ id: 'mod', name: 'Mod', version: '1', buildings: [B('mod:a')] });
    const slotA = slotOf('mod:a')!;
    unregisterPack('mod');
    registerPack({ id: 'mod', name: 'Mod', version: '1', buildings: [B('mod:a')] });
    expect(slotOf('mod:a')).toBe(slotA);
  });

  test('two mods never share a slot', () => {
    registerPack({ id: 'm1', name: 'M1', version: '1', buildings: [B('m1:a')] });
    registerPack({ id: 'm2', name: 'M2', version: '1', buildings: [B('m2:a')] });
    expect(slotOf('m1:a')).not.toBe(slotOf('m2:a'));
  });

  test('resetRegistry clears the ledger so slots restart at MOD_SLOT_BASE', () => {
    registerPack({ id: 'm', name: 'M', version: '1', buildings: [B('m:x')] });
    const first = slotOf('m:x');
    resetRegistry();
    registerPack(CORE_PACK);
    registerPack({ id: 'm2', name: 'M2', version: '1', buildings: [B('m2:y')] });
    expect(slotOf('m2:y')).toBe(first);
  });

  test('core declared slots never move', () => {
    registerPack({ id: 'mod', name: 'Mod', version: '1', buildings: [B('mod:a')] });
    expect(buildingBySlot(Zone.PowerPlant)!.id).toBe('core:coal_plant');
    expect(slotOf('core:coal_plant')).toBe(Zone.PowerPlant);
  });
});
