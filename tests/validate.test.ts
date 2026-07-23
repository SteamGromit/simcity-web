import { describe, expect, test } from 'vitest';
import { validatePack } from '../src/content/validate';

/** A minimal well-formed pack; tests mutate clones of it. */
function goodPack(): Record<string, unknown> {
  return {
    id: 'test',
    name: 'Test Pack',
    version: '1.0.0',
    buildings: [{ id: 'test:shed', name: 'Shed', cost: 10, upkeep: 1 }],
    ordinances: [
      { id: 'test:law', label: 'Law', blurb: 'A test law.', cost: 5, effects: { 'fire.ignition': 0.5 } },
    ],
    skins: [
      {
        id: 'test:skin',
        label: 'Skin',
        blurb: 'A test skin.',
        hue: { mode: 'identity' },
        sat: { mul: 1 },
        light: { mul: 1 },
        outline: 0,
        heightScale: 1,
        grassSat: 1,
        roadFill: '#000000',
      },
    ],
  };
}

describe('pack validation', () => {
  test('accepts a well-formed pack', () => {
    const r = validatePack(goodPack());
    expect(r.ok).toBe(true);
  });

  test('rejects a non-object', () => {
    for (const bad of [null, undefined, 42, 'pack', []]) {
      expect(validatePack(bad).ok).toBe(false);
    }
  });

  test('rejects a missing pack id', () => {
    const p = goodPack();
    delete p.id;
    const r = validatePack(p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toContain('id');
  });

  test('rejects a duplicate building id', () => {
    const p = goodPack();
    p.buildings = [
      { id: 'test:shed', name: 'Shed', cost: 10, upkeep: 1 },
      { id: 'test:shed', name: 'Shed Two', cost: 20, upkeep: 2 },
    ];
    const r = validatePack(p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toContain('duplicate');
  });

  test('rejects a duplicate slot', () => {
    const p = goodPack();
    p.buildings = [
      { id: 'test:a', slot: 4, name: 'A', cost: 1, upkeep: 0 },
      { id: 'test:b', slot: 4, name: 'B', cost: 1, upkeep: 0 },
    ];
    const r = validatePack(p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toContain('slot 4');
  });

  test('rejects a negative cost', () => {
    const p = goodPack();
    p.buildings = [{ id: 'test:shed', name: 'Shed', cost: -1, upkeep: 0 }];
    expect(validatePack(p).ok).toBe(false);
  });

  test('rejects an unknown modifier key', () => {
    const p = goodPack();
    p.ordinances = [
      { id: 'test:law', label: 'Law', blurb: 'A test law.', cost: 5, effects: { 'fire.ignitionn': 0.5 } },
    ];
    const r = validatePack(p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toContain('fire.ignitionn');
  });

  test('rejects an unparseable unlock expression', () => {
    const p = goodPack();
    p.buildings = [
      { id: 'test:shed', name: 'Shed', cost: 1, upkeep: 0, unlock: { expr: 'population >=', label: 'x' } },
    ];
    expect(validatePack(p).ok).toBe(false);
  });

  test('rejects an unlock referencing an unknown context key', () => {
    const p = goodPack();
    p.buildings = [
      { id: 'test:shed', name: 'Shed', cost: 1, upkeep: 0, unlock: { expr: 'populaton > 1', label: 'x' } },
    ];
    const r = validatePack(p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toContain('populaton');
  });

  test('returns compiled unlock expressions keyed by building id', () => {
    const p = goodPack();
    p.buildings = [
      {
        id: 'test:shed',
        name: 'Shed',
        cost: 1,
        upkeep: 0,
        unlock: { expr: 'population >= 100', label: 'pop 100' },
      },
    ];
    const r = validatePack(p);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const expr = r.value.unlocks.get('test:shed');
      expect(expr).toBeDefined();
      expect(expr!.eval({ population: 100 })).toBe(1);
      expect(expr!.eval({ population: 99 })).toBe(0);
    }
  });

  test('reports every problem at once, not just the first', () => {
    const p = goodPack();
    p.buildings = [{ id: 'test:shed', name: 'Shed', cost: -1, upkeep: -2 }];
    const r = validatePack(p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.length).toBeGreaterThanOrEqual(2);
  });
});
