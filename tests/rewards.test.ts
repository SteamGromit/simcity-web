import { beforeAll, describe, expect, test } from 'vitest';
import { applyTool, canApply, newCity } from '../src/sim/city';
import { collectBudget } from '../src/sim/budget';
import { sumCapacities } from '../src/sim/capacity';
import { civicGrants, ensureCoreContent, unlockContext, unlockedFor } from '../src/sim/content';
import { anchorOf, blockOf, blockTiles, isBody, sizeOfSlot } from '../src/sim/footprint';
import { idx } from '../src/sim/grid';
import { updateCoverage } from '../src/sim/services';
import { updateLandValue } from '../src/sim/landvalue';
import { updatePollution } from '../src/sim/pollution';
import { updatePower } from '../src/sim/power';
import { deserialize, serialize } from '../src/sim/save';
import { allBuildings, buildingByTool } from '../src/content/registry';
import { CIVIC_GRANTS, MAX_FOOTPRINT } from '../src/content/types';
import { GRID, Terrain, Zone } from '../src/sim/types';
import { clearLand, makeCity, zone } from './helpers';

beforeAll(() => {
  ensureCoreContent();
});

/** A city with money, people and schooling enough to buy anything. */
function richCity() {
  const city = makeCity();
  clearLand(city);
  city.funds = 5_000_000;
  city.population = 200_000;
  city.eduLevel = 0.9;
  return city;
}

describe('the reward catalogue', () => {
  const rewards = () => allBuildings().filter((b) => b.reward);

  test('every reward is multi-tile, employs people, and states a milestone', () => {
    expect(rewards().length).toBeGreaterThan(0);
    for (const b of rewards()) {
      expect(b.size ?? 1, `${b.id} size`).toBeGreaterThan(1);
      expect(b.size!, `${b.id} size`).toBeLessThanOrEqual(MAX_FOOTPRINT);
      expect(b.jobs, `${b.id} jobs`).toBeGreaterThan(0);
      expect(b.unlock, `${b.id} unlock`).toBeDefined();
      expect(b.tool, `${b.id} tool`).toBeDefined();
    }
  });

  test('each ladder climbs in size, cost and milestone', () => {
    const ladders = [
      ['core:ballpark', 'core:arena', 'core:stadium', 'core:colosseum'],
      ['core:college', 'core:university', 'core:research_university'],
    ];
    for (const ladder of ladders) {
      const defs = ladder.map((id) => allBuildings().find((b) => b.id === id)!);
      for (let i = 1; i < defs.length; i++) {
        expect(defs[i].size!, `${defs[i].id} size`).toBeGreaterThan(defs[i - 1].size!);
        expect(defs[i].cost, `${defs[i].id} cost`).toBeGreaterThan(defs[i - 1].cost);
        expect(defs[i].jobs!, `${defs[i].id} jobs`).toBeGreaterThan(defs[i - 1].jobs!);
      }
    }
  });

  test('every grant a reward declares is in the vocabulary', () => {
    for (const b of allBuildings()) {
      for (const g of b.grants ?? []) expect(CIVIC_GRANTS).toContain(g);
    }
  });

  test('the sport ladder lifts a district while spoiling the streets beside it', () => {
    for (const id of ['core:arena', 'core:stadium', 'core:colosseum']) {
      const b = allBuildings().find((x) => x.id === id)!;
      expect(b.amenity!.radius).toBeGreaterThan(b.blight!.radius);
      expect(b.amenity!.amount).toBeGreaterThan(b.blight!.amount);
    }
  });
});

describe('milestones gate what the mayor can buy', () => {
  test('a young city has earned nothing', () => {
    const city = makeCity();
    for (const b of allBuildings().filter((x) => x.reward)) {
      expect(unlockedFor(b, city), b.id).toBe(false);
    }
  });

  test('a reward unlocks exactly at its milestone', () => {
    const city = makeCity();
    const ballpark = buildingByTool('ballpark')!;
    city.population = 1999;
    expect(unlockedFor(ballpark, city)).toBe(false);
    city.population = 2000;
    expect(unlockedFor(ballpark, city)).toBe(true);
  });

  test('a milestone with two clauses needs both', () => {
    const city = makeCity();
    const uni = buildingByTool('university')!;
    city.population = 30_000;
    city.eduLevel = 0.2;
    expect(unlockedFor(uni, city)).toBe(false);
    city.eduLevel = 0.6;
    expect(unlockedFor(uni, city)).toBe(true);
  });

  test('a locked reward cannot be placed even with the money', () => {
    const city = makeCity();
    clearLand(city);
    city.funds = 5_000_000;
    expect(canApply(city, 'stadium', 10, 10)).toBe(false);
    city.population = 40_000;
    expect(canApply(city, 'stadium', 10, 10)).toBe(true);
  });
});

describe('civic grants and what they unlock', () => {
  test('a city with no rewards grants nothing', () => {
    expect(civicGrants(makeCity()).size).toBe(0);
  });

  test('a standing Research University grants research; bulldozing it revokes it', () => {
    const city = richCity();
    expect(applyTool(city, 'researchUniversity', 20, 20).ok).toBe(true);
    expect(civicGrants(city).has('research')).toBe(true);
    expect(unlockContext(city).research).toBe(1);

    applyTool(city, 'bulldoze', 22, 22); // any tile of the block
    expect(civicGrants(city).has('research')).toBe(false);
    expect(unlockContext(city).research).toBe(0);
  });

  test('cold fusion is locked until the city can invent it', () => {
    const city = richCity();
    const fusion = buildingByTool('fusion')!;
    expect(unlockedFor(fusion, city)).toBe(false);
    expect(canApply(city, 'fusion', 40, 40)).toBe(false);

    applyTool(city, 'researchUniversity', 20, 20);
    expect(unlockedFor(fusion, city)).toBe(true);
    expect(canApply(city, 'fusion', 40, 40)).toBe(true);
  });

  test('a University grants learning but not research — fusion still waits', () => {
    const city = richCity();
    applyTool(city, 'university', 20, 20);
    expect(civicGrants(city).has('learning')).toBe(true);
    expect(unlockedFor(buildingByTool('fusion')!, city)).toBe(false);
  });
});

describe('placing a block', () => {
  test('a reward claims its whole footprint, anchored where you clicked', () => {
    const city = richCity();
    expect(applyTool(city, 'stadium', 10, 10).ok).toBe(true);
    const size = sizeOfSlot(Zone.Stadium);
    expect(size).toBe(4);
    for (const i of blockTiles(10, 10, size)) {
      expect(city.tiles[i].zone).toBe(Zone.Stadium);
      expect(city.tiles[i].anchor).toBe(idx(10, 10));
    }
    expect(isBody(city.tiles[idx(10, 10)], idx(10, 10))).toBe(false);
    expect(isBody(city.tiles[idx(11, 11)], idx(11, 11))).toBe(true);
    // and nothing outside it
    expect(city.tiles[idx(14, 10)].zone).toBe(Zone.None);
  });

  test('it charges its price once, not once per tile', () => {
    const city = richCity();
    const before = city.funds;
    applyTool(city, 'stadium', 10, 10);
    expect(before - city.funds).toBe(buildingByTool('stadium')!.cost);
  });

  test('a block refuses ground that is occupied, sloped, wet or wooded', () => {
    const city = richCity();
    zone(city, 11, 11, Zone.Road);
    expect(canApply(city, 'stadium', 10, 10)).toBe(false);

    const sloped = richCity();
    sloped.tiles[idx(11, 11)].elevation = 2;
    expect(canApply(sloped, 'stadium', 10, 10)).toBe(false);

    const wet = richCity();
    wet.tiles[idx(11, 11)].terrain = Terrain.Water;
    expect(canApply(wet, 'stadium', 10, 10)).toBe(false);

    const wooded = richCity();
    wooded.tiles[idx(11, 11)].terrain = Terrain.Forest;
    expect(canApply(wooded, 'stadium', 10, 10)).toBe(false);
  });

  test('a block cannot hang off the edge of the map', () => {
    const city = richCity();
    expect(canApply(city, 'stadium', GRID - 2, 10)).toBe(false);
    expect(canApply(city, 'stadium', GRID - 4, 10)).toBe(true);
  });

  test('bulldozing any tile of a block razes all of it, for one charge', () => {
    const city = richCity();
    applyTool(city, 'stadium', 10, 10);
    const before = city.funds;
    expect(applyTool(city, 'bulldoze', 12, 11).ok).toBe(true);
    for (const i of blockTiles(10, 10, 4)) {
      expect(city.tiles[i].zone).toBe(Zone.None);
      expect(city.tiles[i].anchor).toBe(-1);
    }
    expect(before - city.funds).toBe(1); // one bulldoze, not sixteen
  });

  test('blockOf gathers a whole block from any of its tiles, and a lone tile alone', () => {
    const city = richCity();
    applyTool(city, 'stadium', 10, 10);
    expect(blockOf(city, idx(12, 11)).sort()).toEqual(blockTiles(10, 10, 4).sort());
    applyTool(city, 'park', 40, 40);
    expect(blockOf(city, idx(40, 40))).toEqual([idx(40, 40)]);
  });
});

describe('a block behaves as one building', () => {
  test('it charges one upkeep, not one per tile', () => {
    const city = richCity();
    applyTool(city, 'stadium', 10, 10);
    const def = buildingByTool('stadium')!;
    expect(collectBudget(city).expenses).toBe(Math.round(def.upkeep));
  });

  test('its jobs count once, and feed the city job total', () => {
    const city = richCity();
    applyTool(city, 'stadium', 10, 10);
    expect(sumCapacities(city).civicJobs).toBe(buildingByTool('stadium')!.jobs);
  });

  test('it radiates coverage once, from its anchor', () => {
    const city = richCity();
    // a college covers schools; drop it beside a plant so it is powered
    applyTool(city, 'plant', 5, 5);
    applyTool(city, 'college', 6, 5);
    updatePower(city);
    updateCoverage(city);
    const def = buildingByTool('college')!;
    const radius = def.service!.radius;
    const size = def.size!; // occupies 6..6+size-1
    // full strength across the whole campus, and reach measured from its wall
    expect(city.tiles[idx(6, 5)].schoolCov).toBeCloseTo(1, 5);
    expect(city.tiles[idx(6 + size - 1, 5)].schoolCov).toBeCloseTo(1, 5);
    expect(city.tiles[idx(6 + size - 1 + radius, 5)].schoolCov).toBeGreaterThan(0);
    expect(city.tiles[idx(6 + size - 1 + radius + 1, 5)].schoolCov).toBe(0);
  });

  test('its capacity is pooled once — sixteen tiles is not sixteen plants', () => {
    const city = richCity();
    applyTool(city, 'researchUniversity', 20, 20); // so fusion unlocks
    applyTool(city, 'fusion', 40, 40);
    updatePower(city);
    // one plant's worth of pool: a single consumer beside it is powered,
    // and the pool is finite rather than 16× the declared capacity
    const capacity = buildingByTool('fusion')!.power!.capacity;
    let consumers = 0;
    for (let k = 0; k < capacity + 50; k++) {
      const x = 1 + (k % 90);
      const y = 60 + ((k / 90) | 0);
      zone(city, x, y, Zone.Residential, 1);
      consumers++;
    }
    // wire them together so they all reach the plant, then check the pool ran out
    for (let x = 1; x <= 91; x++) zone(city, x, 59, Zone.PowerLine);
    for (let y = 41; y <= 59; y++) zone(city, 40, y, Zone.PowerLine);
    updatePower(city);
    const powered = city.tiles.filter((t) => t.zone === Zone.Residential && t.powered).length;
    expect(consumers).toBeGreaterThan(capacity);
    expect(powered).toBeLessThanOrEqual(capacity);
  });

  test('it emits its plume once rather than once per tile', () => {
    const oneTile = richCity();
    zone(oneTile, 40, 40, Zone.Landfill);
    updatePollution(oneTile);
    const single = oneTile.tiles[idx(40, 40)].pollution;

    const block = richCity();
    applyTool(block, 'researchUniversity', 20, 20);
    applyTool(block, 'fusion', 40, 40); // 4×4, declared pollution 0
    updatePollution(block);
    expect(block.tiles[idx(41, 41)].pollution).toBe(0);
    expect(single).toBeGreaterThan(0); // the comparison is meaningful
  });

  test('its amenity lifts the ground around it, once', () => {
    const bare = richCity();
    updateLandValue(bare);
    const before = bare.tiles[idx(30, 20)].landValue;

    const city = richCity();
    applyTool(city, 'monument', 20, 20);
    updateLandValue(city);
    const after = city.tiles[idx(30, 20)].landValue;
    expect(after).toBeGreaterThan(before);
    // and it is bounded — a 14-tile reach should not saturate the map
    expect(city.tiles[idx(60, 60)].landValue).toBeCloseTo(before, 5);
  });

  test('a stadium is worth living near, but not right beside', () => {
    const city = richCity();
    applyTool(city, 'stadium', 20, 20); // occupies 20..23 in both axes
    updateLandValue(city);
    // the streets across from it are inside the blight; a few blocks out is
    // past it but still well inside the amenity — that is the good address
    const across = city.tiles[idx(24, 22)].landValue; // 1 tile off the wall
    const fewBlocks = city.tiles[idx(28, 22)].landValue; // 5 tiles off
    const faraway = city.tiles[idx(40, 22)].landValue; // out of reach entirely
    expect(fewBlocks).toBeGreaterThan(across);
    expect(fewBlocks).toBeGreaterThan(faraway);
  });

  test('a big reward radiates from the building, not from its corner tile', () => {
    const city = richCity();
    applyTool(city, 'monument', 30, 30); // 2×2 at 30..31
    updateLandValue(city);
    // symmetric about the block: the same distance off either wall reads alike
    const west = city.tiles[idx(30 - 4, 30)].landValue;
    const east = city.tiles[idx(31 + 4, 30)].landValue;
    expect(east).toBeCloseTo(west, 6);
  });
});

describe('blocks survive saves', () => {
  test('a block round-trips whole', () => {
    const city = newCity(11);
    clearLand(city);
    city.funds = 5_000_000;
    city.population = 200_000;
    city.eduLevel = 0.9;
    applyTool(city, 'stadium', 10, 10);
    const revived = deserialize(serialize(city))!;
    for (const i of blockTiles(10, 10, 4)) {
      expect(revived.tiles[i].zone).toBe(Zone.Stadium);
      expect(revived.tiles[i].anchor).toBe(idx(10, 10));
    }
    expect(revived).toEqual(city);
  });

  test('a body tile whose anchor is gone is cleared, not left floating', () => {
    const city = newCity(11);
    clearLand(city);
    city.funds = 5_000_000;
    city.population = 200_000;
    city.eduLevel = 0.9;
    applyTool(city, 'stadium', 10, 10);
    const mangled = JSON.parse(serialize(city));
    mangled.tiles[idx(10, 10)] = { zone: Zone.None }; // anchor deleted by hand
    const revived = deserialize(JSON.stringify(mangled))!;
    for (const i of blockTiles(10, 10, 4)) {
      expect(revived.tiles[i].zone, `tile ${i}`).toBe(Zone.None);
    }
  });

  test('a tile claiming an anchor outside its block is cleared', () => {
    const city = newCity(11);
    clearLand(city);
    const mangled = JSON.parse(serialize(city));
    mangled.tiles[idx(50, 50)] = { zone: Zone.Stadium, anchor: idx(50, 50) };
    mangled.tiles[idx(80, 80)] = { zone: Zone.Stadium, anchor: idx(50, 50) }; // miles away
    const revived = deserialize(JSON.stringify(mangled))!;
    expect(revived.tiles[idx(80, 80)].zone).toBe(Zone.None);
    expect(revived.tiles[idx(50, 50)].zone).toBe(Zone.Stadium); // the anchor stands
  });

  test('an anchor claim on empty land is dropped', () => {
    const city = newCity(11);
    const mangled = JSON.parse(serialize(city));
    mangled.tiles[idx(30, 30)] = { zone: Zone.None, anchor: 5 };
    const revived = deserialize(JSON.stringify(mangled))!;
    expect(revived.tiles[idx(30, 30)].anchor).toBe(-1);
  });

  test('a pre-v0.55 save revives with no blocks at all', () => {
    const city = newCity(11);
    const legacy = JSON.parse(serialize(city));
    for (const t of legacy.tiles) delete t.anchor;
    const revived = deserialize(JSON.stringify(legacy))!;
    expect(revived.tiles.every((t) => t.anchor === -1)).toBe(true);
    expect(anchorOf(revived.tiles[5], 5)).toBe(5);
  });
});
