import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { figureBoxes, figureSprite, frameFor, paintFigure, PALETTES, STRIDE } from '../src/render/figure';
import { clearSprites, setCanvasFactory, spriteStats } from '../src/render/spritecache';
import { strictCtx, stubCanvasFactory } from './stubctx';

beforeEach(() => {
  setCanvasFactory(stubCanvasFactory().factory);
  clearSprites();
});
afterEach(() => setCanvasFactory(null));

const plain = { umbrella: false, mask: false };

describe('figure', () => {
  test('the gait steps a frame every STRIDE and cycles four', () => {
    expect([0, 1, 2, 3, 4, 5].map((k) => frameFor(k * STRIDE + 0.001))).toEqual([0, 1, 2, 3, 0, 1]);
    expect(frameFor(-1)).toBe(0);
  });

  test('a figure is under a pixel wide and under five tall; odd frames split the legs', () => {
    for (const frame of [0, 1, 2, 3] as const) {
      const boxes = figureBoxes(frame, plain);
      const top = Math.max(...boxes.map((b) => b.z + b.h));
      expect(top).toBeLessThan(5);
      expect(top).toBeGreaterThan(4.5);
      const legs = boxes.filter((b) => b.paint === 'trousers');
      expect(legs).toHaveLength(frame % 2 ? 2 : 1);
      expect(Math.max(...boxes.map((b) => Math.max(b.w, b.l)))).toBeLessThanOrEqual(1.1);
    }
    const wet = figureBoxes(0, { umbrella: true, mask: true });
    expect(wet.some((b) => b.paint === 'umbrella')).toBe(true);
    expect(wet.some((b) => b.paint === 'white')).toBe(true);
    expect(PALETTES).toHaveLength(12);
  });

  test('painting fills every face; a mask and a brolly add some', () => {
    const a = strictCtx();
    paintFigure(a.ctx, 3, 1, 0.4, 1, 0, plain);
    const fills = (t: string[]) => t.filter((c) => c.startsWith('fill(')).length;
    expect(fills(a.trace)).toBeGreaterThan(6);
    const b = strictCtx();
    paintFigure(b.ctx, 3, 1, 0.4, 1, 0, { umbrella: true, mask: true });
    expect(fills(b.trace)).toBeGreaterThan(fills(a.trace));
  });

  test('sprites bake once per palette, pose, heading and quarter; frame 2 shares frame 0', () => {
    figureSprite(0, 0, 0, 0, plain);
    expect(spriteStats().bakes).toBe(1);
    figureSprite(0, 0, 0.01, 0, plain); // same eighth of a turn
    figureSprite(0, 2, 0, 0, plain);
    expect(spriteStats().bakes).toBe(1);
    figureSprite(0, 1, 0, 0, plain);
    figureSprite(1, 0, 0, 0, plain);
    figureSprite(0, 0, Math.PI / 2, 0, plain);
    figureSprite(0, 0, 0, 1, plain);
    figureSprite(0, 0, 0, 0, { umbrella: true, mask: false });
    expect(spriteStats().bakes).toBe(6);
  });
});
