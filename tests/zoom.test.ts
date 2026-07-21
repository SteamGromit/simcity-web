import { describe, expect, it } from 'vitest';
import { TILE_H, TILE_W, clampZoom } from '../src/render/iso';
import { GRID } from '../src/sim/types';

describe('clampZoom', () => {
  it('lets a laptop viewport zoom out far enough to see the whole grid', () => {
    const z = clampZoom(0.01, 1440, 900);
    // Worst-case projected extent across all rotation angles.
    expect(GRID * TILE_W * z).toBeLessThanOrEqual(1440);
    expect(GRID * TILE_H * z).toBeLessThanOrEqual(900);
  });

  it('keeps the classic 0.5 floor when the grid already fits at 0.5', () => {
    expect(clampZoom(0.01, GRID * TILE_W, GRID * TILE_H)).toBe(0.5);
  });

  it('still caps zoom-in at 2', () => {
    expect(clampZoom(3, 1440, 900)).toBe(2);
  });

  it('passes mid-range zooms through unchanged', () => {
    expect(clampZoom(1.3, 1440, 900)).toBe(1.3);
  });
});
