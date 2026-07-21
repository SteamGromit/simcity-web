import { describe, expect, it } from 'vitest';
import { ENTITIES, entityFor, variantAt } from '../src/sim/entities';
import { mulberry32 } from '../src/sim/city';
import { Zone } from '../src/sim/types';

describe('variantAt', () => {
  it('reproduces the renderer variant sequence', () => {
    const rand = mulberry32(1234);
    const seq = [rand(), rand(), rand(), rand()];
    expect(variantAt(1234, 0)).toBeCloseTo(seq[0], 10);
    expect(variantAt(1234, 3)).toBeCloseTo(seq[3], 10);
  });
});

describe('entityFor', () => {
  it('is stable for the same tile', () => {
    const a = entityFor(Zone.Commercial, 2, 4, 0.523);
    const b = entityFor(Zone.Commercial, 2, 4, 0.523);
    expect(a).toEqual(b);
  });

  it('respects zone and tier lists', () => {
    for (let k = 0; k < 200; k++) {
      const v = (k + 0.5) / 200;
      const dirty = entityFor(Zone.Industrial, 'dirty', 5, v);
      if (dirty) expect(dirty.tiers).toContain('dirty');
      const cheap = entityFor(Zone.Commercial, 1, 4, v);
      if (cheap) expect(cheap.tiers).toContain(1);
      expect(entityFor(Zone.Residential, 2, 4, v)).toBeNull();
    }
  });

  it('gates on stage 2', () => {
    for (let k = 0; k < 50; k++) {
      expect(entityFor(Zone.Commercial, 2, 1, (k + 0.5) / 50)).toBeNull();
    }
  });

  it('names roughly 25–55% of eligible lots', () => {
    let named = 0;
    for (let k = 0; k < 1000; k++) {
      if (entityFor(Zone.Commercial, 2, 4, (k + 0.5) / 1000)) named++;
    }
    expect(named).toBeGreaterThan(250);
    expect(named).toBeLessThan(550);
  });

  it('roster entries are well-formed', () => {
    for (const e of ENTITIES) {
      expect(e.name.length).toBeGreaterThan(2);
      expect(e.initials.length).toBeLessThanOrEqual(2);
      expect(e.tiers.length).toBeGreaterThan(0);
    }
  });
});
