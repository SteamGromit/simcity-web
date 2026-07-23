import { beforeAll, describe, expect, test } from 'vitest';
import { compileSkin, getSkin, setSkin, skins } from '../src/render/skins';
import { ensureCoreContent } from '../src/sim/content';

beforeAll(() => {
  ensureCoreContent();
});

describe('skin registry', () => {
  test('classic, springfield, and nyc skins exist with labels', () => {
    const ids = skins().map((s) => s.id);
    expect(ids).toContain('classic');
    expect(ids).toContain('springfield');
    expect(ids).toContain('nyc');
    for (const s of skins()) expect(s.label.length).toBeGreaterThan(2);
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
    for (const s of skins()) {
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
    for (const s of skins()) {
      expect(s.heightScale).toBeGreaterThan(0.7);
      expect(s.heightScale).toBeLessThan(1.4);
    }
    const classic = skins().find((s) => s.id === 'classic')!;
    const spring = skins().find((s) => s.id === 'springfield')!;
    const nyc = skins().find((s) => s.id === 'nyc')!;
    expect(spring.outline).toBeGreaterThan(0);
    expect(classic.outline).toBe(0);
    expect(nyc.building(120, 50, 50)).not.toEqual(classic.building(120, 50, 50));
  });
});

describe('skins compiled from definitions', () => {
  test('identity hue and empty transforms leave a color untouched', () => {
    const s = compileSkin({
      id: 'x', label: 'X', blurb: 'x',
      hue: { mode: 'identity' }, sat: {}, light: {},
      outline: 0, heightScale: 1, grassSat: 1, roadFill: '#000',
    });
    expect(s.building(200, 50, 40)).toEqual([200, 50, 40]);
  });

  test('springfield reproduces its old function exactly', () => {
    const s = compileSkin({
      id: 'springfield', label: 'Springfield', blurb: 'x',
      hue: { mode: 'identity' }, sat: { mul: 1.6, add: 10 }, light: { mul: 1.05, add: 6 },
      outline: 1.6, heightScale: 0.9, grassSat: 1.35, roadFill: '#4a4450',
    });
    // old: (h, s, l) => [h, clamp(s * 1.6 + 10), clamp(l * 1.05 + 6)]
    expect(s.building(120, 30, 50)).toEqual([120, 30 * 1.6 + 10, 50 * 1.05 + 6]);
  });

  test('nyc wrap hue reproduces 15 + (h % 40)', () => {
    const s = compileSkin({
      id: 'nyc', label: 'NYC', blurb: 'x',
      hue: { mode: 'wrap', base: 15, span: 40 }, sat: { mul: 0.55, add: 8 }, light: { mul: 0.92 },
      outline: 0, heightScale: 1.2, grassSat: 0.7, roadFill: '#33353a',
    });
    expect(s.building(200, 30, 50)[0]).toBe(15 + (200 % 40));
  });

  test('saturation and lightness clamp to 0..100', () => {
    const s = compileSkin({
      id: 'x', label: 'X', blurb: 'x',
      hue: { mode: 'identity' }, sat: { mul: 10 }, light: { mul: -5 },
      outline: 0, heightScale: 1, grassSat: 1, roadFill: '#000',
    });
    const [, sat, light] = s.building(0, 50, 50);
    expect(sat).toBe(100);
    expect(light).toBe(0);
  });
});
