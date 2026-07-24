import { describe, expect, test } from 'vitest';
import { MODIFIER_KEYS, combineModifiers } from '../src/content/modifiers';

describe('modifier vocabulary', () => {
  test('exposes every knob the sim reads', () => {
    expect([...MODIFIER_KEYS].sort()).toEqual(
      [
        'coverage.school',
        'disaster.pandemicOdds',
        'disaster.pandemicToll',
        'fire.ignition',
        'garbage.production',
        'pollution.industry',
        'pollution.traffic',
        'transit.share',
      ].sort(),
    );
  });

  test('no sets means every knob is neutral', () => {
    const m = combineModifiers([]);
    for (const k of MODIFIER_KEYS) expect(m[k]).toBe(1);
  });

  test('a single set applies its values and leaves the rest neutral', () => {
    const m = combineModifiers([{ 'fire.ignition': 0.5 }]);
    expect(m['fire.ignition']).toBe(0.5);
    expect(m['pollution.industry']).toBe(1);
  });

  test('overlapping sets multiply', () => {
    const m = combineModifiers([{ 'fire.ignition': 0.5 }, { 'fire.ignition': 0.5 }]);
    expect(m['fire.ignition']).toBe(0.25);
  });

  test('a zero modifier is honoured, not treated as absent', () => {
    const m = combineModifiers([{ 'pollution.industry': 0 }]);
    expect(m['pollution.industry']).toBe(0);
  });
});
