/// <reference types="vite/client" />
import { afterEach, describe, expect, test } from 'vitest';
import rendererSrc from '../src/render/renderer.ts?raw';
import { effectiveSeason, getSeasonFx, setSeasonFx, vegTint } from '../src/render/seasonfx';

describe('seasonal colours toggle', () => {
  afterEach(() => setSeasonFx(true));

  test('off, every season is baked and tinted as summer; on, the calendar rules', () => {
    setSeasonFx(false);
    expect(getSeasonFx()).toBe(false);
    for (const s of ['spring', 'summer', 'autumn', 'winter'] as const) {
      expect(effectiveSeason(s)).toBe('summer');
      expect(vegTint(s)).toEqual(vegTint('summer'));
    }
    setSeasonFx(true);
    expect(effectiveSeason('autumn')).toBe('autumn');
    expect(vegTint('autumn')).not.toEqual(vegTint('summer'));
  });

  test('the renderer reads the calendar once and passes its toggled season to every tree', () => {
    // The forest, its undergrowth and the median trees once took the raw
    // calendar season (or a fixed summer) and so ignored the toggle; the
    // one place the renderer may consult the calendar is where it derives
    // this.season for the frame.
    const src: string = rendererSrc;
    expect(src.match(/seasonOf\(/g)?.length).toBe(1);
    expect(src.split('\n').filter((l) => /^\s*'(spring|summer|autumn|winter)',?\s*$/.test(l))).toEqual([]);
  });
});
