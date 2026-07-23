import { beforeAll, describe, expect, test } from 'vitest';
import { buildingByTool, ordinanceById, registerPack, resetRegistry } from '../src/content/registry';
import { CORE_PACK } from '../src/content/packs/core';
import { mapScaled } from '../src/sim/types';

/**
 * Golden values, copied by hand from the tables this refactor replaces:
 * COSTS and SERVICE_RADII/SERVICE_UPKEEP in sim/types.ts, UPKEEP in
 * sim/budget.ts, PLANT_SPECS in sim/energy.ts, TRANSIT_SPECS in
 * sim/transit.ts. They are literals on purpose — reading them from the
 * source tables would make this test tautological, and the tables are
 * about to be deleted.
 */
const EXPECTED: Record<string, { cost: number; upkeep: number }> = {
  road: { cost: 10, upkeep: 1 },
  line: { cost: 5, upkeep: 0.2 },
  park: { cost: 50, upkeep: 2 },
  pump: { cost: 300, upkeep: 25 },
  pipe: { cost: 5, upkeep: 0.2 },
  fire: { cost: 500, upkeep: 50 },
  police: { cost: 500, upkeep: 50 },
  school: { cost: 400, upkeep: 40 },
  hospital: { cost: 600, upkeep: 60 },
  bus: { cost: 150, upkeep: 15 },
  plant: { cost: 3000, upkeep: 150 },
  wind: { cost: 1200, upkeep: 15 },
  solar: { cost: 2500, upkeep: 20 },
  hydro: { cost: 5000, upkeep: 60 },
  nuclear: { cost: 12000, upkeep: 300 },
  streetcar: { cost: 400, upkeep: 25 },
  monorail: { cost: 900, upkeep: 60 },
  subway: { cost: 1500, upkeep: 100 },
  rail: { cost: 2500, upkeep: 150 },
};

const EXPECTED_POWER: Record<string, { capacity: number; pollution: number; unlockPop: number }> = {
  plant: { capacity: 240, pollution: 1.0, unlockPop: 0 },
  wind: { capacity: 50, pollution: 0, unlockPop: 2000 },
  solar: { capacity: 100, pollution: 0, unlockPop: 5000 },
  hydro: { capacity: 280, pollution: 0, unlockPop: 10000 },
  nuclear: { capacity: 700, pollution: 0.15, unlockPop: 25000 },
};

const EXPECTED_TRANSIT: Record<string, { radius: number; share: number; unlockPop: number }> = {
  streetcar: { radius: mapScaled(6.5), share: 0.4, unlockPop: 5000 },
  monorail: { radius: mapScaled(8.5), share: 0.3, unlockPop: 15000 },
  subway: { radius: mapScaled(10.5), share: 0.22, unlockPop: 30000 },
  rail: { radius: mapScaled(13), share: 0.15, unlockPop: 50000 },
};

const EXPECTED_SERVICE_RADII: Record<string, number> = {
  fire: mapScaled(8),
  police: mapScaled(8),
  school: mapScaled(10),
  hospital: mapScaled(10),
  bus: mapScaled(5),
};

const EXPECTED_ORDINANCE_COST: Record<string, number> = {
  cleanAir: 100,
  freeBus: 150,
  fireCode: 80,
  eduGrant: 120,
  healthDrive: 200,
};

describe('balance parity: the registry serves the values the game shipped with', () => {
  beforeAll(() => {
    resetRegistry();
    const r = registerPack(CORE_PACK);
    if (!r.ok) throw new Error(r.errors.join('\n'));
  });

  test.each(Object.entries(EXPECTED))('%s cost and upkeep', (tool, want) => {
    const def = buildingByTool(tool);
    expect(def, `no definition for tool "${tool}"`).toBeDefined();
    expect(def!.cost).toBe(want.cost);
    expect(def!.upkeep).toBe(want.upkeep);
  });

  test.each(Object.entries(EXPECTED_POWER))('%s power spec', (tool, want) => {
    const def = buildingByTool(tool)!;
    expect(def.power).toBeDefined();
    expect(def.power!.capacity).toBe(want.capacity);
    expect(def.power!.pollution).toBe(want.pollution);
    if (want.unlockPop === 0) expect(def.unlock).toBeUndefined();
    else expect(def.unlock!.expr).toBe(`population >= ${want.unlockPop}`);
  });

  test.each(Object.entries(EXPECTED_TRANSIT))('%s transit spec', (tool, want) => {
    const def = buildingByTool(tool)!;
    expect(def.transit).toBeDefined();
    expect(def.transit!.radius).toBe(want.radius);
    expect(def.transit!.share).toBe(want.share);
    expect(def.unlock!.expr).toBe(`population >= ${want.unlockPop}`);
  });

  test.each(Object.entries(EXPECTED_SERVICE_RADII))('%s coverage radius', (tool, radius) => {
    expect(buildingByTool(tool)!.service!.radius).toBe(radius);
  });

  test('the bus keeps its historic traffic share', () => {
    expect(buildingByTool('bus')!.service!.share).toBe(0.5);
  });

  test.each(Object.entries(EXPECTED_ORDINANCE_COST))('%s monthly cost', (id, cost) => {
    expect(ordinanceById(id)!.cost).toBe(cost);
  });

  test('ordinance effects match the hardcoded branches they replace', () => {
    expect(ordinanceById('cleanAir')!.effects).toEqual({
      'pollution.industry': 0.7,
      'pollution.traffic': 0.7,
    });
    expect(ordinanceById('freeBus')!.effects).toEqual({ 'transit.share': 0.5 });
    expect(ordinanceById('fireCode')!.effects).toEqual({ 'fire.ignition': 0.5 });
    expect(ordinanceById('eduGrant')!.effects).toEqual({ 'coverage.school': 1.25 });
    expect(ordinanceById('healthDrive')!.effects).toEqual({
      'disaster.pandemicOdds': 0.5,
      'disaster.pandemicToll': 0.5,
    });
  });
});
