import { describe, expect, test } from 'vitest';
import { composeBar, HIJAZ, MAJOR_PENTA, MINOR_PENTA, moodFrom } from '../src/ui/music';
import { Zone } from '../src/sim/types';
import { mulberry32 } from '../src/sim/city';
import { makeCity, zone } from './helpers';

/** makeCity starts in January (winter); April is the neutral baseline. */
function springCity() {
  const city = makeCity();
  city.month = 3;
  return city;
}

describe('moodFrom', () => {
  test('a village plays a lone slow melody; a metropolis brings the band', () => {
    const village = springCity();
    const v = moodFrom(village);
    expect(v.layers).toEqual({ pad: false, bass: false, melody: true, percussion: false });
    expect(v.tempo).toBe(70);

    const metro = springCity();
    metro.population = 25000;
    const m = moodFrom(metro);
    expect(m.layers).toEqual({ pad: true, bass: true, melody: true, percussion: true });
    expect(m.tempo).toBe(110);
  });

  test('desert cities play the hijaz scale on a higher root', () => {
    const city = springCity();
    expect(moodFrom(city).scale).toEqual(MAJOR_PENTA);
    expect(moodFrom(city).root).toBe(110);
    city.biome = 'desert';
    expect(moodFrom(city).scale).toEqual(HIJAZ);
    expect(moodFrom(city).root).toBeCloseTo(146.83);
  });

  test('winter turns minor, low, and slow; summer lifts the register', () => {
    const jan = makeCity(); // month 0 = January
    const w = moodFrom(jan);
    expect(w.minor).toBe(true);
    expect(w.register).toBe(-1);
    expect(w.tempo).toBe(60); // village 70 − 10

    const jun = makeCity();
    jun.month = 6;
    expect(moodFrom(jun).register).toBe(1);
  });

  test('an industrial town goes minor pentatonic', () => {
    const city = springCity();
    for (let x = 0; x < 30; x++) zone(city, x, 1, Zone.Industrial, 2);
    for (let x = 0; x < 5; x++) zone(city, x, 2, Zone.Residential, 2);
    const mood = moodFrom(city);
    expect(mood.minor).toBe(true);
    expect(mood.scale).toEqual(MINOR_PENTA);
  });

  test('rain softens and thins; snow rings bells', () => {
    const city = springCity();
    city.weather.kind = 'rain';
    const r = moodFrom(city);
    expect(r.sparse).toBe(true);
    expect(r.volume).toBeCloseTo(0.7);
    city.weather.kind = 'snow';
    const s = moodFrom(city);
    expect(s.sparse).toBe(true);
    expect(s.bells).toBe(true);
  });

  test('an active disaster ducks the music', () => {
    const city = springCity();
    city.disasters.hurricaneTicks = 5;
    expect(moodFrom(city).duck).toBe(true);
  });
});

describe('composeBar', () => {
  test('deterministic for a seeded rand, and melody stays on the scale', () => {
    const city = springCity();
    city.population = 25000;
    const mood = moodFrom(city);
    const a = composeBar(mood, 0, mulberry32(7));
    const b = composeBar(mood, 0, mulberry32(7));
    expect(a).toEqual(b);
    for (const e of a.filter((e) => e.layer === 'melody')) {
      const semis = Math.round(Math.log2(e.freq / mood.root) * 12);
      expect(mood.scale).toContain(((semis % 12) + 12) % 12);
    }
  });

  test('layers follow the mood: a village bar has melody only', () => {
    const mood = moodFrom(springCity());
    const layers = new Set(composeBar(mood, 0, mulberry32(1)).map((e) => e.layer));
    expect(layers).toEqual(new Set(['melody']));
  });

  test('sparse weather halves the melody notes', () => {
    const clear = springCity();
    const rainy = springCity();
    rainy.weather.kind = 'rain';
    const full = composeBar(moodFrom(clear), 0, mulberry32(2));
    const thin = composeBar(moodFrom(rainy), 0, mulberry32(2));
    const melody = (bar: typeof full) => bar.filter((e) => e.layer === 'melody').length;
    expect(melody(full)).toBe(4);
    expect(melody(thin)).toBe(2);
  });

  test('a disaster bar is nothing but a low drone', () => {
    const city = springCity();
    city.population = 25000;
    city.disasters.pandemicMonths = 2;
    const bar = composeBar(moodFrom(city), 0, mulberry32(3));
    expect(bar.length).toBeGreaterThan(0);
    expect(bar.every((e) => e.layer === 'pad')).toBe(true);
  });
});
