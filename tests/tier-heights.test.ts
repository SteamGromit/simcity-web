import { describe, expect, it } from 'vitest';
import { heightScaleFor } from '../src/render/archetypes';
import { Zone } from '../src/sim/types';

describe('heightScaleFor', () => {
  it('orders residential wealth: §§§ > §§ > §', () => {
    expect(heightScaleFor(Zone.Residential, 3)).toBeGreaterThan(heightScaleFor(Zone.Residential, 2));
    expect(heightScaleFor(Zone.Residential, 2)).toBeGreaterThan(heightScaleFor(Zone.Residential, 1));
  });

  it('orders commercial wealth: §§§ > §§ > §', () => {
    expect(heightScaleFor(Zone.Commercial, 3)).toBeGreaterThan(heightScaleFor(Zone.Commercial, 2));
    expect(heightScaleFor(Zone.Commercial, 2)).toBeGreaterThan(heightScaleFor(Zone.Commercial, 1));
  });

  it('orders industry: tech > manu > dirty', () => {
    expect(heightScaleFor(Zone.Industrial, 'tech')).toBeGreaterThan(heightScaleFor(Zone.Industrial, 'manu'));
    expect(heightScaleFor(Zone.Industrial, 'manu')).toBeGreaterThan(heightScaleFor(Zone.Industrial, 'dirty'));
  });

  it('commercial towers overtop residential ones', () => {
    expect(heightScaleFor(Zone.Commercial, 3)).toBeGreaterThan(heightScaleFor(Zone.Residential, 3));
  });

  it('stays neutral for non-RCI zones and mismatched tier unions', () => {
    expect(heightScaleFor(Zone.Park, 2)).toBe(1);
    expect(heightScaleFor(Zone.Road, 2)).toBe(1);
    // an old save's R lot carrying an industry kind normalizes to §§ → 1.0
    expect(heightScaleFor(Zone.Residential, 'tech')).toBe(1);
    // an I lot carrying a wealth normalizes to manu → 1.0
    expect(heightScaleFor(Zone.Industrial, 2)).toBe(1);
    // farmland normalizes through familyKey to manu → 1.0
    expect(heightScaleFor(Zone.Industrial, 'ag')).toBe(1);
  });
});
