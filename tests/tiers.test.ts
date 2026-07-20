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
import { makeCity, road, zone } from './helpers';
import { sumCapacities } from '../src/sim/capacity';
import { collectBudget } from '../src/sim/budget';
import { updatePollution } from '../src/sim/pollution';
import { developTile } from '../src/sim/develop';
import { simTick } from '../src/sim/city';
import { deserialize, serialize } from '../src/sim/save';
import { tierBreakdown, tierLabel } from '../src/sim/tierstats';

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

describe('tier-aware aggregates', () => {
  test('sumCapacities scales by tier', () => {
    const city = makeCity();
    zone(city, 1, 1, Zone.Residential, 2, 1); // 24 × 1.15 = 28
    zone(city, 2, 1, Zone.Residential, 2, 3); // 24 × 0.75 = 18
    zone(city, 3, 1, Zone.Industrial, 2, 'ag'); // 30 × 0.45 = 14
    zone(city, 4, 1, Zone.Industrial, 2, 'dirty'); // 30 × 1.15 = 35
    const { population, iJobs } = sumCapacities(city);
    expect(population).toBe(46);
    expect(iJobs).toBe(49);
  });

  test('§§§ residents out-earn § residents at equal head count', () => {
    const poor = makeCity();
    const rich = makeCity();
    // stage 5 § holds 276 (240 × 1.15); match it with §§§ lots at 180 each
    zone(poor, 1, 1, Zone.Residential, 5, 1);
    zone(rich, 1, 1, Zone.Residential, 5, 3);
    const poorReport = collectBudget(poor);
    const richReport = collectBudget(rich);
    const poorPer = poorReport.rIncome / sumCapacities(poor).population;
    const richPer = richReport.rIncome / sumCapacities(rich).population;
    expect(richPer).toBeGreaterThan(poorPer * 2);
  });

  test('high-tech industry out-earns farmland', () => {
    const farm = makeCity();
    const tech = makeCity();
    zone(farm, 1, 1, Zone.Industrial, 4, 'ag');
    zone(tech, 1, 1, Zone.Industrial, 4, 'tech');
    expect(collectBudget(tech).iIncome).toBeGreaterThan(collectBudget(farm).iIncome);
  });

  test('industry kind scales emission', () => {
    // A single stage-2 lot, measured on its own tile: no plume stacking, no
    // clamping, so the reading is the kind multiplier times the base emission.
    const reading = (tier: 'ag' | 'dirty' | 'manu' | 'tech') => {
      const city = makeCity();
      zone(city, 10, 10, Zone.Industrial, 2, tier);
      updatePollution(city);
      return city.tiles[idx(10, 10)].pollution;
    };
    expect(reading('manu')).toBeCloseTo(0.6, 2); // (0.3 + 0.15 × 2) × 1.00
    expect(reading('ag')).toBeCloseTo(0.06, 2); // × 0.10
    expect(reading('dirty')).toBeCloseTo(0.96, 2); // × 1.60
    expect(reading('tech')).toBeCloseTo(0.15, 2); // × 0.25
    expect(reading('dirty')).toBeGreaterThan(reading('ag') * 5);
  });
});

describe('tier assignment during development', () => {
  test('a newly built lot takes the tier its conditions call for', () => {
    const city = makeCity();
    road(city, 4, 5, 6, 5);
    zone(city, 5, 6, Zone.Residential, 0, 1);
    const t = city.tiles[idx(5, 6)];
    t.powered = true;
    t.landValue = 0.9;
    t.pollution = 0;
    t.commute = 2;
    city.demand.r = 1;
    for (let n = 0; n < 50 && t.stage === 0; n++) developTile(city, 5, 6, () => 0);
    expect(t.stage).toBeGreaterThan(0);
    expect(t.tier).toBe(3);
  });

  test('an industrial lot at density 1 builds as farmland', () => {
    const city = makeCity();
    road(city, 4, 5, 6, 5);
    zone(city, 5, 6, Zone.Industrial, 0, 'manu');
    const t = city.tiles[idx(5, 6)];
    t.powered = true;
    t.density = 1;
    t.commute = 2;
    city.demand.i = 1;
    for (let n = 0; n < 50 && t.stage === 0; n++) developTile(city, 5, 6, () => 0);
    expect(t.stage).toBeGreaterThan(0);
    expect(t.tier).toBe('ag');
  });
});

describe('simTick integration', () => {
  test('refreshes education and re-tiers on the monthly boundary', () => {
    const city = makeCity();
    // A real, powered School (fed by an adjacent PowerPlant) rather than a
    // hand-set schoolCov: updateCoverage recomputes coverage fields from
    // scratch on every field-refresh tick, so a manually seeded schoolCov
    // would be wiped out before updateEducation ever reads it.
    zone(city, 0, 9, Zone.PowerPlant);
    zone(city, 0, 8, Zone.School);
    for (let x = 0; x < 4; x++) {
      zone(city, x, 5, Zone.Residential, 2);
    }
    const rand = () => 0.5;
    for (let n = 0; n < 8; n++) simTick(city, rand);
    expect(city.month).toBe(1);
    expect(city.eduLevel).toBeGreaterThan(0);
  });
});

describe('saving tiers', () => {
  test('a round trip preserves tiers and education', () => {
    const city = makeCity();
    zone(city, 1, 1, Zone.Residential, 4, 3);
    zone(city, 2, 1, Zone.Industrial, 3, 'tech');
    city.eduLevel = 0.62;
    const revived = deserialize(serialize(city));
    expect(revived).not.toBeNull();
    expect(revived!.tiles[idx(1, 1)].tier).toBe(3);
    expect(revived!.tiles[idx(2, 1)].tier).toBe('tech');
    expect(revived!.eduLevel).toBeCloseTo(0.62);
  });

  test('a save predating tiers revives to the neutral tier', () => {
    const city = makeCity();
    zone(city, 1, 1, Zone.Residential, 4);
    zone(city, 2, 1, Zone.Industrial, 3);
    const raw = JSON.parse(serialize(city));
    for (const t of raw.tiles) delete t.tier;
    delete raw.eduLevel;
    const revived = deserialize(JSON.stringify(raw));
    expect(revived).not.toBeNull();
    // The neutral wealth is the blank-tile default and stands in for both
    // unions; reads normalize it per zone, so the industrial lot behaves as
    // manufacturing without the stored value having to say so.
    expect(revived!.tiles[idx(1, 1)].tier).toBe(2);
    expect(revived!.tiles[idx(2, 1)].tier).toBe(2);
    expect(normalizeTier(Zone.Industrial, revived!.tiles[idx(2, 1)].tier)).toBe('manu');
    expect(revived!.eduLevel).toBe(0);
  });

  test('an old industrial save keeps its capacity through normalization', () => {
    const city = makeCity();
    zone(city, 2, 1, Zone.Industrial, 3);
    const raw = JSON.parse(serialize(city));
    for (const t of raw.tiles) delete t.tier;
    const revived = deserialize(JSON.stringify(raw))!;
    const t = revived.tiles[idx(2, 1)];
    // 'manu' carries the 1.0 multiplier, so an old save's industry is worth
    // exactly what it was worth before tiers existed.
    expect(capacityFor(t.zone, t.tier, t.stage)).toBe(capacityFor(Zone.Industrial, 'manu', 3));
  });

  test('a garbage tier falls back rather than poisoning the sim', () => {
    const city = makeCity();
    zone(city, 1, 1, Zone.Residential, 4, 3);
    zone(city, 2, 1, Zone.Industrial, 3, 'tech');
    const raw = JSON.parse(serialize(city));
    raw.tiles[idx(1, 1)].tier = 'not-a-tier';
    raw.tiles[idx(2, 1)].tier = 99;
    const revived = deserialize(JSON.stringify(raw));
    expect(revived).not.toBeNull();
    expect(revived!.tiles[idx(1, 1)].tier).toBe(2);
    expect(revived!.tiles[idx(2, 1)].tier).toBe(2);
    // and the sim can still price them
    expect(Number.isFinite(capacityFor(Zone.Residential, revived!.tiles[idx(1, 1)].tier, 4))).toBe(true);
  });

  test('a non-numeric education level degrades to zero', () => {
    const city = makeCity();
    const raw = JSON.parse(serialize(city));
    raw.eduLevel = 'wat';
    expect(deserialize(JSON.stringify(raw))!.eduLevel).toBe(0);
  });

  test('an out-of-range education level is clamped', () => {
    const city = makeCity();
    const raw = JSON.parse(serialize(city));
    raw.eduLevel = 7.5; // a crafted save must not hand the sim an impossible share
    expect(deserialize(JSON.stringify(raw))!.eduLevel).toBe(1);
    raw.eduLevel = -3;
    expect(deserialize(JSON.stringify(raw))!.eduLevel).toBe(0);
  });
});

describe('tierLabel', () => {
  test('names wealth with section signs and industry by kind', () => {
    expect(tierLabel(Zone.Residential, 1)).toBe('§');
    expect(tierLabel(Zone.Residential, 3)).toBe('§§§');
    expect(tierLabel(Zone.Industrial, 'ag')).toBe('agricultural');
    expect(tierLabel(Zone.Industrial, 'tech')).toBe('high-tech');
  });
});

describe('tierBreakdown', () => {
  test('totals population by wealth and industrial jobs by kind', () => {
    const city = makeCity();
    zone(city, 1, 1, Zone.Residential, 2, 1); // 28 people
    zone(city, 2, 1, Zone.Residential, 2, 3); // 18 people
    zone(city, 3, 1, Zone.Industrial, 2, 'ag'); // 14 jobs
    zone(city, 4, 1, Zone.Industrial, 2, 'tech'); // 24 jobs
    const out = tierBreakdown(city);
    expect(out.wealth[1]).toBe(28);
    expect(out.wealth[3]).toBe(18);
    expect(out.wealth[2]).toBe(0);
    expect(out.industry.ag).toBe(14);
    expect(out.industry.tech).toBe(24);
    expect(out.industry.dirty).toBe(0);
  });

  test('skips abandoned lots', () => {
    const city = makeCity();
    zone(city, 1, 1, Zone.Residential, 4, 2);
    city.tiles[idx(1, 1)].abandoned = true;
    expect(tierBreakdown(city).wealth[2]).toBe(0);
  });
});
