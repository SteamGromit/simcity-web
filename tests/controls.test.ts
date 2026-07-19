import { describe, expect, test } from 'vitest';
import { roadLine } from '../src/sim/grid';
import { RESERVED_KEYS, TOOL_KEYS } from '../src/ui/shortcuts';
import { COSTS } from '../src/sim/types';

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
      expect(COSTS[tool]).toBeDefined();
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
