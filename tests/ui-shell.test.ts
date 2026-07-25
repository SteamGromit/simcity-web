import { describe, expect, test } from 'vitest';
import { collapseRuns, isLogMode, type LogEntry } from '../src/ui/eventlog';
import { formatValue, perCapitaSeries, windowOf } from '../src/ui/charts';
import { HISTORY_SPECS, type HistorySpec } from '../src/sim/history';
import { roadPaint, shadeHex } from '../src/render/roadlook';

const entry = (text: string): LogEntry => ({ text, kind: 'alert', when: 'Jan 2000' });

describe('event log', () => {
  test('a run of the same message folds into one counted line', () => {
    const folded = collapseRuns([entry('Burglary'), entry('Burglary'), entry('Fire')]);
    expect(folded.map((f) => [f.entry.text, f.count])).toEqual([
      ['Burglary', 2],
      ['Fire', 1],
    ]);
  });

  test('a message that comes back later is its own line again', () => {
    const folded = collapseRuns([entry('Fire'), entry('Burglary'), entry('Fire')]);
    expect(folded).toHaveLength(3);
  });

  test('an empty feed folds to nothing', () => {
    expect(collapseRuns([])).toEqual([]);
  });

  test('only the two real shapes revive from storage', () => {
    expect(isLogMode('ticker')).toBe(true);
    expect(isLogMode('log')).toBe(true);
    expect(isLogMode('sideways')).toBe(false);
    expect(isLogMode(null)).toBe(false);
  });
});

describe('chart windowing', () => {
  test('a range longer than the history shows the whole run', () => {
    expect(windowOf(30, 120, 0)).toEqual({ start: 0, span: 30 });
  });

  test('"All" shows the whole run whatever the offset', () => {
    expect(windowOf(200, 0, 0)).toEqual({ start: 0, span: 200 });
  });

  test('no offset means the window sits at the newest end', () => {
    expect(windowOf(200, 60, 0)).toEqual({ start: 140, span: 60 });
  });

  test('scrolling back walks the window toward the start', () => {
    expect(windowOf(200, 60, 40)).toEqual({ start: 100, span: 60 });
    expect(windowOf(200, 60, 140)).toEqual({ start: 0, span: 60 });
  });

  test('an over-scroll clamps at the beginning of history', () => {
    expect(windowOf(200, 60, 9999)).toEqual({ start: 0, span: 60 });
  });

  test('an empty history has nothing to show', () => {
    expect(windowOf(0, 60, 0)).toEqual({ start: 0, span: 0 });
  });
});

describe('per-capita rescaling', () => {
  test('values come back per 1,000 residents', () => {
    expect(perCapitaSeries([50, 100], [1000, 2000])).toEqual([50, 50]);
  });

  test('a month with nobody in the city reads as zero, not infinity', () => {
    expect(perCapitaSeries([5], [0])).toEqual([0]);
    expect(perCapitaSeries([5], [])).toEqual([0]);
  });
});

describe('chart value formatting', () => {
  const spec = (unit: HistorySpec['unit']): HistorySpec => ({
    key: 'pop',
    group: 'City',
    label: 'x',
    unit,
    perCapita: true,
  });

  test('money, percentages and bare counts each read as themselves', () => {
    expect(formatValue(spec('§'), 1234.6, false)).toBe('§1,235');
    expect(formatValue(spec('%'), 42.4, false)).toBe('42%');
    expect(formatValue(spec(''), 1234, false)).toBe('1,234');
  });

  test('a per-capita reading says so', () => {
    expect(formatValue(spec(''), 12.34, true)).toBe('12.3/1k');
  });

  test('rates and averages are never offered per capita — they already are', () => {
    for (const s of HISTORY_SPECS) {
      if (s.unit === '%') expect(s.perCapita, s.key).toBe(false);
    }
  });
});

describe('road paint', () => {
  test('a highway is a blacker pour than the street it descends from', () => {
    expect(shadeHex('#3a3d42', -0.25)).not.toBe('#3a3d42');
    expect(Number.parseInt(shadeHex('#3a3d42', -0.25).slice(1), 16)).toBeLessThan(0x3a3d42);
  });

  test('anything that is not a plain hex passes through untouched', () => {
    expect(shadeHex('rgb(1,2,3)', -0.5)).toBe('rgb(1,2,3)');
    expect(shadeHex('#abc', -0.5)).toBe('#abc');
  });

  test('markings go from yellow centre lines to white lane edges up the ladder', () => {
    expect(roadPaint(0).color).not.toBe(roadPaint(3).color);
    expect(roadPaint(3).width).toBeGreaterThan(roadPaint(0).width);
    expect(roadPaint(1).color).toBe(roadPaint(2).color); // both ordinary asphalt
  });
});
