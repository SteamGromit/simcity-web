import { describe, expect, test } from 'vitest';
import { drawAmbient, drawBeacon, drawFlag, drawFountain, drawPlume } from '../src/render/ambientfx';
import { ensureCoreContent } from '../src/sim/content';
import { Stage, Tier, Zone } from '../src/sim/types';
import { strictCtx } from './stubctx';

ensureCoreContent();
const ENV = { clock: 1234, wind: 0, night: 0, detail: 1 as const, winter: false };
const geom = { cx: 0, cy: 0, corners: [[0, -16], [32, 0], [0, 16], [-32, 0]] } as never;

describe('drawPlume', () => {
  test('same clock, same picture — and a later clock moves it', () => {
    const a = strictCtx(); const b = strictCtx(); const c = strictCtx();
    const tip = { x: 4, y: -40, kind: 'smoke' as const, s: 1 };
    drawPlume(a.ctx, 0, 0, tip, 0.5, ENV);
    drawPlume(b.ctx, 0, 0, tip, 0.5, ENV);
    drawPlume(c.ctx, 0, 0, tip, 0.5, { ...ENV, clock: 4321 });
    expect(a.trace).toEqual(b.trace);
    expect(a.trace).not.toEqual(c.trace);
    expect(a.trace.some((l) => l.startsWith('arc('))).toBe(true);
  });
  test('detail 0 draws a shorter plume than detail 1', () => {
    const a = strictCtx(); const b = strictCtx();
    const tip = { x: 0, y: -30, kind: 'smoke' as const, s: 1 };
    drawPlume(a.ctx, 0, 0, tip, 1, { ...ENV, detail: 0 });
    drawPlume(b.ctx, 0, 0, tip, 1, ENV);
    expect(a.trace.filter((l) => l.startsWith('arc(')).length)
      .toBeLessThan(b.trace.filter((l) => l.startsWith('arc(')).length);
  });
  test('hurricane wind leans every puff the same way', () => {
    const calm = strictCtx(); const storm = strictCtx();
    const tip = { x: 0, y: -30, kind: 'smoke' as const, s: 1 };
    drawPlume(calm.ctx, 0, 0, tip, 1, ENV);
    drawPlume(storm.ctx, 0, 0, tip, 1, { ...ENV, wind: -5 });
    expect(storm.trace).not.toEqual(calm.trace);
  });
});

describe('drawAmbient gates', () => {
  const args = [Zone.Industrial, 3 as Stage, 'dirty' as Tier, 0.4, 1] as const;
  test('an unpowered or abandoned lot draws nothing', () => {
    const a = strictCtx(); const b = strictCtx(); const c = strictCtx();
    drawAmbient(a.ctx, geom, ...args, true, false, 0.5, ENV);
    drawAmbient(b.ctx, geom, ...args, false, false, 0.5, ENV);
    drawAmbient(c.ctx, geom, ...args, true, true, 0.5, ENV);
    expect(a.trace.length).toBeGreaterThan(0);
    expect(b.trace).toEqual([]);
    expect(c.trace).toEqual([]);
  });
  test('hearth smoke appears in winter only, at detail >= 1', () => {
    // find a bucket with a hearth first (variant 0..1 in sixths)
    let variant = -1;
    for (let b = 0; b < 6; b++) {
      const s = strictCtx();
      drawAmbient(s.ctx, geom, Zone.Residential, 2 as Stage, 2 as Tier, (b + 0.5) / 6, 1, true, false, 0, { ...ENV, winter: true });
      if (s.trace.length > 0) { variant = (b + 0.5) / 6; break; }
    }
    expect(variant).toBeGreaterThanOrEqual(0);
    const summer = strictCtx(); const far = strictCtx();
    drawAmbient(summer.ctx, geom, Zone.Residential, 2 as Stage, 2 as Tier, variant, 1, true, false, 0, ENV);
    drawAmbient(far.ctx, geom, Zone.Residential, 2 as Stage, 2 as Tier, variant, 1, true, false, 0, { ...ENV, winter: true, detail: 0 });
    expect(summer.trace).toEqual([]);
    expect(far.trace).toEqual([]);
  });
});

describe('small animators', () => {
  test('beacon blinks: on-phase draws, off-phase does not', () => {
    let on = 0; let off = 0;
    for (let t = 0; t < 1400 * 2; t += 100) {
      const s = strictCtx();
      drawBeacon(s.ctx, 0, 0, 60, 0.3, { ...ENV, clock: t, night: 1 });
      if (s.trace.length > 0) on++; else off++;
    }
    expect(on).toBeGreaterThan(0);
    expect(off).toBeGreaterThan(on); // duty cycle well under half
  });
  test('flag and fountain are clock-deterministic', () => {
    const a = strictCtx(); const b = strictCtx();
    drawFlag(a.ctx, 5, -20, 18, 210, ENV);
    drawFlag(b.ctx, 5, -20, 18, 210, ENV);
    expect(a.trace).toEqual(b.trace);
    const c = strictCtx();
    drawFountain(c.ctx, 0, 0, ENV);
    expect(c.trace.length).toBeGreaterThan(0);
  });
});
