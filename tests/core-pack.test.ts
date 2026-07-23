import { describe, expect, test } from 'vitest';
import { CORE_PACK } from '../src/content/packs/core';
import { validatePack } from '../src/content/validate';
import { Zone } from '../src/sim/types';

describe('core pack', () => {
  test('passes validation', () => {
    const r = validatePack(CORE_PACK);
    if (!r.ok) throw new Error(r.errors.join('\n'));
    expect(r.ok).toBe(true);
  });

  test('defines all 19 placeable buildings', () => {
    expect(CORE_PACK.buildings).toHaveLength(19);
  });

  test('every building pins a slot, and slots match the Zone enum', () => {
    const bySlot = new Map(CORE_PACK.buildings!.map((b) => [b.slot, b.id]));
    expect(bySlot.get(Zone.Road)).toBe('core:road');
    expect(bySlot.get(Zone.PowerPlant)).toBe('core:coal_plant');
    expect(bySlot.get(Zone.RailTerminal)).toBe('core:rail_terminal');
    for (const b of CORE_PACK.buildings!) expect(typeof b.slot).toBe('number');
  });

  test('zoning zones are deliberately absent', () => {
    const slots = CORE_PACK.buildings!.map((b) => b.slot);
    expect(slots).not.toContain(Zone.Residential);
    expect(slots).not.toContain(Zone.Commercial);
    expect(slots).not.toContain(Zone.Industrial);
    expect(slots).not.toContain(Zone.None);
  });

  test('core ordinance ids keep their historic strings, unnamespaced', () => {
    expect(CORE_PACK.ordinances!.map((o) => o.id).sort()).toEqual(
      ['cleanAir', 'eduGrant', 'fireCode', 'freeBus', 'healthDrive'].sort(),
    );
  });

  test('core skins keep their historic ids, because Config persists them', () => {
    expect(CORE_PACK.skins!.map((s) => s.id).sort()).toEqual(
      ['classic', 'nyc', 'springfield'].sort(),
    );
  });
});
