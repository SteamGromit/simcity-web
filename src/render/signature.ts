/**
 * Signature lots: at most one landmark of each kind per city, so a church
 * or a gasholder is a place, not a type. A hash of the seed and the tile
 * ranks every lot; each kind takes its best-ranked eligible lot. Pure.
 */

import { underConstruction } from '../sim/develop';
import { normalizeTier } from '../sim/tiers';
import { CityState, Tile, Zone } from '../sim/types';
import { hash2 } from './noise';

export type SignatureKind =
  | 'church' | 'mansion' | 'pub' | 'clock' | 'store' | 'gasholder' | 'silos' | 'chimney';

export const SIGNATURE_ORDER: SignatureKind[] = [
  'church', 'mansion', 'pub', 'clock', 'store', 'gasholder', 'silos', 'chimney',
];

/** Whether `t` may carry this landmark; `corner` is whether it is a corner lot. */
export function signatureAllows(kind: SignatureKind, t: Tile, corner: boolean): boolean {
  if (t.stage <= 0 || t.abandoned || t.anchor !== -1 || underConstruction(t)) return false;
  const tier = normalizeTier(t.zone, t.tier);
  switch (kind) {
    case 'church': return t.zone === Zone.Residential && t.stage >= 2 && t.stage <= 3 && (tier === 1 || tier === 2);
    case 'mansion': return t.zone === Zone.Residential && t.stage === 3 && tier === 3;
    case 'pub': return t.zone === Zone.Commercial && t.stage >= 1 && t.stage <= 2 && corner;
    case 'clock': return t.zone === Zone.Commercial && t.stage === 3;
    case 'store': return t.zone === Zone.Commercial && t.stage >= 4 && t.stage <= 5;
    case 'gasholder': return t.zone === Zone.Industrial && t.stage >= 2 && t.stage <= 3 && tier === 'dirty';
    case 'silos': return t.zone === Zone.Industrial && t.stage >= 1 && t.stage <= 2 && tier === 'ag';
    case 'chimney': return t.zone === Zone.Industrial && t.stage === 3 && (tier === 'manu' || tier === 'dirty');
  }
}

/** Tile index → kind, one lot per kind at most. Stable for a given city state and seed. */
export function pickSignatures(
  city: CityState,
  seed: number,
  corner: (i: number) => boolean,
): Map<number, SignatureKind> {
  const out = new Map<number, SignatureKind>();
  const rank = (i: number) => hash2(i, seed, 77);
  for (const kind of SIGNATURE_ORDER) {
    let best = -1;
    let bestRank = Infinity;
    for (let i = 0; i < city.tiles.length; i++) {
      if (out.has(i)) continue;
      const t = city.tiles[i];
      if (t.stage <= 0) continue;
      const r = rank(i);
      if (r >= bestRank) continue;
      if (!signatureAllows(kind, t, corner(i))) continue;
      best = i;
      bestRank = r;
    }
    if (best >= 0) out.set(best, kind);
  }
  return out;
}

/** The height of the bake box, in px: the tallest point of the landmark. */
export function signatureHeight(kind: SignatureKind): number {
  switch (kind) {
    case 'church': return 88;
    case 'mansion': return 46;
    case 'pub': return 40;
    case 'clock': return 90;
    case 'store': return 52;
    case 'gasholder': return 56;
    case 'silos': return 54;
    case 'chimney': return 80;
  }
}
