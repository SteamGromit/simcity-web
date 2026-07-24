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

describe('building visual', () => {
  const VISUAL = {
    footprint: 0.8,
    height: 24,
    hue: 210,
    sat: 40,
    light: 50,
    roof: 'gabled',
    props: ['antenna', 'vent'],
  };

  function packWithVisual(patch: Record<string, unknown> = {}) {
    const p = goodPack();
    (p.buildings as Record<string, unknown>[])[0].visual = { ...VISUAL, ...patch };
    return p;
  }

  test('a well-formed visual validates', () => {
    const r = validatePack(packWithVisual());
    expect(r.ok).toBe(true);
  });

  test('a building with no visual is still valid', () => {
    expect(validatePack(goodPack()).ok).toBe(true);
  });

  test('visual must be an object', () => {
    const p = goodPack();
    (p.buildings as Record<string, unknown>[])[0].visual = 7;
    const r = validatePack(p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/visual.*object/i);
  });

  test.each([
    ['footprint', 0.1],
    ['footprint', 1.5],
    ['height', 2],
    ['height', 200],
    ['hue', -5],
    ['hue', 400],
    ['sat', 140],
    ['light', -1],
  ])('%s out of range is rejected (%s)', (key, value) => {
    const r = validatePack(packWithVisual({ [key]: value }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toContain(`visual.${key}`);
  });

  test('a non-numeric field is rejected', () => {
    const r = validatePack(packWithVisual({ height: 'tall' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toContain('visual.height');
  });

  test('an unknown roof is rejected and names the field', () => {
    const r = validatePack(packWithVisual({ roof: 'dome' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toContain('visual.roof');
  });

  test('an unknown prop is rejected and names it', () => {
    const r = validatePack(packWithVisual({ props: ['antenna', 'gargoyle'] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toContain('gargoyle');
  });

  test('props must be an array', () => {
    const r = validatePack(packWithVisual({ props: 'antenna' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toContain('visual.props');
  });

  test('more than three props is rejected', () => {
    const r = validatePack(packWithVisual({ props: ['antenna', 'vent', 'tank', 'chimney'] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/at most 3/i);
  });

  test('an empty prop list is fine', () => {
    expect(validatePack(packWithVisual({ props: [] })).ok).toBe(true);
  });

  test('errors name the offending building', () => {
    const r = validatePack(packWithVisual({ roof: 'dome' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toContain('test:shed');
  });
});

describe('overrides', () => {
  function packWith(overrides: unknown) {
    const p = goodPack();
    p.overrides = overrides;
    return p;
  }

  test('a well-formed override block validates', () => {
    const r = validatePack(
      packWith({
        buildings: [{ id: 'core:coal_plant', cost: 1500, power: { capacity: 900 } }],
        ordinances: [{ id: 'cleanAir', cost: 40, effects: { 'pollution.industry': 0.3 } }],
      }),
    );
    expect(r.ok).toBe(true);
  });

  test('an id-only override is valid (it just changes nothing)', () => {
    expect(validatePack(packWith({ buildings: [{ id: 'core:coal_plant' }] })).ok).toBe(true);
  });

  test('a pack with no overrides is unaffected', () => {
    expect(validatePack(goodPack()).ok).toBe(true);
  });

  test('an override without an id is rejected', () => {
    const r = validatePack(packWith({ buildings: [{ cost: 10 }] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/id/);
  });

  test('overriding slot is refused, and says why', () => {
    const r = validatePack(packWith({ buildings: [{ id: 'core:coal_plant', slot: 99 }] }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.join(' ')).toContain('slot');
      expect(r.errors.join(' ')).toMatch(/identity|saves/i);
    }
  });

  test('a patched number is range-checked like the base field', () => {
    const r = validatePack(packWith({ buildings: [{ id: 'core:coal_plant', cost: -5 }] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toContain('cost');
  });

  test('a patched visual is range-checked', () => {
    const r = validatePack(
      packWith({
        buildings: [
          {
            id: 'core:coal_plant',
            visual: { footprint: 0.8, height: 900, hue: 1, sat: 1, light: 1, roof: 'flat', props: [] },
          },
        ],
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toContain('visual.height');
  });

  test('an unknown modifier key in a patched effect is refused', () => {
    const r = validatePack(packWith({ ordinances: [{ id: 'cleanAir', effects: { nope: 1 } }] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toContain('nope');
  });

  test('a bad service kind in a patch is refused', () => {
    const r = validatePack(packWith({ buildings: [{ id: 'core:fire_station', service: { kind: 'vibes' } }] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toContain('service.kind');
  });

  test('overrides must be arrays', () => {
    const r = validatePack(packWith({ buildings: { id: 'x' } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/array/);
  });

  test('a malformed unlock expression in a patch is refused', () => {
    const r = validatePack(
      packWith({ buildings: [{ id: 'core:coal_plant', unlock: { expr: 'population >', label: 'x' } }] }),
    );
    expect(r.ok).toBe(false);
  });
});
