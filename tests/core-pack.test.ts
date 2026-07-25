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

  test('defines all 34 placeable buildings', () => {
    expect(CORE_PACK.buildings).toHaveLength(34);
  });

  test('every building pins a slot, and slots match the Zone enum', () => {
    const bySlot = new Map(CORE_PACK.buildings!.map((b) => [b.slot, b.id]));
    expect(bySlot.get(Zone.Road)).toBe('core:road');
    expect(bySlot.get(Zone.PowerPlant)).toBe('core:coal_plant');
    expect(bySlot.get(Zone.RailTerminal)).toBe('core:rail_terminal');
    expect(bySlot.get(Zone.Landfill)).toBe('core:landfill');
    expect(bySlot.get(Zone.Prison)).toBe('core:prison');
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
      ['cleanAir', 'driverEd', 'eduGrant', 'emt', 'fireCode', 'freeBus', 'healthDrive', 'inspectors', 'permits', 'recycling', 'watch'].sort(),
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

describe('crime content', () => {
  const byId = (id: string) => CORE_PACK.buildings!.find((b) => b.id === id)!;

  test('the prison is wide police coverage that blights its surroundings', () => {
    const p = byId('core:prison');
    expect(p.service?.kind).toBe('police');
    expect(p.blight?.amount).toBeGreaterThan(0);
    expect(p.blight?.radius).toBeGreaterThan(0);
    expect(p.unlock?.expr).toContain('population');
  });

  test('its numbers are pinned', () => {
    expect(byId('core:prison')).toMatchObject({ cost: 2000, upkeep: 130 });
  });

  test('the Neighborhood Watch ordinance lowers the crime rate', () => {
    const o = CORE_PACK.ordinances!.find((x) => x.id === 'watch')!;
    expect(o.effects['crime.rate']).toBeLessThan(1);
    expect(o.cost).toBe(90);
  });
});

describe('accident content', () => {
  const ord = (id: string) => CORE_PACK.ordinances!.find((o) => o.id === id)!;

  test('Driver Education lowers the accident rate', () => {
    expect(ord('driverEd').effects['accident.rate']).toBeLessThan(1);
    expect(ord('driverEd').cost).toBe(70);
  });

  test('the EMT Program shortens accidents', () => {
    expect(ord('emt').effects['accident.duration']).toBeLessThan(1);
    expect(ord('emt').cost).toBe(110);
  });
});

describe('building-safety content', () => {
  const ord = (id: string) => CORE_PACK.ordinances!.find((o) => o.id === id)!;

  test('Building Permits reduce collapse risk', () => {
    expect(ord('permits').effects['collapse.rate']).toBeLessThan(1);
    expect(ord('permits').cost).toBe(60);
  });

  test('Infrastructure Inspectors reduce it further', () => {
    expect(ord('inspectors').effects['collapse.rate']).toBeLessThan(
      ord('permits').effects['collapse.rate']!,
    );
    expect(ord('inspectors').cost).toBe(140);
  });
});
