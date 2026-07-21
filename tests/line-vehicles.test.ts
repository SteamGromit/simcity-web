import { describe, expect, it } from 'vitest';
import { vehicleCount, vehicleProgress } from '../src/render/linevehicles';

describe('vehicleProgress', () => {
  const LEN = 11; // path of 11 tiles → 10 steps out, 10 back

  it('starts at the origin heading out', () => {
    const p = vehicleProgress(LEN, 0, 1, 0);
    expect(p.seg).toBe(0);
    expect(p.frac).toBe(0);
    expect(p.dir).toBe(1);
  });

  it('reaches the far end at half cycle', () => {
    const p = vehicleProgress(LEN, 10, 1, 0); // 10 steps at speed 1
    expect(p.seg).toBe(LEN - 2);
    expect(p.frac).toBeCloseTo(1, 5);
  });

  it('returns with dir flipped after half cycle', () => {
    const p = vehicleProgress(LEN, 15, 1, 0);
    expect(p.dir).toBe(-1);
    // 5 steps home from the end lands exactly on tile 5: seg 5, frac 0
    expect(p.seg).toBe(5);
    expect(p.frac).toBeCloseTo(0, 5);
  });

  it('wraps the full cycle and keeps seg/frac in range forever', () => {
    for (let t = 0; t < 100; t += 0.7) {
      const p = vehicleProgress(LEN, t, 1.3, 5);
      expect(p.seg).toBeGreaterThanOrEqual(0);
      expect(p.seg).toBeLessThanOrEqual(LEN - 2);
      expect(p.frac).toBeGreaterThanOrEqual(0);
      expect(p.frac).toBeLessThanOrEqual(1);
    }
  });
});

describe('vehicleCount', () => {
  it('scales with path length, clamped 1..3', () => {
    expect(vehicleCount(4)).toBe(1);
    expect(vehicleCount(25)).toBe(2);
    expect(vehicleCount(80)).toBe(3);
  });
});
