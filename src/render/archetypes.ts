/** Pure variant logic for building archetypes. No canvas imports — this
 * module must stay testable without a DOM. */

import { Stage, Tier, Wealth, Zone } from '../sim/types';
import { normalizeTier } from '../sim/tiers';

/**
 * Stable per-tile decision stream derived from the renderer's variant
 * float; same variant → same stream. Same LCG family drawRubble uses.
 */
export function channels(variant: number): () => number {
  let h = 1 + Math.floor(variant * 976_000_405);
  return () => {
    h = (h * 1103515245 + 12345) % 2147483648;
    return h / 2147483648;
  };
}

export type RoofStyle = 'flat' | 'parapet' | 'gabled' | 'sawtooth';
export type WindowStyle = 'stripes' | 'grid' | 'columns';
export type PropKind =
  | 'waterTower' | 'acUnit' | 'antenna' | 'chimney' | 'vent'
  | 'tank' | 'awning' | 'yardTree' | 'hedge';

/** Units are normalized to the stage's footprint budget: the drawing code
 * multiplies ox/oy/f by footprintBudget(stage), so one recipe serves every
 * stage in its band and the invariant is uniform: |ox| + f/2 ≤ 0.5. */
export interface SubBox {
  ox: number; // center offset from tile center
  oy: number;
  f: number;  // footprint fraction
  hf: number; // height fraction of the lot's base height; exactly one box has 1
}

export interface Archetype {
  boxes: SubBox[];      // 1–3; drawn back-to-front per frame
  roof: RoofStyle;      // applied to the full-height mass
  props: PropKind[];    // candidate slots; channels decide which appear
  windows: WindowStyle;
}

/** The stage's composite footprint cap — same curve the single box used. */
export function footprintBudget(stage: Stage): number {
  return Math.min(0.85, 0.55 + stage * 0.05);
}

const B = (ox: number, oy: number, f: number, hf: number): SubBox => ({ ox, oy, f, hf });
const A = (
  boxes: SubBox[],
  roof: RoofStyle,
  windows: WindowStyle,
  props: PropKind[],
): Archetype => ({ boxes, roof, windows, props });

type FamilyKey = 'R1' | 'R2' | 'R3' | 'C1' | 'C2' | 'C3' | 'dirty' | 'manu' | 'tech';
/** Stage bands: low 1–2, mid 3–5, high 6–7. */
type Band = 0 | 1 | 2;

function bandOf(stage: Stage): Band {
  return stage <= 2 ? 0 : stage <= 5 ? 1 : 2;
}

const TABLE: Record<FamilyKey, [Archetype[], Archetype[], Archetype[]]> = {
  R1: [
    [
      A([B(0, 0, 0.8, 1)], 'gabled', 'stripes', ['chimney', 'yardTree']),
      A([B(-0.1, 0.1, 0.7, 1), B(0.22, -0.18, 0.35, 0.55)], 'gabled', 'stripes', ['chimney']),
      A([B(0, 0, 0.9, 1)], 'flat', 'stripes', ['yardTree', 'hedge']),
    ],
    [
      A([B(0, 0, 0.95, 1)], 'flat', 'stripes', ['acUnit', 'chimney']),
      A([B(-0.15, 0, 0.6, 1), B(0.2, 0, 0.55, 0.85)], 'flat', 'stripes', ['acUnit']),
      A([B(0, -0.12, 0.72, 1), B(0, 0.25, 0.45, 0.6)], 'parapet', 'columns', ['waterTower']),
    ],
    [
      A([B(0, 0, 0.95, 1)], 'flat', 'grid', ['waterTower', 'acUnit']),
      A([B(-0.12, -0.12, 0.62, 1), B(0.18, 0.18, 0.55, 0.8)], 'flat', 'stripes', ['acUnit', 'waterTower']),
    ],
  ],
  R2: [
    [
      A([B(0, 0, 0.75, 1)], 'gabled', 'stripes', ['yardTree', 'chimney']),
      A([B(-0.12, 0.05, 0.6, 1), B(0.25, -0.05, 0.4, 0.5)], 'gabled', 'stripes', ['yardTree']),
      A([B(0, 0, 0.85, 1)], 'parapet', 'columns', ['hedge']),
    ],
    [
      A([B(0, 0, 0.9, 1)], 'parapet', 'stripes', ['acUnit']),
      A([B(-0.15, -0.15, 0.65, 1), B(0.15, 0.2, 0.55, 0.7)], 'flat', 'grid', ['acUnit']),
      A([B(0, 0, 0.9, 0.45), B(0, 0, 0.55, 1)], 'parapet', 'columns', ['waterTower']),
    ],
    [
      A([B(0, 0, 0.9, 0.4), B(0, 0, 0.6, 1)], 'flat', 'grid', ['waterTower', 'antenna']),
      A([B(-0.15, 0.1, 0.55, 1), B(0.2, -0.15, 0.5, 0.9)], 'flat', 'columns', ['acUnit']),
      A([B(0, 0, 0.95, 1)], 'parapet', 'stripes', ['acUnit']),
    ],
  ],
  R3: [
    [
      A([B(0, 0, 0.7, 1)], 'parapet', 'columns', ['hedge', 'yardTree']),
      A([B(0, -0.1, 0.6, 1), B(0, 0.22, 0.45, 0.5)], 'gabled', 'stripes', ['hedge']),
    ],
    [
      A([B(0, 0, 0.8, 0.55), B(0, 0, 0.55, 1)], 'parapet', 'columns', ['hedge']),
      A([B(-0.13, 0.13, 0.6, 1), B(0.18, -0.14, 0.45, 0.75)], 'parapet', 'grid', []),
    ],
    [
      A([B(0, 0, 0.85, 0.35), B(0, 0, 0.5, 1)], 'parapet', 'grid', ['antenna']),
      A([B(0, 0, 0.6, 1)], 'flat', 'columns', []),
    ],
  ],
  C1: [
    [
      A([B(0, 0, 0.9, 1)], 'flat', 'stripes', ['awning']),
      A([B(-0.18, 0, 0.55, 1), B(0.2, 0, 0.5, 0.8)], 'flat', 'stripes', ['awning']),
      A([B(0, 0, 0.85, 1)], 'parapet', 'stripes', ['awning', 'acUnit']),
    ],
    [
      A([B(0, 0, 0.95, 1)], 'flat', 'stripes', ['acUnit', 'vent']),
      A([B(0, -0.1, 0.75, 1), B(0, 0.27, 0.4, 0.5)], 'parapet', 'columns', ['acUnit']),
    ],
    [
      A([B(0, 0, 0.9, 1)], 'parapet', 'columns', ['waterTower', 'acUnit']),
      A([B(0, 0, 0.85, 0.5), B(0, 0, 0.6, 1)], 'flat', 'stripes', ['antenna']),
    ],
  ],
  C2: [
    [
      A([B(0, 0, 0.8, 1)], 'flat', 'stripes', ['awning']),
      A([B(-0.14, 0.08, 0.6, 1), B(0.22, -0.1, 0.42, 0.7)], 'parapet', 'stripes', ['awning']),
    ],
    [
      A([B(0, 0, 0.9, 1)], 'flat', 'grid', ['acUnit']),
      A([B(0, 0, 0.85, 0.5), B(0, 0, 0.58, 1)], 'parapet', 'columns', ['vent']),
      A([B(-0.16, -0.12, 0.6, 1), B(0.16, 0.16, 0.55, 0.85)], 'flat', 'grid', ['acUnit']),
    ],
    [
      A([B(0, 0, 0.85, 0.45), B(0, 0, 0.6, 1)], 'flat', 'grid', ['antenna']),
      A([B(-0.15, 0.12, 0.55, 1), B(0.18, -0.15, 0.5, 0.92)], 'flat', 'columns', ['antenna']),
      A([B(0, 0, 0.95, 1)], 'parapet', 'grid', ['waterTower']),
    ],
  ],
  C3: [
    [
      A([B(0, 0, 0.75, 1)], 'parapet', 'columns', []),
      A([B(0, 0, 0.85, 1)], 'flat', 'grid', []),
    ],
    [
      A([B(0, 0, 0.85, 0.55), B(0, 0, 0.55, 1)], 'parapet', 'grid', []),
      A([B(0, 0, 0.9, 1)], 'flat', 'columns', ['antenna']),
    ],
    [
      A([B(0, 0, 0.8, 0.35), B(0, 0, 0.55, 1)], 'flat', 'grid', ['antenna']),
      A([B(-0.14, 0.1, 0.5, 1), B(0.18, -0.12, 0.45, 0.85)], 'flat', 'columns', []),
    ],
  ],
  dirty: [
    [
      A([B(0, 0, 0.85, 1)], 'flat', 'stripes', ['tank', 'vent']),
      A([B(-0.15, 0.05, 0.6, 1), B(0.22, -0.08, 0.45, 0.7)], 'flat', 'stripes', ['tank']),
    ],
    [
      A([B(0, 0, 0.95, 1)], 'flat', 'stripes', ['tank', 'vent']),
      A([B(-0.12, -0.1, 0.68, 1), B(0.2, 0.18, 0.5, 0.6)], 'flat', 'stripes', ['vent', 'tank']),
    ],
    [
      A([B(0, 0, 0.95, 1)], 'flat', 'stripes', ['tank', 'vent']),
      A([B(-0.14, 0.1, 0.6, 1), B(0.18, -0.14, 0.55, 0.75)], 'flat', 'stripes', ['tank', 'vent']),
    ],
  ],
  manu: [
    [
      A([B(0, 0, 0.9, 1)], 'sawtooth', 'stripes', ['vent']),
      A([B(0, 0, 0.8, 1)], 'flat', 'stripes', ['acUnit']),
    ],
    [
      A([B(0, 0, 0.95, 1)], 'sawtooth', 'stripes', ['vent', 'acUnit']),
      A([B(-0.15, 0, 0.6, 1), B(0.2, 0.05, 0.5, 0.8)], 'sawtooth', 'stripes', ['vent']),
    ],
    [
      A([B(0, 0, 0.95, 1)], 'sawtooth', 'stripes', ['vent', 'tank']),
      A([B(0, -0.1, 0.75, 1), B(0, 0.27, 0.42, 0.5)], 'flat', 'stripes', ['acUnit', 'vent']),
    ],
  ],
  tech: [
    [
      A([B(0, 0, 0.8, 1)], 'parapet', 'grid', ['antenna']),
      A([B(0, 0, 0.7, 1)], 'flat', 'columns', ['hedge']),
    ],
    [
      A([B(0, 0, 0.85, 1)], 'parapet', 'grid', ['antenna', 'acUnit']),
      A([B(0, 0, 0.8, 0.5), B(0, 0, 0.55, 1)], 'parapet', 'columns', ['antenna']),
    ],
    [
      A([B(0, 0, 0.9, 0.4), B(0, 0, 0.58, 1)], 'parapet', 'grid', ['antenna']),
      A([B(-0.14, 0.12, 0.55, 1), B(0.18, -0.12, 0.5, 0.9)], 'flat', 'grid', ['antenna']),
    ],
  ],
};

function familyKey(zone: Zone, tier: Tier): FamilyKey {
  const t = normalizeTier(zone, tier);
  if (zone === Zone.Industrial) {
    // 'ag' lots draw as farms (see buildings.ts); this fallback only serves
    // the abandoned-farm edge, which renders as a desaturated shed.
    return (t === 'ag' ? 'manu' : t) as FamilyKey;
  }
  return `${zone === Zone.Residential ? 'R' : 'C'}${t as Wealth}` as FamilyKey;
}

export function pickArchetype(zone: Zone, tier: Tier, stage: Stage, pick: number): Archetype {
  const options = TABLE[familyKey(zone, tier)][bandOf(stage)];
  return options[Math.min(options.length - 1, Math.floor(pick * options.length))];
}
