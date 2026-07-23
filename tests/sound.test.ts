import { describe, expect, test } from 'vitest';
import { allBuildings } from '../src/content/registry';
import { ensureCoreContent } from '../src/sim/content';
import { COSTS, ToolId } from '../src/sim/types';
import { ambientLevel, soundFor, UI_SOUNDS } from '../src/ui/sound';

ensureCoreContent();
const ALL_TOOLS = [
  ...Object.keys(COSTS),
  ...allBuildings().map((b) => b.tool).filter((t): t is string => !!t),
] as ToolId[];

describe('soundFor', () => {
  test('every build tool has a playable spec', () => {
    for (const tool of ALL_TOOLS) {
      const s = soundFor(tool);
      expect(s.dur, tool).toBeGreaterThan(0);
      expect(s.vol, tool).toBeGreaterThan(0);
      expect(s.vol, tool).toBeLessThanOrEqual(1);
      if (s.wave !== 'noise') expect(s.freq, tool).toBeGreaterThan(0);
    }
  });

  test('zone sectors are audibly distinct', () => {
    const r = soundFor('zoneR');
    const c = soundFor('zoneC');
    const i = soundFor('zoneI');
    expect(new Set([r.freq, c.freq, i.freq]).size).toBe(3);
  });

  test('heavy construction sounds bigger than a zone tick', () => {
    expect(soundFor('plant').dur).toBeGreaterThan(soundFor('zoneR').dur);
  });
});

describe('UI_SOUNDS', () => {
  test('error, info, alarm and select cues exist and are playable', () => {
    for (const k of ['error', 'info', 'alarm', 'select'] as const) {
      expect(UI_SOUNDS[k].dur).toBeGreaterThan(0);
      expect(UI_SOUNDS[k].vol).toBeGreaterThan(0);
    }
  });
});

describe('ambientLevel', () => {
  test('a dead city is silent', () => {
    expect(ambientLevel(0)).toBe(0);
  });

  test('hum grows with population but never exceeds 1', () => {
    let prev = 0;
    for (const pop of [10, 100, 1_000, 10_000, 100_000, 1_000_000]) {
      const lvl = ambientLevel(pop);
      expect(lvl).toBeGreaterThan(prev);
      expect(lvl).toBeLessThanOrEqual(1);
      prev = lvl;
    }
  });
});
