import { describe, expect, it } from 'vitest';
import { Zone } from '../src/sim/types';
import { CAR_GAP, servedNow, stopIndices, trainCars, vehicleCount, vehicleProgress, vehicleProgressWithDwell } from '../src/render/linevehicles';
import { idx } from '../src/sim/grid';
import { makeCity } from './helpers';

describe('vehicleProgress', () => {
  const LEN = 11; // path of 11 tiles → 10 steps out, 10 back

  it('starts at the origin heading out', () => {
    const p = vehicleProgress(LEN, 0, 1, 0);
    expect(p.seg).toBe(0);
    expect(p.frac).toBe(0);
    expect(p.dir).toBe(1);
  });

  it('reaches the far end at half cycle', () => {
    const p = vehicleProgress(LEN, 10, 1, 0); // 10 steps at speed 1
    expect(p.seg).toBe(LEN - 2);
    expect(p.frac).toBeCloseTo(1, 5);
  });

  it('returns with dir flipped after half cycle', () => {
    const p = vehicleProgress(LEN, 15, 1, 0);
    expect(p.dir).toBe(-1);
    // 5 steps home from the end lands exactly on tile 5: seg 5, frac 0
    expect(p.seg).toBe(5);
    expect(p.frac).toBeCloseTo(0, 5);
  });

  it('wraps the full cycle and keeps seg/frac in range forever', () => {
    for (let t = 0; t < 100; t += 0.7) {
      const p = vehicleProgress(LEN, t, 1.3, 5);
      expect(p.seg).toBeGreaterThanOrEqual(0);
      expect(p.seg).toBeLessThanOrEqual(LEN - 2);
      expect(p.frac).toBeGreaterThanOrEqual(0);
      expect(p.frac).toBeLessThanOrEqual(1);
    }
  });
});

describe('vehicleCount', () => {
  it('scales with path length, clamped 1..3', () => {
    expect(vehicleCount(4)).toBe(1);
    expect(vehicleCount(25)).toBe(2);
    expect(vehicleCount(80)).toBe(3);
  });
});

describe('vehicleProgressWithDwell', () => {
  const LEN = 11; // 10 steps
  const STOPS = [0, 5, 10];
  const at = (t: number) => vehicleProgressWithDwell(LEN, STOPS, t, 1, 0, 2);

  it('holds at each stop for the dwell, out and back, and the cycle grows to match', () => {
    expect(at(1)).toMatchObject({ dwelling: true, at: 0, dist: 0, dir: 1 });
    expect(at(4)).toMatchObject({ dwelling: false, dir: 1 });
    expect(at(4).dist).toBeCloseTo(2, 9);
    expect(at(8)).toMatchObject({ dwelling: true, at: 5, dist: 5 });
    expect(at(15)).toMatchObject({ dwelling: true, at: 10, dist: 10 });
    // half cycle 10 + 3 × 2 = 16; the way back mirrors it
    expect(at(17)).toMatchObject({ dwelling: true, at: 10, dir: -1 });
    expect(at(20).dist).toBeCloseTo(8, 9);
    expect(at(20).dir).toBe(-1);
    expect(at(24)).toMatchObject({ dwelling: true, at: 5, dir: -1 });
    const a = at(0.5);
    const b = at(32.5);
    expect(b.dist).toBeCloseTo(a.dist, 9);
    expect(b.dir).toBe(a.dir);
  });

  it('without stops it is plain vehicleProgress', () => {
    for (let t = 0; t < 40; t += 0.37) {
      const p = vehicleProgressWithDwell(LEN, [], t, 1.3, 5);
      const q = vehicleProgress(LEN, t, 1.3, 5);
      expect(p.seg).toBe(q.seg);
      expect(p.frac).toBeCloseTo(q.frac, 9);
      expect(p.dir).toBe(q.dir);
      expect(p.dwelling).toBe(false);
    }
  });

  it('keeps seg and frac in range forever', () => {
    for (let t = 0; t < 200; t += 0.7) {
      const p = at(t);
      expect(p.seg).toBeGreaterThanOrEqual(0);
      expect(p.seg).toBeLessThanOrEqual(LEN - 2);
      expect(p.frac).toBeGreaterThanOrEqual(0);
      expect(p.frac).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});

describe('trains and stops', () => {
  it('a train\'s cars trail the lead by CAR_GAP, clamped to the path', () => {
    expect(trainCars(5, 1, 10)).toEqual([5, 5 - CAR_GAP, 5 - 2 * CAR_GAP]);
    expect(trainCars(5, -1, 10)).toEqual([5, 5 + CAR_GAP, 5 + 2 * CAR_GAP]);
    // at the near terminus the lead holds back so the cars never pile up
    expect(trainCars(0.2, 1, 10)).toEqual([2 * CAR_GAP, CAR_GAP, 0]);
    const back = trainCars(9.9, -1, 10);
    expect(back[0]).toBeCloseTo(10 - 2 * CAR_GAP, 9);
    expect(back[1]).toBeCloseTo(10 - CAR_GAP, 9);
    expect(back[2]).toBe(10);
  });

  it('a stop maps to the path tile it sits on or beside', () => {
    const path: [number, number][] = [];
    for (let x = 10; x <= 20; x++) path.push([x, 10]);
    expect(stopIndices({ id: 1, mode: Zone.BusStop, color: '#000', path, stops: [[12, 11], [15, 10], [40, 40]] })).toEqual([2, 5]);
    // two stops either side of one path tile are one dwell, so the headways stay even
    expect(stopIndices({ id: 1, mode: Zone.BusStop, color: '#000', path, stops: [[15, 9], [15, 11]] })).toEqual([5]);
  });

  it('the terminus layover is one continuous dwell across the half cycle', () => {
    const half = 10 + 3 * 2;
    for (const t of [half - 1e-6, half, half + 1e-6]) {
      expect(vehicleProgressWithDwell(11, [0, 5, 10], t, 1, 0, 2)).toMatchObject({ dwelling: true, at: 10 });
    }
  });

  it('servedNow names the stop tiles a vehicle is dwelling at', () => {
    const city = makeCity();
    const path: [number, number][] = [];
    for (let x = 10; x <= 20; x++) path.push([x, 10]);
    city.transitLines.push({ id: 1, mode: Zone.BusStop, color: '#000', path, stops: [[10, 11], [20, 11]] });
    // one bus (11 tiles), speed 1.6: it dwells at the first stop from the start
    expect([...servedNow(city, 0.5)]).toEqual([idx(10, 11)]);
    expect(servedNow(city, 3).size).toBe(0);
  });
});
