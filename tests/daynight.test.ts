import { describe, expect, test } from 'vitest';
import { DAY_CYCLE_MS, getDayNight, nightFactor, nightTint, setDayNight } from '../src/render/daynight';

describe('nightFactor', () => {
  test('midday is bright, midnight is dark', () => {
    expect(nightFactor(0)).toBeLessThan(0.05);
    expect(nightFactor(DAY_CYCLE_MS / 2)).toBeGreaterThan(0.95);
  });

  test('always within 0..1 and periodic', () => {
    for (let k = 0; k < 40; k++) {
      const t = (k / 40) * DAY_CYCLE_MS * 2.7;
      const f = nightFactor(t);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
      expect(nightFactor(t + DAY_CYCLE_MS)).toBeCloseTo(f, 6);
    }
  });

  test('dusk sits between day and night', () => {
    const dusk = nightFactor(DAY_CYCLE_MS * 0.3);
    expect(dusk).toBeGreaterThan(0.05);
    expect(dusk).toBeLessThan(0.95);
  });
});

describe('day/night toggle', () => {
  test('defaults off', () => {
    expect(getDayNight()).toBe(false);
  });

  test('round-trips on and off', () => {
    setDayNight(true);
    expect(getDayNight()).toBe(true);
    setDayNight(false);
    expect(getDayNight()).toBe(false);
  });
});

describe('night wash', () => {
  test('the midnight tint is lighter than the v0.63 wash', () => {
    const m = /rgba\(\d+, \d+, \d+, ([\d.]+)\)/.exec(nightTint(1));
    expect(m).not.toBeNull();
    expect(parseFloat(m![1])).toBeLessThanOrEqual(0.5);
  });
});
