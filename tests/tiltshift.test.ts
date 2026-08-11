import { describe, expect, test } from 'vitest';
import { getRenderStyle, setRenderStyle } from '../src/render/renderstyle';
import { TILT_BANDS, getTiltShift, setTiltShift } from '../src/render/tiltshift';

describe('tilt-shift pref', () => {
  test('untouched, it follows the render style: on in realistic only', () => {
    const orig = getRenderStyle();
    setRenderStyle('realistic');
    expect(getTiltShift()).toBe(true);
    setRenderStyle('pixel');
    expect(getTiltShift()).toBe(false);
    setRenderStyle(orig);
  });
  test('an explicit choice sticks across style changes', () => {
    setRenderStyle('pixel');
    setTiltShift(true);
    expect(getTiltShift()).toBe(true);
    setRenderStyle('realistic');
    setTiltShift(false);
    expect(getTiltShift()).toBe(false);
  });
  test('bands leave a clear focus strip', () => {
    expect(TILT_BANDS.topEnd).toBeGreaterThan(0.2);
    expect(TILT_BANDS.botStart).toBeGreaterThan(TILT_BANDS.topEnd + 0.25);
    expect(TILT_BANDS.botStart).toBeLessThan(1);
  });
});
