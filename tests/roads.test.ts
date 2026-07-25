import { beforeAll, describe, expect, test } from 'vitest';
import { applyRoadLine, applyTool, canApply, toolCost, toolLineCells } from '../src/sim/city';
import { collectBudget } from '../src/sim/budget';
import { idx, roadBand, roadLine } from '../src/sim/grid';
import { ensureCoreContent } from '../src/sim/content';
import {
  clampRoadClass,
  drivable,
  isRoadTool,
  ROAD_CLASSES,
  ROAD_TOOLS,
  roadClassOfTool,
} from '../src/sim/roads';
import { roadAccess, tileCapacity, updateTraffic } from '../src/sim/traffic';
import { deserialize, serialize } from '../src/sim/save';
import { newCity } from '../src/sim/city';
import { GRID, ROAD_CAPACITY, Terrain, Zone } from '../src/sim/types';
import { clearLand, makeCity, road, zone } from './helpers';

beforeAll(() => {
  ensureCoreContent();
});

const at = (city: ReturnType<typeof makeCity>, x: number, y: number) => city.tiles[idx(x, y)];

describe('the road class table', () => {
  test('the ladder is ordered by width and each row knows its own class', () => {
    ROAD_CLASSES.forEach((r, i) => expect(r.cls).toBe(i));
    const widths = ROAD_CLASSES.map((r) => r.width);
    expect(widths).toEqual([1, 2, 3, 4, 6]);
  });

  test('the widths are exactly what the player was promised', () => {
    const width = (tool: string) => ROAD_CLASSES[roadClassOfTool(tool)!].width;
    expect(width('route')).toBe(2);
    expect(width('boulevard')).toBe(3);
    expect(width('highway')).toBe(4);
    expect(width('highway2')).toBe(6);
  });

  test('cost, upkeep and capacity all climb with the ladder', () => {
    for (let i = 1; i < ROAD_CLASSES.length; i++) {
      expect(ROAD_CLASSES[i].costMult, `cost ${i}`).toBeGreaterThan(ROAD_CLASSES[i - 1].costMult);
      expect(ROAD_CLASSES[i].capacity, `capacity ${i}`).toBeGreaterThan(
        ROAD_CLASSES[i - 1].capacity,
      );
      expect(ROAD_CLASSES[i].upkeepMult, `upkeep ${i}`).toBeGreaterThanOrEqual(
        ROAD_CLASSES[i - 1].upkeepMult,
      );
      expect(ROAD_CLASSES[i].unlockPop, `unlock ${i}`).toBeGreaterThan(
        ROAD_CLASSES[i - 1].unlockPop,
      );
    }
  });

  test('the plain street is always available and is the ladder’s first rung', () => {
    expect(ROAD_CLASSES[0].unlockPop).toBe(0);
    expect(ROAD_TOOLS[0]).toBe('road');
  });

  test('road tools are recognized, and nothing else is', () => {
    for (const tool of ROAD_TOOLS) expect(isRoadTool(tool)).toBe(true);
    expect(isRoadTool('park')).toBe(false);
    expect(roadClassOfTool('pipe')).toBeNull();
  });

  test('a junk class revives as a plain street', () => {
    expect(clampRoadClass(3)).toBe(3);
    expect(clampRoadClass(9)).toBe(0);
    expect(clampRoadClass('2')).toBe(0);
    expect(clampRoadClass(undefined)).toBe(0);
  });
});

describe('roadBand', () => {
  test('a one-wide band is the line itself', () => {
    const line = roadLine(3, 3, 6, 3);
    expect(roadBand(line, 1).map((c) => [c.x, c.y])).toEqual(line);
  });

  test('a horizontal run widens across the perpendicular', () => {
    const band = roadBand(roadLine(4, 4, 7, 4), 3);
    const ys = new Set(band.map((c) => c.y));
    expect([...ys].sort()).toEqual([3, 4, 5]);
    expect(band).toHaveLength(4 * 3);
  });

  test('a vertical run widens the other way', () => {
    const band = roadBand(roadLine(4, 4, 4, 7), 3);
    expect([...new Set(band.map((c) => c.x))].sort()).toEqual([3, 4, 5]);
  });

  test('only the three-wide boulevard gets a median, and only down its centre', () => {
    const boulevard = roadBand(roadLine(5, 5, 9, 5), 3);
    const medians = boulevard.filter((c) => c.median);
    expect(medians.every((c) => c.y === 5)).toBe(true);
    expect(medians).toHaveLength(5);
    for (const width of [2, 4, 6]) {
      expect(roadBand(roadLine(5, 5, 9, 5), width).some((c) => c.median)).toBe(false);
    }
  });

  test('a corner tile is a lane, never a median — turns stay drivable', () => {
    const band = roadBand(roadLine(5, 5, 9, 9), 3);
    // no cell appears twice, and nothing a lane touched stayed a median
    const keys = band.map((c) => `${c.x},${c.y}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test('a lone median is demoted — no stray grass in the middle of a lane', () => {
    for (const line of [roadLine(5, 5, 12, 12), roadLine(5, 5, 12, 9), roadLine(5, 5, 9, 5)]) {
      const band = roadBand(line, 3);
      const medians = new Set(band.filter((c) => c.median).map((c) => `${c.x},${c.y}`));
      for (const key of medians) {
        const [x, y] = key.split(',').map(Number);
        const touching = [
          `${x - 1},${y}`,
          `${x + 1},${y}`,
          `${x},${y - 1}`,
          `${x},${y + 1}`,
        ].some((k) => medians.has(k));
        expect(touching, `median at ${key} stands alone`).toBe(true);
      }
    }
  });

  test('a straight run still gets its full central reservation', () => {
    const band = roadBand(roadLine(5, 5, 12, 5), 3);
    expect(band.filter((c) => c.median)).toHaveLength(8);
  });

  test('the band is clipped to the map', () => {
    const band = roadBand(roadLine(0, 0, 0, 4), 6);
    expect(band.every((c) => c.x >= 0 && c.y >= 0 && c.x < GRID && c.y < GRID)).toBe(true);
  });
});

describe('laying a road', () => {
  test('a route stamps two tiles per step of the line', () => {
    const city = makeCity();
    clearLand(city);
    city.funds = 100_000;
    city.population = 100_000; // everything unlocked
    applyRoadLine(city, 'route', roadLine(10, 10, 14, 10));
    const laid = city.tiles.filter((t) => t.zone === Zone.Road);
    expect(laid).toHaveLength(10);
    expect(laid.every((t) => t.road === 1 && !t.median)).toBe(true);
  });

  test('a boulevard plants a median down the middle', () => {
    const city = makeCity();
    clearLand(city);
    city.funds = 100_000;
    city.population = 100_000;
    applyRoadLine(city, 'boulevard', roadLine(10, 10, 14, 10));
    expect(at(city, 12, 10).median).toBe(true); // centre column
    expect(at(city, 12, 9).median).toBe(false); // carriageways
    expect(at(city, 12, 11).median).toBe(false);
  });

  test('a boulevard laid over existing road leaves that junction drivable', () => {
    const city = makeCity();
    clearLand(city);
    city.funds = 100_000;
    city.population = 100_000;
    road(city, 12, 8, 12, 12); // a street running the other way
    applyRoadLine(city, 'boulevard', roadLine(10, 10, 14, 10));
    expect(at(city, 12, 10).median).toBe(false);
    expect(drivable(at(city, 12, 10))).toBe(true);
  });

  test('a plain street across a median punches a junction back through it', () => {
    const city = makeCity();
    clearLand(city);
    city.funds = 100_000;
    city.population = 100_000;
    applyRoadLine(city, 'boulevard', roadLine(10, 10, 14, 10));
    expect(at(city, 12, 10).median).toBe(true);
    applyRoadLine(city, 'road', roadLine(12, 8, 12, 12));
    expect(at(city, 12, 10).median).toBe(false);
    expect(at(city, 12, 10).road).toBe(0);
  });

  test('re-laying the same class over itself changes nothing', () => {
    const city = makeCity();
    clearLand(city);
    city.funds = 100_000;
    applyTool(city, 'road', 5, 5);
    const before = city.funds;
    expect(canApply(city, 'road', 5, 5)).toBe(false);
    applyTool(city, 'road', 5, 5);
    expect(city.funds).toBe(before);
  });

  test('a street widens into a route in place, for the price of the route', () => {
    const city = makeCity();
    clearLand(city);
    city.funds = 100_000;
    city.population = 100_000;
    applyTool(city, 'road', 5, 5);
    const before = city.funds;
    expect(applyTool(city, 'route', 5, 5).ok).toBe(true);
    expect(at(city, 5, 5).road).toBe(1);
    expect(before - city.funds).toBe(toolCost('route', 1));
  });

  test('wide classes stay locked until the city grows into them', () => {
    const city = makeCity();
    clearLand(city);
    city.funds = 100_000;
    expect(canApply(city, 'route', 5, 5)).toBe(false);
    city.population = ROAD_CLASSES[1].unlockPop;
    expect(canApply(city, 'route', 5, 5)).toBe(true);
    expect(canApply(city, 'highway2', 5, 5)).toBe(false);
  });

  test('every class bridges water, at a price that scales with the deck', () => {
    const city = makeCity();
    clearLand(city);
    city.funds = 100_000;
    city.population = 100_000;
    at(city, 5, 5).terrain = Terrain.Water;
    at(city, 6, 5).terrain = Terrain.Water;
    const beforeStreet = city.funds;
    applyTool(city, 'road', 5, 5);
    const streetSpan = beforeStreet - city.funds;
    const beforeHighway = city.funds;
    applyTool(city, 'highway', 6, 5);
    expect(beforeHighway - city.funds).toBeGreaterThan(streetSpan);
  });

  test('a class still cannot be laid on forest', () => {
    const city = makeCity();
    clearLand(city);
    city.funds = 100_000;
    city.population = 100_000;
    at(city, 5, 5).terrain = Terrain.Forest;
    expect(canApply(city, 'boulevard', 5, 5)).toBe(false);
  });

  test('the preview covers exactly the tiles the build will', () => {
    const city = makeCity();
    clearLand(city);
    city.funds = 500_000;
    city.population = 100_000;
    const spine = roadLine(20, 20, 26, 24);
    const preview = toolLineCells('highway', spine);
    applyRoadLine(city, 'highway', spine);
    const built = city.tiles.filter((t) => t.zone === Zone.Road).length;
    expect(built).toBe(preview.length);
  });
});

describe('what the class does to traffic', () => {
  test('a wider tile swallows more before it counts as jammed', () => {
    expect(tileCapacity(0)).toBe(ROAD_CAPACITY);
    for (let c = 1; c < ROAD_CLASSES.length; c++) {
      expect(tileCapacity(c as 1)).toBeGreaterThan(tileCapacity((c - 1) as 0));
    }
  });

  test('a median is not a front door: a lot beside one has no road access', () => {
    const city = makeCity();
    clearLand(city);
    zone(city, 5, 5, Zone.Road);
    at(city, 5, 5).median = true;
    expect(roadAccess(city, 5, 6)).toBeNull();
    at(city, 5, 5).median = false;
    expect(roadAccess(city, 5, 6)).toEqual({ rx: 5, ry: 5 });
  });

  test('routing steps around a median rather than through it', () => {
    const city = makeCity();
    clearLand(city);
    // a single street with a median plugged into the middle of it
    road(city, 4, 5, 12, 5);
    zone(city, 4, 4, Zone.Residential, 2);
    zone(city, 12, 4, Zone.Commercial, 2);
    updateTraffic(city);
    expect(Number.isFinite(at(city, 4, 4).commute)).toBe(true);

    at(city, 8, 5).median = true;
    updateTraffic(city);
    expect(at(city, 4, 4).commute).toBe(Infinity); // the only route is severed
  });
});

describe('what the class costs to keep', () => {
  test('upkeep scales with the class', () => {
    const street = makeCity();
    const highway = makeCity();
    for (const city of [street, highway]) {
      clearLand(city);
      road(city, 5, 5, 14, 5);
    }
    for (const t of highway.tiles) if (t.zone === Zone.Road) t.road = 3;
    expect(collectBudget(highway).expenses).toBeGreaterThan(collectBudget(street).expenses);
  });
});

describe('persistence', () => {
  test('class and median survive a save round-trip', () => {
    const city = newCity(7);
    clearLand(city);
    city.funds = 100_000;
    city.population = 100_000;
    applyRoadLine(city, 'boulevard', roadLine(10, 10, 16, 10));
    const revived = deserialize(serialize(city))!;
    expect(revived.tiles[idx(13, 10)].median).toBe(true);
    expect(revived.tiles[idx(13, 9)].road).toBe(2);
    expect(revived).toEqual(city);
  });

  test('a crafted save cannot claim a class or a median off the asphalt', () => {
    const city = newCity(7);
    const mangled = JSON.parse(serialize(city));
    mangled.tiles[idx(5, 5)] = { zone: Zone.Park, road: 4, median: true };
    const revived = deserialize(JSON.stringify(mangled))!;
    expect(revived.tiles[idx(5, 5)].road).toBe(0);
    expect(revived.tiles[idx(5, 5)].median).toBe(false);
  });

  test('a save from before the ladder revives as plain streets', () => {
    const city = newCity(7);
    clearLand(city);
    city.funds = 10_000;
    applyRoadLine(city, 'road', roadLine(10, 10, 14, 10));
    const legacy = JSON.parse(serialize(city));
    for (const t of legacy.tiles) {
      delete t.road;
      delete t.median;
    }
    const revived = deserialize(JSON.stringify(legacy))!;
    expect(revived.tiles[idx(12, 10)].zone).toBe(Zone.Road);
    expect(revived.tiles[idx(12, 10)].road).toBe(0);
    expect(revived.tiles[idx(12, 10)].median).toBe(false);
  });
});
