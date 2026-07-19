import { describe, expect, test } from 'vitest';
import { getSkin, setSkin, SKINS } from '../src/render/skins';

describe('skin registry', () => {
  test('classic, springfield, and nyc skins exist with labels', () => {
    const ids = SKINS.map((s) => s.id);
    expect(ids).toContain('classic');
    expect(ids).toContain('springfield');
    expect(ids).toContain('nyc');
    for (const s of SKINS) expect(s.label.length).toBeGreaterThan(2);
  });

  test('setSkin selects; unknown ids fall back to classic', () => {
    setSkin('nyc');
    expect(getSkin().id).toBe('nyc');
    setSkin('flimflam');
    expect(getSkin().id).toBe('classic');
    setSkin('classic');
  });
});

describe('skin color math stays renderable', () => {
  test('building color mutation keeps HSL in range for every skin', () => {
    for (const s of SKINS) {
      for (const [h, sat, lit] of [
        [0, 0, 0],
        [120, 50, 50],
        [359, 100, 100],
      ]) {
        const [mh, ms, ml] = s.building(h, sat, lit);
        expect(ms).toBeGreaterThanOrEqual(0);
        expect(ms).toBeLessThanOrEqual(100);
        expect(ml).toBeGreaterThanOrEqual(0);
        expect(ml).toBeLessThanOrEqual(100);
        expect(Number.isFinite(mh)).toBe(true);
      }
    }
  });

  test('height scales are sane and skins are visibly different', () => {
    for (const s of SKINS) {
      expect(s.heightScale).toBeGreaterThan(0.7);
      expect(s.heightScale).toBeLessThan(1.4);
    }
    const classic = SKINS.find((s) => s.id === 'classic')!;
    const spring = SKINS.find((s) => s.id === 'springfield')!;
    const nyc = SKINS.find((s) => s.id === 'nyc')!;
    expect(spring.outline).toBeGreaterThan(0);
    expect(classic.outline).toBe(0);
    expect(nyc.building(120, 50, 50)).not.toEqual(classic.building(120, 50, 50));
  });
});
