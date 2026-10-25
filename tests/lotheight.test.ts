import { describe, expect, test } from 'vitest';
import { channels } from '../src/render/archetypes';
import { growableHeight, lotHeight, lotMassing, type LotKey } from '../src/render/buildings';
import { TERRACE_BUCKET, terraceStage } from '../src/render/frontage';
import { Stage, Tier, Zone } from '../src/sim/types';

const key = (zone: Zone, stage: Stage, tier: Tier, party: number): LotKey => ({
  zone, stage, tier, bucket: 3, size: 1, abandoned: false, glow: false, side: 2, party, corner: -1, build: 0,
});

describe('lotHeight', () => {
  test('a terrace member bakes at the row height whatever its stage, and the bake box agrees with the massing', () => {
    for (const zone of [Zone.Residential, Zone.Commercial]) {
      const band = zone === Zone.Commercial ? [1, 2, 3, 4] : [1, 2, 3];
      for (const tier of [1, 2, 3] as Tier[]) {
        const row = growableHeight(zone, terraceStage(zone), tier, TERRACE_BUCKET);
        for (const stage of band as Stage[]) {
          const k = key(zone, stage, tier, 1 << 2);
          expect(lotHeight(k)).toBe(row);
          expect(lotMassing(k, channels(0.3)).h).toBe(lotHeight(k));
          const lone = key(zone, stage, tier, 0);
          expect(lotMassing(lone, channels(0.3)).h).toBe(lotHeight(lone));
        }
      }
    }
  });

  test('a landmark key takes the landmark height', () => {
    const k = { ...key(Zone.Commercial, 3, 2, 0), sig: 'clock' as const };
    expect(lotHeight(k)).toBeGreaterThan(growableHeight(Zone.Commercial, 3, 2, 3));
  });
});
