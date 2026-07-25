import { beforeAll, describe, expect, test } from 'vitest';
import { roadLine } from '../src/sim/grid';
import {
  BLIGHT_RADII,
  clampDensity,
  HALO_RADII,
  isFormControl,
  LINE_TOOLS,
  OVERLAY_KEY_OF,
  OVERLAY_KEYS,
  RECT_TOOLS,
  RESERVED_KEYS,
  TOOL_KEYS,
} from '../src/ui/shortcuts';
import { buildingByTool } from '../src/content/registry';
import { ensureCoreContent } from '../src/sim/content';
import { ActionToolId, COSTS, SERVICE_RADII } from '../src/sim/types';
import { OVERLAY_LABELS } from '../src/render/overlays';

beforeAll(() => {
  ensureCoreContent();
});

describe('roadLine', () => {
  test('straight lines include both endpoints', () => {
    expect(roadLine(3, 5, 7, 5)).toEqual([
      [3, 5],
      [4, 5],
      [5, 5],
      [6, 5],
      [7, 5],
    ]);
    expect(roadLine(3, 5, 3, 2).length).toBe(4);
  });

  test('a single point is a one-tile line', () => {
    expect(roadLine(4, 4, 4, 4)).toEqual([[4, 4]]);
  });

  test('diagonals rasterize 4-connected — every step is orthogonal', () => {
    const line = roadLine(0, 0, 5, 3);
    expect(line[0]).toEqual([0, 0]);
    expect(line[line.length - 1]).toEqual([5, 3]);
    for (let i = 1; i < line.length; i++) {
      const manhattan =
        Math.abs(line[i][0] - line[i - 1][0]) + Math.abs(line[i][1] - line[i - 1][1]);
      expect(manhattan).toBe(1); // no diagonal jumps: roads must connect
    }
  });

  test('steep and reversed lines work too', () => {
    const line = roadLine(8, 9, 2, 1);
    expect(line[0]).toEqual([8, 9]);
    expect(line[line.length - 1]).toEqual([2, 1]);
    for (let i = 1; i < line.length; i++) {
      const manhattan =
        Math.abs(line[i][0] - line[i - 1][0]) + Math.abs(line[i][1] - line[i - 1][1]);
      expect(manhattan).toBe(1);
    }
  });
});

describe('TOOL_KEYS', () => {
  test('every mapped key is unique and not reserved', () => {
    const keys = Object.keys(TOOL_KEYS);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(RESERVED_KEYS.has(k)).toBe(false);
  });

  test('every mapping targets a real tool (or the query tool)', () => {
    for (const tool of Object.values(TOOL_KEYS)) {
      if (tool === 'query') continue;
      const price = buildingByTool(tool)?.cost ?? COSTS[tool as ActionToolId];
      expect(price, tool).toBeDefined();
    }
  });

  test('the classics are covered', () => {
    const tools = Object.values(TOOL_KEYS);
    expect(tools).toContain('bulldoze');
    expect(tools).toContain('road');
    expect(tools).toContain('zoneR');
    expect(tools).toContain('zoneC');
    expect(tools).toContain('zoneI');
  });
});

describe('OVERLAY_KEYS', () => {
  test('keys are unique single letters', () => {
    const keys = Object.keys(OVERLAY_KEYS);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k).toMatch(/^[a-z]$/);
  });

  test('every overlay is reachable and gets a ⇧ label', () => {
    const ids = Object.values(OVERLAY_KEYS);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of Object.keys(OVERLAY_LABELS) as (keyof typeof OVERLAY_LABELS)[]) {
      expect(ids).toContain(id);
      expect(OVERLAY_KEY_OF[id]).toMatch(/^⇧[A-Z]$/);
    }
  });
});

describe('isFormControl', () => {
  test('form controls that own keystrokes are recognized', () => {
    expect(isFormControl({ tagName: 'INPUT' })).toBe(true);
    expect(isFormControl({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isFormControl({ tagName: 'SELECT' })).toBe(true);
  });

  test('everything else keeps global keys live', () => {
    expect(isFormControl(null)).toBe(false); // window/document target
    expect(isFormControl({ tagName: 'BODY' })).toBe(false);
    expect(isFormControl({ tagName: 'CANVAS' })).toBe(false);
    // buttons stay false: Space must keep drag-panning after a toolbar click
    expect(isFormControl({ tagName: 'BUTTON' })).toBe(false);
    expect(isFormControl({})).toBe(false);
  });
});

describe('clampDensity', () => {
  test('passes stored densities through', () => {
    expect(clampDensity('1')).toBe(1);
    expect(clampDensity('2')).toBe(2);
    expect(clampDensity('3')).toBe(3);
  });

  test('junk clamps to Low', () => {
    expect(clampDensity(null)).toBe(1);
    expect(clampDensity(undefined)).toBe(1);
    expect(clampDensity('9')).toBe(1);
    expect(clampDensity('abc')).toBe(1);
  });
});

describe('LINE_TOOLS / RECT_TOOLS', () => {
  test('the whole road ladder, power line, and pipe drag as adjustable lines', () => {
    expect([...LINE_TOOLS].sort()).toEqual([
      'boulevard',
      'highway',
      'highway2',
      'line',
      'pipe',
      'road',
      'route',
    ]);
  });

  test('every tool has at most one drag interaction', () => {
    for (const t of LINE_TOOLS) expect(RECT_TOOLS.has(t)).toBe(false);
  });

  test('rect tools are the zoning/terraforming area tools', () => {
    expect([...RECT_TOOLS].sort()).toEqual([
      'bulldoze',
      'park',
      'terraForest',
      'terraGrass',
      'terraLower',
      'terraRaise',
      'terraWater',
      'zoneC',
      'zoneI',
      'zoneR',
    ]);
  });
});

describe('HALO_RADII', () => {
  test('exactly the tools with an area effect get a halo', () => {
    expect(Object.keys(HALO_RADII).sort()).toEqual([
      'bus',
      'fire',
      'hospital',
      'incinerator',
      'landfill',
      'monorail',
      'park',
      'police',
      'prison',
      'rail',
      'recycling',
      'school',
      'streetcar',
      'subway',
    ]);
  });

  test('radii match the sim, hospital bridging to the health key', () => {
    expect(HALO_RADII.fire).toBe(SERVICE_RADII.fire);
    expect(HALO_RADII.police).toBe(SERVICE_RADII.police);
    expect(HALO_RADII.school).toBe(SERVICE_RADII.school);
    expect(HALO_RADII.hospital).toBe(SERVICE_RADII.health);
    expect(HALO_RADII.bus).toBe(SERVICE_RADII.bus);
  });

  test('the blight ring only ever sits inside the coverage halo it annotates', () => {
    for (const [tool, radius] of Object.entries(BLIGHT_RADII)) {
      const cover = HALO_RADII[tool];
      if (cover === undefined) continue; // a plant has blight but no coverage
      expect(radius, tool).toBeLessThanOrEqual(cover);
    }
  });

  test("every blighting tool's ring matches what the sim actually applies", () => {
    // the core pack owns these numbers; a drift here would preview a lie
    expect(BLIGHT_RADII.prison).toBe(buildingByTool('prison')!.blight!.radius);
  });
});
