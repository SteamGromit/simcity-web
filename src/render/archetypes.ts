/** Pure variant logic for building archetypes. No canvas imports — this
 * module must stay testable without a DOM. */

import { Stage, Tier, Wealth, Zone } from '../sim/types';
import { normalizeTier } from '../sim/tiers';
import type { Facade } from './massing';

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

export type RoofStyle = 'flat' | 'parapet' | 'gabled' | 'sawtooth' | 'hipped' | 'mansard';
/** How a typology is fenestrated. Punched openings for masonry, a ribbon for
 * a framed building, a curtain wall for a glass one, none for a blank shed. */
export type WindowStyle = 'punched' | 'ribbon' | 'curtain' | 'none';
export type PropKind =
  | 'waterTower' | 'acUnit' | 'antenna' | 'chimney' | 'vent'
  | 'tank' | 'awning' | 'yardTree' | 'hedge' | 'helipad' | 'skylight';

/** Units are normalized to the stage's footprint budget: the drawing code
 * multiplies ox/oy/f by footprintBudget(stage), so one recipe serves every
 * stage in its band and the invariant is uniform: |ox| + w/2 ≤ 0.5.
 *
 * `w` and `d` give the mass a *plan*: equal makes the familiar square block,
 * unequal makes the slabs, wings and rows that a city is actually built from.
 * They default to `f`, which is what every one-number recipe used to mean. */
export interface SubBox {
  ox: number; // center offset from tile center, in tile units
  oy: number;
  f: number;  // footprint fraction, both ways unless w/d say otherwise
  hf: number; // height fraction of the lot's base height; exactly one box has 1
  w?: number; // extent along grid x
  d?: number; // extent along grid y
  /** Cut corners off the plan, as a fraction of each edge. */
  chamfer?: number;
}

export interface Archetype {
  boxes: SubBox[];      // 1–3; drawn back-to-front per frame
  roof: RoofStyle;      // applied to the full-height mass
  props: PropKind[];    // candidate slots; channels decide which appear
  windows: WindowStyle;
  /** Facade dressing on the primary mass — what makes a brick walk-up read
   * differently from a curtain-wall office at the same height. */
  facade?: Facade;
}

/** Plan extents of a sub-box, in tile fractions. */
export function boxExtent(sb: SubBox): { w: number; d: number } {
  return { w: sb.w ?? sb.f, d: sb.d ?? sb.f };
}

/** The stage's composite footprint cap — same curve the single box used. */
export function footprintBudget(stage: Stage): number {
  return Math.min(0.85, 0.55 + stage * 0.05);
}

const B = (ox: number, oy: number, f: number, hf: number, extra: Partial<SubBox> = {}): SubBox => ({
  ox,
  oy,
  f,
  hf,
  ...extra,
});
const A = (
  boxes: SubBox[],
  roof: RoofStyle,
  windows: WindowStyle,
  props: PropKind[],
  facade?: Facade,
): Archetype => ({ boxes, roof, windows, props, facade });

// Facade recipes, named for what they actually are.
const F = {
  /** Old brick walk-up: iron on the front, a moulding at the top. */
  walkup: { cornice: true, fireEscape: true, stringCourse: 2 } as Facade,
  /** Post-war residential: slab balconies all the way up over a lobby. */
  balconied: { balconies: true, podium: 1 } as Facade,
  /** Panel block: banded, plain, a lot of it. */
  panel: { stringCourse: 1, balconies: true } as Facade,
  /** Bay-fronted house or terrace. */
  bayed: { bays: true, cornice: true } as Facade,
  /** Classical block: piers, banding and a heavy top. */
  classical: { pilasters: true, cornice: true, stringCourse: 3 } as Facade,
  /** Office: retail base, piers above. */
  office: { podium: 2, pilasters: true, cornice: true } as Facade,
  /** Curtain wall over a lobby — nothing else, on purpose. */
  curtain: { podium: 2 } as Facade,
  /** Dense hot-climate block: signage over the street, units on the wall. */
  shophouse: { podium: 1, signBoards: true, acUnits: true, stringCourse: 1 } as Facade,
  /** Big-box retail: one long signed frontage. */
  bigbox: { podium: 1, signBoards: true, cornice: true } as Facade,
} as const;

type FamilyKey = 'R1' | 'R2' | 'R3' | 'C1' | 'C2' | 'C3' | 'dirty' | 'manu' | 'tech';
/** Stage bands: low 1–2, mid 3–5, high 6–7. */
type Band = 0 | 1 | 2;

function bandOf(stage: Stage): Band {
  return stage <= 2 ? 0 : stage <= 5 ? 1 : 2;
}

/**
 * The building types a city is made of. Each family gets four to six per
 * stage band, chosen by the lot's seed, and each one is a real typology
 * rather than a box with a different colour: a shotgun house is narrow and
 * deep, a terrace is a long thin slab, a panel block is banded and
 * balconied, a shophouse carries signage over the street, an office tower
 * sits on a retail podium with its corners cut.
 */
const TABLE: Record<FamilyKey, [Archetype[], Archetype[], Archetype[]]> = {
  R1: [
    [
      // shotgun house: one room wide, several deep
      A([B(0, 0, 0.8, 1, { w: 0.4, d: 0.9 })], 'gabled', 'punched', ['chimney', 'yardTree']),
      // bungalow with a lean-to at the back
      A([B(-0.06, 0.08, 0.72, 1), B(0.2, -0.2, 0.34, 0.6)], 'gabled', 'punched', ['chimney']),
      // wide low ranch
      A([B(0, 0, 0.9, 1, { w: 0.9, d: 0.5 })], 'gabled', 'punched', ['yardTree', 'chimney']),
      // flat-roofed infill
      A([B(0, 0, 0.85, 1)], 'flat', 'punched', ['yardTree', 'hedge']),
    ],
    [
      // brick walk-up with the fire escape on the street
      A([B(0, 0, 0.9, 1, { w: 0.9, d: 0.62 })], 'flat', 'punched', ['acUnit', 'chimney'], F.walkup),
      // two joined houses
      A([B(-0.17, 0, 0.6, 1), B(0.19, 0, 0.56, 0.88)], 'gabled', 'punched', ['chimney']),
      // court block round a yard
      A([B(0, -0.14, 0.72, 1, { d: 0.4 }), B(0, 0.24, 0.5, 0.62)], 'flat', 'punched', ['waterTower'], F.walkup),
      A([B(0, 0, 0.86, 1)], 'parapet', 'punched', ['acUnit'], { cornice: true }),
    ],
    [
      // panel block: a long banded slab
      A([B(0, 0, 0.95, 1, { w: 0.95, d: 0.42 })], 'flat', 'punched', ['waterTower'], F.panel),
      // point block over a lobby
      A([B(0, 0, 0.62, 1)], 'flat', 'punched', ['waterTower', 'acUnit'], F.balconied),
      A([B(-0.14, -0.12, 0.62, 1), B(0.18, 0.18, 0.52, 0.78)], 'flat', 'punched', ['acUnit'], F.panel),
      A([B(0, 0, 0.9, 0.35), B(0, 0, 0.58, 1)], 'parapet', 'punched', ['antenna'], F.balconied),
    ],
  ],
  R2: [
    [
      // suburban house with a garage wing
      A([B(-0.1, 0.04, 0.66, 1), B(0.22, -0.1, 0.36, 0.52)], 'gabled', 'punched', ['yardTree', 'chimney']),
      // two storeys with bay windows
      A([B(0, 0, 0.76, 1)], 'gabled', 'punched', ['chimney'], F.bayed),
      // wide low ranch with a porch
      A([B(0, 0, 0.88, 1, { w: 0.88, d: 0.48 })], 'hipped', 'punched', ['yardTree']),
      A([B(0, 0, 0.8, 1)], 'parapet', 'punched', ['hedge'], { cornice: true }),
    ],
    [
      // brick terrace: a long shallow row
      A([B(0, 0, 0.92, 1, { w: 0.92, d: 0.4 })], 'flat', 'punched', ['chimney', 'waterTower'], F.walkup),
      // mid-rise over a lobby, balconies above
      A([B(0, 0, 0.8, 1)], 'parapet', 'punched', ['acUnit'], F.balconied),
      // L-shaped block round a court
      A([B(-0.16, -0.1, 0.62, 1, { d: 0.5 }), B(0.16, 0.2, 0.5, 0.8)], 'flat', 'punched', ['acUnit'], F.panel),
      A([B(0, 0, 0.9, 0.42), B(0, 0, 0.56, 1)], 'parapet', 'punched', ['waterTower'], F.classical),
    ],
    [
      // slab block
      A([B(0, 0, 0.95, 1, { w: 0.95, d: 0.4 })], 'flat', 'punched', ['waterTower'], F.panel),
      // chamfered residential tower over a podium
      A([B(0, 0, 0.66, 1, { chamfer: 0.26 })], 'flat', 'punched', ['antenna'], F.balconied),
      // twin masses on a shared base
      A([B(0, 0, 0.92, 0.3, { d: 0.6 }), B(-0.19, 0, 0.44, 1), B(0.19, 0, 0.4, 0.82)], 'flat', 'punched', ['acUnit'], F.balconied),
      A([B(0, 0, 0.88, 1)], 'parapet', 'punched', ['acUnit'], F.classical),
    ],
  ],
  R3: [
    [
      // villa with a hipped roof and a wing
      A([B(-0.08, 0.06, 0.66, 1), B(0.22, -0.14, 0.34, 0.66)], 'hipped', 'punched', ['hedge', 'yardTree']),
      // townhouse under a mansard
      A([B(0, 0, 0.7, 1, { w: 0.5, d: 0.8 })], 'mansard', 'punched', ['chimney'], F.bayed),
      A([B(0, -0.08, 0.62, 1), B(0, 0.24, 0.44, 0.5)], 'gabled', 'punched', ['hedge']),
    ],
    [
      // mansion block: piers, banding, heavy cornice
      A([B(0, 0, 0.82, 1, { d: 0.62 })], 'mansard', 'punched', ['chimney', 'waterTower'], F.classical),
      A([B(0, 0, 0.78, 0.5), B(0, 0, 0.56, 1)], 'parapet', 'punched', ['hedge'], F.classical),
      A([B(-0.13, 0.13, 0.58, 1), B(0.18, -0.14, 0.44, 0.76)], 'parapet', 'punched', [], F.bayed),
    ],
    [
      // slender glass tower on a stone base
      A([B(0, 0, 0.86, 0.22), B(0, 0, 0.5, 1, { chamfer: 0.3 })], 'flat', 'curtain', ['antenna'], F.curtain),
      A([B(0, 0, 0.6, 1, { chamfer: 0.22 })], 'parapet', 'curtain', [], F.curtain),
      A([B(0, 0, 0.84, 0.34), B(0, 0, 0.62, 0.7), B(0, 0, 0.42, 1)], 'flat', 'curtain', ['antenna'], F.curtain),
    ],
  ],
  C1: [
    [
      // strip retail: wide, low, one long awning
      A([B(0, 0, 0.92, 1, { w: 0.92, d: 0.44 })], 'flat', 'punched', ['awning', 'vent'], F.bigbox),
      // corner store with a store room behind
      A([B(-0.16, 0.06, 0.58, 1), B(0.2, -0.14, 0.44, 0.76)], 'flat', 'punched', ['awning', 'acUnit']),
      A([B(0, 0, 0.86, 1)], 'parapet', 'punched', ['awning'], { podium: 1, cornice: true }),
    ],
    [
      // two-storey shopfront with boards over the pavement
      A([B(0, 0, 0.9, 1, { d: 0.6 })], 'flat', 'punched', ['acUnit', 'vent'], F.shophouse),
      A([B(0, -0.1, 0.74, 1), B(0, 0.28, 0.38, 0.46)], 'parapet', 'punched', ['acUnit'], F.bigbox),
      A([B(0, 0, 0.94, 1, { w: 0.94, d: 0.5 })], 'flat', 'ribbon', ['vent'], F.bigbox),
    ],
    [
      // department store: one big signed box
      A([B(0, 0, 0.94, 1)], 'parapet', 'ribbon', ['waterTower', 'acUnit'], F.bigbox),
      A([B(0, 0, 0.9, 0.55), B(0, 0, 0.6, 1)], 'flat', 'punched', ['antenna'], F.office),
      A([B(0, 0, 0.92, 1, { w: 0.92, d: 0.52 })], 'flat', 'ribbon', ['acUnit'], F.bigbox),
    ],
  ],
  C2: [
    [
      // shophouse: narrow, deep, signage and units on the wall
      A([B(0, 0, 0.8, 1, { w: 0.42, d: 0.86 })], 'flat', 'punched', ['acUnit'], F.shophouse),
      A([B(-0.14, 0.08, 0.6, 1), B(0.22, -0.1, 0.42, 0.7)], 'parapet', 'punched', ['awning'], F.shophouse),
      A([B(0, 0, 0.86, 1, { d: 0.56 })], 'flat', 'punched', ['awning', 'acUnit'], F.bigbox),
    ],
    [
      // office over a retail podium
      A([B(0, 0, 0.9, 1)], 'flat', 'ribbon', ['acUnit'], F.office),
      // glass box
      A([B(0, 0, 0.86, 1, { chamfer: 0.2 })], 'parapet', 'curtain', ['vent'], F.curtain),
      // tower rising from a full-lot podium
      A([B(0, 0, 0.94, 0.32), B(0, 0, 0.6, 1)], 'flat', 'ribbon', ['antenna'], F.office),
      A([B(-0.16, -0.12, 0.6, 1), B(0.16, 0.16, 0.54, 0.84)], 'flat', 'ribbon', ['acUnit'], F.office),
    ],
    [
      // setback office tower on a podium — the wedding-cake profile
      A([B(0, 0, 0.94, 0.3), B(0, 0, 0.7, 0.66), B(0, 0, 0.5, 1)], 'flat', 'curtain', ['antenna', 'helipad'], F.office),
      // slab office
      A([B(0, 0, 0.92, 1, { w: 0.92, d: 0.4, chamfer: 0.12 })], 'flat', 'curtain', ['vent'], F.curtain),
      // chamfered point tower
      A([B(0, 0, 0.62, 1, { chamfer: 0.3 })], 'parapet', 'curtain', ['antenna', 'helipad'], F.curtain),
      A([B(0, 0, 0.9, 0.42), B(-0.12, 0.1, 0.5, 1), B(0.16, -0.12, 0.4, 0.8)], 'flat', 'curtain', [], F.office),
    ],
  ],
  C3: [
    [
      A([B(0, 0, 0.78, 1, { chamfer: 0.2 })], 'parapet', 'curtain', [], F.curtain),
      A([B(0, 0, 0.86, 1, { d: 0.58 })], 'flat', 'curtain', [], F.office),
    ],
    [
      A([B(0, 0, 0.88, 0.4), B(0, 0, 0.58, 1, { chamfer: 0.24 })], 'flat', 'curtain', ['acUnit'], F.curtain),
      A([B(0, 0, 0.9, 1, { w: 0.9, d: 0.44 })], 'parapet', 'curtain', ['antenna', 'helipad'], F.curtain),
      A([B(0, 0, 0.82, 1, { chamfer: 0.34 })], 'flat', 'curtain', ['acUnit'], F.office),
    ],
    [
      // the classic ziggurat
      A([B(0, 0, 0.92, 0.26), B(0, 0, 0.72, 0.56), B(0, 0, 0.5, 1, { chamfer: 0.22 })], 'flat', 'curtain', ['antenna', 'helipad'], F.curtain),
      // slender chamfered shaft
      A([B(0, 0, 0.52, 1, { chamfer: 0.32 })], 'flat', 'curtain', ['antenna'], F.curtain),
      // slab with a cut corner
      A([B(0, 0, 0.9, 1, { w: 0.9, d: 0.38, chamfer: 0.16 })], 'parapet', 'curtain', ['acUnit'], F.curtain),
      A([B(0, 0, 0.86, 0.36), B(-0.13, 0.1, 0.48, 1), B(0.17, -0.12, 0.4, 0.74)], 'flat', 'curtain', ['antenna'], F.office),
    ],
  ],
  dirty: [
    [
      A([B(0, 0, 0.9, 1, { w: 0.9, d: 0.55 })], 'flat', 'punched', ['tank', 'vent']),
      A([B(-0.15, 0.05, 0.6, 1), B(0.22, -0.08, 0.44, 0.7)], 'flat', 'punched', ['tank']),
    ],
    [
      A([B(0, 0, 0.95, 1, { w: 0.95, d: 0.6 })], 'flat', 'ribbon', ['tank', 'vent']),
      A([B(-0.12, -0.1, 0.66, 1), B(0.2, 0.18, 0.5, 0.6)], 'flat', 'ribbon', ['vent', 'tank']),
      A([B(0, 0, 0.92, 0.5), B(0, 0, 0.5, 1)], 'flat', 'ribbon', ['tank'], { stringCourse: 2 }),
    ],
    [
      A([B(0, 0, 0.95, 1, { d: 0.7 })], 'flat', 'ribbon', ['tank', 'vent']),
      A([B(-0.14, 0.1, 0.6, 1), B(0.18, -0.14, 0.55, 0.75)], 'flat', 'ribbon', ['tank', 'vent']),
    ],
  ],
  manu: [
    [
      A([B(0, 0, 0.92, 1, { w: 0.92, d: 0.6 })], 'sawtooth', 'ribbon', ['vent', 'skylight']),
      A([B(0, 0, 0.82, 1)], 'flat', 'ribbon', ['acUnit']),
    ],
    [
      A([B(0, 0, 0.95, 1, { w: 0.95, d: 0.66 })], 'sawtooth', 'ribbon', ['vent', 'acUnit', 'skylight']),
      // warehouse with a loading dock wing
      A([B(-0.14, 0, 0.62, 1, { d: 0.7 }), B(0.2, 0.05, 0.5, 0.5)], 'sawtooth', 'ribbon', ['vent', 'skylight']),
      A([B(0, 0, 0.9, 1, { w: 0.5, d: 0.9 })], 'flat', 'ribbon', ['vent', 'tank']),
    ],
    [
      A([B(0, 0, 0.95, 1, { d: 0.72 })], 'sawtooth', 'ribbon', ['vent', 'tank', 'skylight']),
      A([B(0, -0.1, 0.75, 1), B(0, 0.27, 0.42, 0.5)], 'flat', 'ribbon', ['acUnit', 'vent']),
    ],
  ],
  tech: [
    [
      A([B(0, 0, 0.82, 1, { d: 0.6 })], 'parapet', 'ribbon', ['antenna'], F.curtain),
      A([B(0, 0, 0.7, 1)], 'flat', 'ribbon', ['hedge'], F.curtain),
    ],
    [
      A([B(0, 0, 0.88, 1, { chamfer: 0.18 })], 'parapet', 'ribbon', ['antenna', 'acUnit'], F.curtain),
      A([B(0, 0, 0.86, 0.42), B(0, 0, 0.56, 1)], 'parapet', 'curtain', ['antenna'], F.curtain),
      A([B(0, 0, 0.92, 1, { w: 0.92, d: 0.45 })], 'flat', 'ribbon', ['vent'], F.curtain),
    ],
    [
      A([B(0, 0, 0.9, 0.38), B(0, 0, 0.58, 1, { chamfer: 0.24 })], 'parapet', 'curtain', ['antenna'], F.curtain),
      A([B(-0.14, 0.12, 0.55, 1), B(0.18, -0.12, 0.5, 0.9)], 'flat', 'curtain', ['antenna'], F.curtain),
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
  // Everything else draws on the R/C ladder — but `normalizeTier` only
  // coerces the tier for zones it recognises as residential or commercial, so
  // a civic lot carrying an industry tier would build a key like 'Cdirty',
  // which is not in TABLE, and index `undefined[…]`. Not reachable by
  // building anything (a fresh tile carries wealth 2), but a save that has
  // been edited or mangled should cost a frame at worst, not throw.
  const wealth: Wealth = t === 1 || t === 2 || t === 3 ? t : 2;
  return `${zone === Zone.Residential ? 'R' : 'C'}${wealth}` as FamilyKey;
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
