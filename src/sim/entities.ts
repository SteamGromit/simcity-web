/** Named homage businesses that flavor developed C/I lots. Pure and
 * cosmetic: assignment derives from the tile's render variant, so the
 * map and the query panel always agree and saves are untouched. */

import { IndustryKind, Stage, Tier, Wealth, Zone } from './types';
import { normalizeTier } from './tiers';

export interface Entity {
  name: string;
  /** 1–2 letters on the sign. */
  initials: string;
  /** Sign hue, 0–360. */
  hue: number;
  zone: Zone.Commercial | Zone.Industrial;
  tiers: (Wealth | IndustryKind)[];
  minStage: Stage;
}

const C = Zone.Commercial;
const I = Zone.Industrial;

export const ENTITIES: Entity[] = [
  { name: 'Krusty Krab', initials: 'KK', hue: 12, zone: C, tiers: [1], minStage: 2 },
  { name: "Mo's Tavern", initials: 'MT', hue: 32, zone: C, tiers: [1], minStage: 2 },
  { name: 'Mega Lo Mart', initials: 'ML', hue: 218, zone: C, tiers: [1], minStage: 3 },
  { name: 'Los Pollos Hermanos', initials: 'LP', hue: 46, zone: C, tiers: [1, 2], minStage: 2 },
  { name: 'Dunder Mifflin Paper', initials: 'DM', hue: 210, zone: C, tiers: [2], minStage: 3 },
  { name: 'WKRP Radio', initials: 'WK', hue: 282, zone: C, tiers: [2], minStage: 3 },
  { name: 'Cheers', initials: 'CH', hue: 40, zone: C, tiers: [2], minStage: 2 },
  { name: "Trader Joe's", initials: 'TJ', hue: 0, zone: C, tiers: [2], minStage: 2 },
  { name: 'Bank of Simness', initials: 'BS', hue: 142, zone: C, tiers: [3], minStage: 4 },
  { name: 'Massive Dynamic', initials: 'MD', hue: 262, zone: C, tiers: [3], minStage: 4 },
  { name: 'Strickland Propane', initials: 'SP', hue: 200, zone: I, tiers: ['dirty'], minStage: 2 },
  { name: 'Wonka Candy Factory', initials: 'WC', hue: 302, zone: I, tiers: ['manu'], minStage: 3 },
  { name: 'The Bluth Company', initials: 'BC', hue: 52, zone: I, tiers: ['manu'], minStage: 2 },
  { name: 'Initech', initials: 'IN', hue: 222, zone: I, tiers: ['tech'], minStage: 3 },
  { name: 'Anthropic', initials: 'AN', hue: 22, zone: I, tiers: ['tech'], minStage: 3 },
];

const NAME_RATE = 0.4;
const fract = (x: number) => x - Math.floor(x);

/** The business on this lot, or null. Stable per variant. */
export function entityFor(zone: Zone, tier: Tier, stage: Stage, variant: number): Entity | null {
  if (zone !== Zone.Commercial && zone !== Zone.Industrial) return null;
  if (stage < 2) return null;
  const t = normalizeTier(zone, tier);
  const pool = ENTITIES.filter(
    (e) => e.zone === zone && e.tiers.includes(t as Wealth | IndustryKind) && stage >= e.minStage,
  );
  if (pool.length === 0) return null;
  if (fract(variant * 104729) >= NAME_RATE) return null;
  return pool[Math.min(pool.length - 1, Math.floor(fract(variant * 7919) * pool.length))];
}

/**
 * Reproduce the renderer's per-tile variant: the i-th draw from
 * mulberry32(seed). O(i) — fine for a query click, not for hot loops.
 */
export function variantAt(seed: number, i: number): number {
  let a = seed | 0;
  let v = 0;
  for (let k = 0; k <= i; k++) {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    v = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return v;
}
