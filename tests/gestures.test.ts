import { describe, expect, test } from 'vitest';
import { midpoint, pinchFrame, pinchPan, pinchZoomFactor, spread } from '../src/ui/gestures';

describe('pinch primitives', () => {
  test('midpoint sits halfway between the fingers', () => {
    expect(midpoint({ x: 0, y: 0 }, { x: 10, y: 20 })).toEqual({ x: 5, y: 10 });
    expect(midpoint({ x: -6, y: 4 }, { x: 6, y: -4 })).toEqual({ x: 0, y: 0 });
  });

  test('spread is the distance between them, and order does not matter', () => {
    expect(spread({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(spread({ x: 3, y: 4 }, { x: 0, y: 0 })).toBe(5);
  });
});

describe('pinchZoomFactor', () => {
  test('fingers moving apart zooms in, together zooms out', () => {
    const prev = pinchFrame({ x: 0, y: 0 }, { x: 0, y: 100 });
    const wider = pinchFrame({ x: 0, y: 0 }, { x: 0, y: 150 });
    const tighter = pinchFrame({ x: 0, y: 0 }, { x: 0, y: 50 });
    expect(pinchZoomFactor(prev, wider)).toBeCloseTo(1.5, 10);
    expect(pinchZoomFactor(prev, tighter)).toBeCloseTo(0.5, 10);
  });

  test('an unchanged spread is a factor of exactly 1', () => {
    const f = pinchFrame({ x: 10, y: 10 }, { x: 40, y: 50 });
    expect(pinchZoomFactor(f, f)).toBe(1);
  });

  test('two pointers at the same spot cannot send the zoom to Infinity', () => {
    const degenerate = pinchFrame({ x: 7, y: 7 }, { x: 7, y: 7 });
    const normal = pinchFrame({ x: 0, y: 0 }, { x: 0, y: 100 });
    expect(degenerate.spread).toBe(0);
    expect(pinchZoomFactor(degenerate, normal)).toBe(1);
    expect(pinchZoomFactor(normal, degenerate)).toBe(1);
    expect(Number.isFinite(pinchZoomFactor(degenerate, degenerate))).toBe(true);
  });
});

describe('pinchPan', () => {
  test('the midpoint travel is the pan, independent of the zoom', () => {
    // Both fingers slide right by 20 and the spread doubles at the same time.
    const prev = pinchFrame({ x: 0, y: 0 }, { x: 0, y: 100 });
    const next = pinchFrame({ x: 20, y: -50 }, { x: 20, y: 150 });
    expect(pinchPan(prev, next)).toEqual({ x: 20, y: 0 });
    expect(pinchZoomFactor(prev, next)).toBeCloseTo(2, 10);
  });

  test('a pure drag with a fixed spread pans without zooming', () => {
    const prev = pinchFrame({ x: 0, y: 0 }, { x: 60, y: 80 });
    const next = pinchFrame({ x: 15, y: 5 }, { x: 75, y: 85 });
    expect(pinchPan(prev, next)).toEqual({ x: 15, y: 5 });
    expect(pinchZoomFactor(prev, next)).toBe(1);
  });
});
