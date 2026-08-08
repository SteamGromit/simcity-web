import { describe, expect, test } from 'vitest';
import { fbm, fbmSigned, hash2, valueNoise } from '../src/render/noise';

describe('hash2', () => {
  test('stays in [0, 1) for a wide lattice', () => {
    for (let y = -50; y <= 50; y += 7) {
      for (let x = -50; x <= 50; x += 7) {
        const v = hash2(x, y);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    }
  });

  test('is deterministic and seed-sensitive', () => {
    expect(hash2(12, 34, 5)).toBe(hash2(12, 34, 5));
    expect(hash2(12, 34, 5)).not.toBe(hash2(12, 34, 6));
    expect(hash2(12, 34, 5)).not.toBe(hash2(34, 12, 5));
  });

  test('spreads over the unit interval rather than clumping', () => {
    const buckets = new Array(10).fill(0);
    for (let k = 0; k < 4000; k++) buckets[Math.floor(hash2(k % 97, (k / 97) | 0) * 10)]++;
    for (const b of buckets) expect(b).toBeGreaterThan(200);
  });
});

describe('valueNoise', () => {
  test('stays in [0, 1]', () => {
    for (let k = 0; k < 500; k++) {
      const v = valueNoise(k * 0.37, k * 0.11, 3);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  test('agrees with the lattice hash at integer points', () => {
    for (const [x, y] of [[0, 0], [4, 9], [-3, 12]]) {
      expect(valueNoise(x, y, 7)).toBeCloseTo(hash2(x, y, 7), 10);
    }
  });

  test('is continuous — a small step makes a small change', () => {
    for (let k = 0; k < 200; k++) {
      const x = k * 0.23;
      const y = k * 0.61;
      const a = valueNoise(x, y, 1);
      const b = valueNoise(x + 0.01, y, 1);
      expect(Math.abs(a - b)).toBeLessThan(0.05);
    }
  });
});

describe('fbm', () => {
  test('stays normalized to [0, 1] at every octave count', () => {
    for (const octaves of [1, 2, 3, 5]) {
      for (let k = 0; k < 300; k++) {
        const v = fbm(k * 0.19, k * 0.07, 11, octaves);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  test('actually varies across a map-sized area', () => {
    const seen = new Set<number>();
    for (let y = 0; y < 96; y += 6) {
      for (let x = 0; x < 96; x += 6) seen.add(Math.round(fbm(x * 0.085, y * 0.085, 4242, 3) * 20));
    }
    expect(seen.size).toBeGreaterThan(6);
  });

  test('has no short repeat inside the grid, unlike the sine field it replaced', () => {
    // the old shading was two sines and tiled visibly; sample the same offset
    // at several places and confirm the values are not equal
    const a = fbm(0.5, 0.5, 4242, 3);
    for (const step of [8, 16, 24, 32]) {
      expect(fbm(0.5 + step * 0.085, 0.5, 4242, 3)).not.toBeCloseTo(a, 3);
    }
  });

  test('fbmSigned is fbm mapped onto −1..1', () => {
    for (let k = 0; k < 100; k++) {
      const x = k * 0.3;
      expect(fbmSigned(x, 1, 2, 3)).toBeCloseTo(fbm(x, 1, 2, 3) * 2 - 1, 10);
    }
  });
});
