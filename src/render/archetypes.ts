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

/**
 * [dh, ds, dl] wall-family deltas per tier; entry 0 is the familiar base ramp.
 *
 * Large hue deltas are deliberate — they move slate to brick, not just warm
 * it. Four families per tier, spread far enough apart that a downtown block
 * reads as bronze-and-green-and-blue glass rather than one blue curtain wall
 * repeated forty times; the ladder's *value* progression is what still says
 * "this lot is richer than that one".
 */
const FAMILIES: Record<FamilyKey, [number, number, number][]> = {
  // timber brown → warmer stain → cool grey-wash → sage green
  R1: [[0, 0, 0], [15, 8, -3], [-18, -4, 4], [72, -8, 6]],
  // slate / brick / pale clapboard / mid-century green
  R2: [[0, 0, 0], [160, 14, -4], [24, 6, 8], [-70, -6, 3]],
  // pale stone / cool stone / warm limestone / bronze glass
  R3: [[0, 0, 0], [-12, 4, -4], [8, -6, 3], [-162, -6, 5]],
  // warm render / ochre / teal / oxblood brick
  C1: [[0, 0, 0], [12, 6, -4], [-20, -8, 5], [170, -4, 1]],
  // blue glass / bronze glass / green glass / graphite
  C2: [[0, 0, 0], [-176, -8, 2], [-62, -12, 0], [26, -22, -7]],
  // dark blue glass / near-black bronze / deep teal / charcoal
  C3: [[0, 0, 0], [-190, -10, 5], [-88, -14, 3], [22, -20, -3]],
  dirty: [[0, 0, 0], [10, 8, -4], [-6, -5, 5], [186, -6, 2]],
  manu: [[0, 0, 0], [8, 4, -4], [-10, 3, 4], [-40, 6, -2]],
  tech: [[0, 0, 0], [-12, 6, -4], [14, -6, 4], [-160, -4, 6]],
};

export function paletteFamily(zone: Zone, tier: Tier, pick: number): [number, number, number] {
  const fams = FAMILIES[familyKey(zone, tier)];
  return fams[Math.min(fams.length - 1, Math.floor(pick * fams.length))];
}

/** Per-tier height multiplier over the stage ramp: wealth builds up,
 * dirty industry sprawls low, tech rises to a mid-campus profile. */
const HEIGHT_SCALE: Record<FamilyKey, number> = {
  R1: 0.85, R2: 1.0, R3: 1.2,
  C1: 0.85, C2: 1.0, C3: 1.35,
  dirty: 0.85, manu: 1.0, tech: 1.15,
};

export function heightScaleFor(zone: Zone, tier: Tier): number {
  if (zone !== Zone.Residential && zone !== Zone.Commercial && zone !== Zone.Industrial) {
    return 1;
  }
  return HEIGHT_SCALE[familyKey(zone, tier)];
}

export interface FarmLayout {
  barnOx: number; // barn center offset, tile-fraction units
  barnOy: number;
  furrowAngle: 0 | 1;
  extra: 'silo' | 'coop' | null;
}

export const FARM_LAYOUTS: FarmLayout[] = [
  { barnOx: -0.18, barnOy: 0.1, furrowAngle: 0, extra: 'silo' },
  { barnOx: 0.15, barnOy: -0.12, furrowAngle: 1, extra: null },
  { barnOx: 0, barnOy: 0.18, furrowAngle: 0, extra: 'coop' },
  { barnOx: -0.12, barnOy: -0.15, furrowAngle: 1, extra: 'silo' },
];

export function pickFarmLayout(pick: number): FarmLayout {
  return FARM_LAYOUTS[Math.min(FARM_LAYOUTS.length - 1, Math.floor(pick * FARM_LAYOUTS.length))];
}
