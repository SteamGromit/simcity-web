import { describe, expect, test } from 'vitest';
import { getWeatherFx, setWeatherFx } from '../src/render/fx';

describe('weather fx preference', () => {
  test('defaults on, toggles off and back', () => {
    expect(getWeatherFx()).toBe(true);
    setWeatherFx(false);
    expect(getWeatherFx()).toBe(false);
    setWeatherFx(true);
    expect(getWeatherFx()).toBe(true);
  });
});
