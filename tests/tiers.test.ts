import { describe, expect, test } from 'vitest';
import { Zone } from '../src/sim/types';
import { capacityFor, normalizeTier, pollutionScaleFor, taxYieldFor } from '../src/sim/tiers';

describe('normalizeTier', () => {
  test('passes through a valid wealth on R/C', () => {
    expect(normalizeTier(Zone.Residential, 3)).toBe(3);
    expect(normalizeTier(Zone.Commercial, 1)).toBe(1);
  });

  test('passes through a valid kind on I', () => {
    expect(normalizeTier(Zone.Industrial, 'tech')).toBe('tech');
    expect(normalizeTier(Zone.Industrial, 'ag')).toBe('ag');
  });

  test('maps a stray industry kind on R/C to neutral wealth', () => {
    expect(normalizeTier(Zone.Residential, 'dirty')).toBe(2);
    expect(normalizeTier(Zone.Commercial, 'ag')).toBe(2);
  });

  test('maps a stray wealth on I to manufacturing', () => {
    expect(normalizeTier(Zone.Industrial, 1)).toBe('manu');
    expect(normalizeTier(Zone.Industrial, 3)).toBe('manu');
  });
});

describe('capacityFor', () => {
  test('neutral tiers reproduce the base tables exactly', () => {
    expect(capacityFor(Zone.Residential, 2, 2)).toBe(24); // R_POP[2]
    expect(capacityFor(Zone.Commercial, 2, 3)).toBe(45); // C_JOBS[3]
    expect(capacityFor(Zone.Industrial, 'manu', 2)).toBe(30); // I_JOBS[2]
  });

  test('wealth trades capacity for yield', () => {
    expect(capacityFor(Zone.Residential, 1, 2)).toBe(28); // 24 × 1.15
    expect(capacityFor(Zone.Residential, 3, 2)).toBe(18); // 24 × 0.75
  });

  test('farms hold few jobs, dirty industry holds many', () => {
    expect(capacityFor(Zone.Industrial, 'ag', 2)).toBe(14); // 30 × 0.45
    expect(capacityFor(Zone.Industrial, 'dirty', 2)).toBe(35); // 30 × 1.15
    expect(capacityFor(Zone.Industrial, 'tech', 2)).toBe(24); // 30 × 0.80
  });

  test('stage 0 has no capacity at any tier', () => {
    expect(capacityFor(Zone.Residential, 3, 0)).toBe(0);
    expect(capacityFor(Zone.Industrial, 'dirty', 0)).toBe(0);
  });

  test('a non-RCI zone has no capacity', () => {
    expect(capacityFor(Zone.Park, 2, 3)).toBe(0);
    expect(capacityFor(Zone.Road, 2, 3)).toBe(0);
  });
});

describe('taxYieldFor', () => {
  test('richer tiers pay more per occupant', () => {
    expect(taxYieldFor(Zone.Residential, 1)).toBeCloseTo(0.75);
    expect(taxYieldFor(Zone.Residential, 2)).toBeCloseTo(1.0);
    expect(taxYieldFor(Zone.Residential, 3)).toBeCloseTo(1.7);
  });

  test('high-tech is the most lucrative industry, farms the least', () => {
    expect(taxYieldFor(Zone.Industrial, 'tech')).toBeCloseTo(1.75);
    expect(taxYieldFor(Zone.Industrial, 'ag')).toBeCloseTo(0.6);
  });
});

describe('pollutionScaleFor', () => {
  test('farms are near-clean and dirty industry is the worst', () => {
    expect(pollutionScaleFor('ag')).toBeCloseTo(0.1);
    expect(pollutionScaleFor('dirty')).toBeCloseTo(1.6);
    expect(pollutionScaleFor('manu')).toBeCloseTo(1.0);
    expect(pollutionScaleFor('tech')).toBeCloseTo(0.25);
  });
});
