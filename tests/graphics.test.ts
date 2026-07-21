import { describe, expect, it } from 'vitest';
import { detailLevel } from '../src/render/detail';
import { groundShade } from '../src/render/terrainshade';

describe('detailLevel', () => {
  it('maps zoom bands to 0/1/2 with the spec thresholds', () => {
    expect(detailLevel(0.2)).toBe(0);
    expect(detailLevel(0.449)).toBe(0);
    expect(detailLevel(0.45)).toBe(1);
    expect(detailLevel(1.09)).toBe(1);
    expect(detailLevel(1.1)).toBe(2);
    expect(detailLevel(2)).toBe(2);
  });
});

describe('groundShade', () => {
  it('stays bounded over the whole grid', () => {
    for (let y = 0; y < 96; y += 3) {
      for (let x = 0; x < 96; x += 3) {
        expect(Math.abs(groundShade(x, y, 0.5))).toBeLessThanOrEqual(8);
      }
    }
  });

  it('varies smoothly between neighboring tiles', () => {
    for (let y = 0; y < 96; y += 5) {
      for (let x = 0; x < 95; x += 5) {
        const a = groundShade(x, y, 0.5);
        const b = groundShade(x + 1, y, 0.5);
        expect(Math.abs(a - b)).toBeLessThan(3);
      }
    }
  });

  it('actually varies across the map (not a constant)', () => {
    const samples = new Set<number>();
    for (let k = 0; k < 40; k++) samples.add(Math.round(groundShade(k * 7, k * 3, 0.5) * 10));
    expect(samples.size).toBeGreaterThan(5);
  });
});
