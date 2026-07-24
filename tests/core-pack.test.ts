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

  test('defines all 22 placeable buildings', () => {
    expect(CORE_PACK.buildings).toHaveLength(22);
  });

  test('every building pins a slot, and slots match the Zone enum', () => {
    const bySlot = new Map(CORE_PACK.buildings!.map((b) => [b.slot, b.id]));
    expect(bySlot.get(Zone.Road)).toBe('core:road');
    expect(bySlot.get(Zone.PowerPlant)).toBe('core:coal_plant');
    expect(bySlot.get(Zone.RailTerminal)).toBe('core:rail_terminal');
    expect(bySlot.get(Zone.Landfill)).toBe('core:landfill');
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
      ['cleanAir', 'eduGrant', 'fireCode', 'freeBus', 'healthDrive', 'recycling'].sort(),
    );
  });

  test('core skins keep their historic ids, because Config persists them', () => {
    expect(CORE_PACK.skins!.map((s) => s.id).sort()).toEqual(
      ['classic', 'nyc', 'springfield'].sort(),
    );
  });
});

describe('refuse content', () => {
  const byId = (id: string) => CORE_PACK.buildings!.find((b) => b.id === id)!;

  test('the three disposal buildings carry both halves of the service', () => {
    for (const id of ['core:landfill', 'core:incinerator', 'core:recycling_centre']) {
      const b = byId(id);
      expect(b.service?.kind).toBe('garbage'); // reaches tiles
      expect(b.waste?.capacity).toBeGreaterThan(0); // and can process what it collects
    }
  });

  test('their prices and capacities are pinned', () => {
    expect(byId('core:landfill')).toMatchObject({ cost: 800, upkeep: 40 });
    expect(byId('core:landfill').waste).toMatchObject({ capacity: 900, pollution: 0.8 });
    expect(byId('core:incinerator')).toMatchObject({ cost: 2500, upkeep: 140 });
    expect(byId('core:incinerator').waste).toMatchObject({ capacity: 2200 });
    expect(byId('core:recycling_centre').waste).toMatchObject({ capacity: 700, divert: 0.25 });
  });

  test('the landfill is available from the start; the others are earned', () => {
    expect(byId('core:landfill').unlock).toBeUndefined();
    expect(byId('core:incinerator').unlock?.expr).toContain('population');
    // recycling wants a city that is both large and educated
    expect(byId('core:recycling_centre').unlock?.expr).toContain('eduLevel');
  });

  test('only the recycling centre diverts', () => {
    expect(byId('core:landfill').waste?.divert).toBeUndefined();
    expect(byId('core:incinerator').waste?.divert).toBeUndefined();
    expect(byId('core:recycling_centre').waste?.divert).toBe(0.25);
  });

  test('the recycling ordinance cuts production', () => {
    const o = CORE_PACK.ordinances!.find((x) => x.id === 'recycling')!;
    expect(o.effects['garbage.production']).toBe(0.75);
  });
});
