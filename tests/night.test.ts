import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { paintWindows, windowPlan } from '../src/render/windows';
import { drawStreetFurniture } from '../src/render/roadart';
import { hsl, material } from '../src/render/palette';
import { hash2 } from '../src/render/noise';
import { tileGeom } from '../src/render/iso';
import { clearSprites, setCanvasFactory } from '../src/render/spritecache';
import { strictCtx, stubCanvasFactory } from './stubctx';

describe('the night pass', () => {
  beforeEach(() => {
    setCanvasFactory(stubCanvasFactory().factory);
    clearSprites();
  });
  afterEach(() => setCanvasFactory(null));

  test('a curtain wall glows at no more than 0.6 alpha per pane, so it never whites out', () => {
    const { ctx, trace } = strictCtx();
    paintWindows(ctx, 40, 90, material('glass', hsl(208, 28, 46)), windowPlan('curtain', 90), 1, 3, true, true);
    const fills = trace.filter((t) => t.startsWith('fillStyle=hsl'));
    expect(fills.length).toBeGreaterThan(0);
    for (const f of fills) {
      const m = /\/ ([\d.]+)\)$/.exec(f);
      expect(m, f).not.toBeNull();
      expect(parseFloat(m![1])).toBeLessThanOrEqual(0.6);
    }
  });

  test('a lamp standard throws a pool on the street after dark, and none by day', () => {
    let seed = 1;
    while (hash2(seed, 1, 404) <= 0.72) seed++; // a tile that carries a lamp
    const day = strictCtx();
    drawStreetFurniture(day.ctx, tileGeom(4, 4, 0), 0b0101, seed, 2, 0, 1000);
    expect(day.trace.some((t) => t.startsWith('createRadialGradient'))).toBe(false);
    const night = strictCtx();
    drawStreetFurniture(night.ctx, tileGeom(4, 4, 0), 0b0101, seed, 2, 0.9, 1000);
    expect(night.trace.some((t) => t.startsWith('createRadialGradient'))).toBe(true);
  });
});
