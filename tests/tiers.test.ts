import { describe, expect, test } from 'vitest';
import { Zone } from '../src/sim/types';
import {
  capacityFor,
  chooseTier,
  normalizeTier,
  pollutionScaleFor,
  retierMonthly,
  taxYieldFor,
  updateEducation,
} from '../src/sim/tiers';
import { idx } from '../src/sim/grid';
import { makeCity, zone } from './helpers';

describe('normalizeTier', () => {
  test('passes through a valid wealth on R/C', () => {
    expect(normalizeTier(Zone.Residential, 3)).toBe(3);
    expect(normalizeTier(Zone.Commercial, 1)).toBe(1);
  });

  test('passes through a valid kind on I', () => {
    expect(normalizeTier(Zone.Industrial, 'tech')).toBe('tech');
    expect(normalizeTier(Zone.Industrial, 'ag')).toBe('ag');
  });

  test('maps a stray industry kind on R/C to neutral wealth', () => {
    expect(normalizeTier(Zone.Residential, 'dirty')).toBe(2);
    expect(normalizeTier(Zone.Commercial, 'ag')).toBe(2);
  });

  test('maps a stray wealth on I to manufacturing', () => {
    expect(normalizeTier(Zone.Industrial, 1)).toBe('manu');
    expect(normalizeTier(Zone.Industrial, 3)).toBe('manu');
  });
});

describe('capacityFor', () => {
  test('neutral tiers reproduce the base tables exactly', () => {
    expect(capacityFor(Zone.Residential, 2, 2)).toBe(24); // R_POP[2]
    expect(capacityFor(Zone.Commercial, 2, 3)).toBe(45); // C_JOBS[3]
    expect(capacityFor(Zone.Industrial, 'manu', 2)).toBe(30); // I_JOBS[2]
  });

  test('wealth trades capacity for yield', () => {
    expect(capacityFor(Zone.Residential, 1, 2)).toBe(28); // 24 × 1.15
    expect(capacityFor(Zone.Residential, 3, 2)).toBe(18); // 24 × 0.75
  });

  test('farms hold few jobs, dirty industry holds many', () => {
    expect(capacityFor(Zone.Industrial, 'ag', 2)).toBe(14); // 30 × 0.45
    expect(capacityFor(Zone.Industrial, 'dirty', 2)).toBe(35); // 30 × 1.15
    expect(capacityFor(Zone.Industrial, 'tech', 2)).toBe(24); // 30 × 0.80
  });

  test('stage 0 has no capacity at any tier', () => {
    expect(capacityFor(Zone.Residential, 3, 0)).toBe(0);
    expect(capacityFor(Zone.Industrial, 'dirty', 0)).toBe(0);
  });

  test('a non-RCI zone has no capacity', () => {
    expect(capacityFor(Zone.Park, 2, 3)).toBe(0);
    expect(capacityFor(Zone.Road, 2, 3)).toBe(0);
  });
});

describe('taxYieldFor', () => {
  test('richer tiers pay more per occupant', () => {
    expect(taxYieldFor(Zone.Residential, 1)).toBeCloseTo(0.75);
    expect(taxYieldFor(Zone.Residential, 2)).toBeCloseTo(1.0);
    expect(taxYieldFor(Zone.Residential, 3)).toBeCloseTo(1.7);
  });

  test('high-tech is the most lucrative industry, farms the least', () => {
    expect(taxYieldFor(Zone.Industrial, 'tech')).toBeCloseTo(1.75);
    expect(taxYieldFor(Zone.Industrial, 'ag')).toBeCloseTo(0.6);
  });
});

describe('pollutionScaleFor', () => {
  test('farms are near-clean and dirty industry is the worst', () => {
    expect(pollutionScaleFor('ag')).toBeCloseTo(0.1);
    expect(pollutionScaleFor('dirty')).toBeCloseTo(1.6);
    expect(pollutionScaleFor('manu')).toBeCloseTo(1.0);
    expect(pollutionScaleFor('tech')).toBeCloseTo(0.25);
  });
});

describe('updateEducation', () => {
  test('an empty city has zero education', () => {
    const city = makeCity();
    updateEducation(city);
    expect(city.eduLevel).toBe(0);
  });

  test('measures the share of developed R tiles with school coverage', () => {
    const city = makeCity();
    for (let x = 0; x < 4; x++) zone(city, x, 5, Zone.Residential, 2);
    city.tiles[idx(0, 5)].schoolCov = 0.8;
    city.tiles[idx(1, 5)].schoolCov = 0.2;
    updateEducation(city);
    expect(city.eduLevel).toBeCloseTo(0.5); // 2 of 4 covered
  });

  test('ignores undeveloped and abandoned lots', () => {
    const city = makeCity();
    zone(city, 0, 5, Zone.Residential, 2);
    city.tiles[idx(0, 5)].schoolCov = 0.9;
    zone(city, 1, 5, Zone.Residential, 0); // undeveloped
    zone(city, 2, 5, Zone.Residential, 3); // abandoned below
    city.tiles[idx(2, 5)].abandoned = true;
    updateEducation(city);
    expect(city.eduLevel).toBe(1);
  });
});

describe('chooseTier — residential and commercial wealth', () => {
  function rcTile(city: ReturnType<typeof makeCity>, landValue: number, pollution: number) {
    zone(city, 5, 5, Zone.Residential, 2);
    const t = city.tiles[idx(5, 5)];
    t.landValue = landValue;
    t.pollution = pollution;
    return t;
  }

  test('high land value in clean air becomes §§§', () => {
    const city = makeCity();
    expect(chooseTier(city, rcTile(city, 0.7, 0.05))).toBe(3);
  });

  test('the same land value under pollution is capped', () => {
    const city = makeCity();
    expect(chooseTier(city, rcTile(city, 0.7, 0.4))).toBe(1);
  });

  test('middling land value becomes §§', () => {
    const city = makeCity();
    expect(chooseTier(city, rcTile(city, 0.5, 0.1))).toBe(2);
  });

  test('low land value stays §', () => {
    const city = makeCity();
    expect(chooseTier(city, rcTile(city, 0.3, 0.0))).toBe(1);
  });

  test('commercial uses the same wealth thresholds', () => {
    const city = makeCity();
    zone(city, 6, 6, Zone.Commercial, 2);
    const t = city.tiles[idx(6, 6)];
    t.landValue = 0.7;
    t.pollution = 0.05;
    expect(chooseTier(city, t)).toBe(3);
  });
});

describe('chooseTier — industry kind', () => {
  function iTile(
    city: ReturnType<typeof makeCity>,
    density: 1 | 2 | 3,
    pollution: number,
  ) {
    zone(city, 8, 8, Zone.Industrial, 2);
    const t = city.tiles[idx(8, 8)];
    t.density = density;
    t.pollution = pollution;
    return t;
  }

  test('density 1 industrial is always farmland, whatever the education', () => {
    const city = makeCity();
    city.eduLevel = 0.9;
    expect(chooseTier(city, iTile(city, 1, 0.0))).toBe('ag');
  });

  test('an uneducated city gets dirty industry', () => {
    const city = makeCity();
    city.eduLevel = 0.1;
    expect(chooseTier(city, iTile(city, 2, 0.0))).toBe('dirty');
  });

  test('a moderately educated city gets manufacturing', () => {
    const city = makeCity();
    city.eduLevel = 0.4;
    expect(chooseTier(city, iTile(city, 2, 0.0))).toBe('manu');
  });

  test('a highly educated city with clean air gets high-tech', () => {
    const city = makeCity();
    city.eduLevel = 0.7;
    expect(chooseTier(city, iTile(city, 2, 0.1))).toBe('tech');
  });

  test('high-tech will not move into polluted air', () => {
    const city = makeCity();
    city.eduLevel = 0.7;
    expect(chooseTier(city, iTile(city, 2, 0.5))).toBe('manu');
  });
});

describe('retierMonthly', () => {
  const always = () => 0; // rand below the rate limit: convert whenever eligible
  const never = () => 0.99; // rand above the rate limit: never convert

  function richTile(city: ReturnType<typeof makeCity>) {
    zone(city, 5, 5, Zone.Residential, 4, 1); // currently §, deserves §§§
    const t = city.tiles[idx(5, 5)];
    t.landValue = 0.9;
    t.pollution = 0;
    return t;
  }

  test('converts one step at a time, never skipping a tier', () => {
    const city = makeCity();
    const t = richTile(city);
    retierMonthly(city, always);
    expect(t.tier).toBe(2); // § → §§, not straight to §§§
    retierMonthly(city, always);
    expect(t.tier).toBe(3);
    retierMonthly(city, always);
    expect(t.tier).toBe(3); // already at the verdict; holds
  });

  test('the rate limit holds a tile that would otherwise convert', () => {
    const city = makeCity();
    const t = richTile(city);
    retierMonthly(city, never);
    expect(t.tier).toBe(1);
  });

  test('preserves stage across a conversion', () => {
    const city = makeCity();
    const t = richTile(city);
    retierMonthly(city, always);
    expect(t.stage).toBe(4);
  });

  test('a tile inside the dead band holds its tier', () => {
    const city = makeCity();
    zone(city, 5, 5, Zone.Residential, 4, 1);
    const t = city.tiles[idx(5, 5)];
    t.pollution = 0;
    t.landValue = 0.44; // verdict is §§, but only 0.02 past the 0.42 gate
    for (let m = 0; m < 24; m++) retierMonthly(city, always);
    expect(t.tier).toBe(1);
  });

  test('a tile well past the gate converts', () => {
    const city = makeCity();
    zone(city, 5, 5, Zone.Residential, 4, 1);
    const t = city.tiles[idx(5, 5)];
    t.pollution = 0;
    t.landValue = 0.5; // clears 0.42 by well over the 0.05 band
    retierMonthly(city, always);
    expect(t.tier).toBe(2);
  });

  test('downgrades a tile whose neighborhood has decayed', () => {
    const city = makeCity();
    zone(city, 5, 5, Zone.Residential, 4, 3); // §§§ today
    const t = city.tiles[idx(5, 5)];
    t.landValue = 0.1; // well below every gate
    t.pollution = 0.6;
    retierMonthly(city, always);
    expect(t.tier).toBe(2); // one step down
  });

  test('a §§§ lot does not oscillate when pollution hovers just past its ceiling', () => {
    const city = makeCity();
    zone(city, 5, 5, Zone.Residential, 4, 3); // §§§ today
    const t = city.tiles[idx(5, 5)];
    t.landValue = 0.9; // comfortably above every land-value gate
    t.pollution = 0.17; // past the §§§ ceiling (0.15) but inside the 0.05 band
    for (let m = 0; m < 24; m++) retierMonthly(city, always);
    expect(t.tier).toBe(3); // holds — no flicker
  });

  test('a §§§ lot demotes once pollution clears its ceiling by more than DEAD_BAND', () => {
    const city = makeCity();
    zone(city, 5, 5, Zone.Residential, 4, 3); // §§§ today
    const t = city.tiles[idx(5, 5)];
    t.landValue = 0.9; // comfortably above every land-value gate
    t.pollution = 0.22; // clears the 0.15 ceiling by more than the 0.05 band
    retierMonthly(city, always);
    expect(t.tier).toBe(2); // one step down
  });

  test('farmland is never overruled by the sim', () => {
    const city = makeCity();
    city.eduLevel = 0.9;
    zone(city, 8, 8, Zone.Industrial, 2, 'ag');
    const t = city.tiles[idx(8, 8)];
    t.density = 1;
    for (let m = 0; m < 24; m++) retierMonthly(city, always);
    expect(t.tier).toBe('ag');
  });

  test('industry walks dirty → manu → tech one step at a time', () => {
    const city = makeCity();
    city.eduLevel = 0.9;
    zone(city, 8, 8, Zone.Industrial, 3, 'dirty');
    const t = city.tiles[idx(8, 8)];
    t.density = 2;
    t.pollution = 0;
    retierMonthly(city, always);
    expect(t.tier).toBe('manu');
    retierMonthly(city, always);
    expect(t.tier).toBe('tech');
  });

  test('a tech lot demotes to manu once pollution clears its ceiling by more than DEAD_BAND', () => {
    const city = makeCity();
    city.eduLevel = 0.9; // high and stable — well above TECH_EDU throughout
    zone(city, 8, 8, Zone.Industrial, 3, 'tech');
    const t = city.tiles[idx(8, 8)];
    t.density = 2;
    t.pollution = 0.4; // clears TECH_MAX_POLLUTION (0.3) by more than the 0.05 band
    retierMonthly(city, always);
    expect(t.tier).toBe('manu');
  });

  test('a tech lot holds when pollution is inside the dead band above its ceiling', () => {
    const city = makeCity();
    city.eduLevel = 0.9; // high and stable — well above TECH_EDU throughout
    zone(city, 8, 8, Zone.Industrial, 3, 'tech');
    const t = city.tiles[idx(8, 8)];
    t.density = 2;
    t.pollution = 0.32; // past TECH_MAX_POLLUTION (0.3) but inside the 0.05 band
    for (let m = 0; m < 24; m++) retierMonthly(city, always);
    expect(t.tier).toBe('tech'); // holds — no flicker
  });

  test('a manu lot demotes to dirty when eduLevel falls decisively below MANU_EDU', () => {
    const city = makeCity();
    city.eduLevel = 0.2; // more than DEAD_BAND below MANU_EDU (0.3)
    zone(city, 8, 8, Zone.Industrial, 3, 'manu');
    const t = city.tiles[idx(8, 8)];
    t.density = 2;
    t.pollution = 0;
    retierMonthly(city, always);
    expect(t.tier).toBe('dirty');
  });

  test('a tech lot demotes to manu when eduLevel falls below TECH_EDU - DEAD_BAND', () => {
    // Regression test: this value (0.4) is the critical discriminator between the
    // correct gate (current === 'tech' ? TECH_EDU : MANU_EDU) and a buggy version
    // keyed off verdict. With 0.4:
    // - Falls below TECH_EDU - DEAD_BAND (0.5), triggering demotion
    // - Stays above MANU_EDU - DEAD_BAND (0.25), so only the correct gate catches it
    const city = makeCity();
    city.eduLevel = 0.4;
    zone(city, 8, 8, Zone.Industrial, 3, 'tech');
    const t = city.tiles[idx(8, 8)];
    t.density = 2;
    t.pollution = 0; // held low, no pollution-based demotion
    retierMonthly(city, always);
    expect(t.tier).toBe('manu');
  });

  test('leaves undeveloped and abandoned lots alone', () => {
    const city = makeCity();
    zone(city, 5, 5, Zone.Residential, 0, 1);
    zone(city, 6, 5, Zone.Residential, 4, 1);
    city.tiles[idx(6, 5)].abandoned = true;
    for (const [x, y] of [[5, 5], [6, 5]] as const) {
      const t = city.tiles[idx(x, y)];
      t.landValue = 0.9;
      t.pollution = 0;
    }
    retierMonthly(city, always);
    expect(city.tiles[idx(5, 5)].tier).toBe(1);
    expect(city.tiles[idx(6, 5)].tier).toBe(1);
  });
});
