/**
 * The city's colour vocabulary.
 *
 * The old look drew each surface from whatever HSL triple its call site
 * happened to hold, so a residential tower, a bus shelter and a hillside had
 * no relationship to each other. Everything now goes through here: a small
 * set of materials with hue/saturation ranges chosen to sit together, an
 * environment block for sky, haze and water, and one lighting model that
 * applies the sun to any of them.
 *
 * Pure — colours in, colour strings out.
 */

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

export const hsl = (h: number, s: number, l: number): Hsl => ({ h, s, l });

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export function css(c: Hsl, alpha = 1): string {
  const h = ((c.h % 360) + 360) % 360;
  const s = clamp(c.s, 0, 100);
  const l = clamp(c.l, 0, 100);
  return alpha >= 1 ? `hsl(${h} ${s}% ${l}%)` : `hsl(${h} ${s}% ${l}% / ${alpha})`;
}

/**
 * Apply a light level to a colour. Shading by lightness alone goes muddy —
 * real surfaces also lose saturation as they brighten toward white and gain a
 * little as they darken, and shadowed faces pick up the sky's blue. This does
 * all three, which is most of why the new masses read as lit rather than
 * tinted.
 */
export function lit(c: Hsl, level: number): Hsl {
  const t = level - 1;
  // a narrower swing than the old straight multiply: a sunlit face is not
  // twice as bright as the shade face, it is warmer and a little lighter
  const l = clamp(c.l * (1 + t * 0.8), 3, 96);
  const hueShift = t < 0 ? t * 8 : t * -4;
  const towardBlue = t < 0 ? -t * 14 : 0;
  return {
    h: c.h + (c.h > 180 && c.h < 300 ? -hueShift : hueShift) * 0.6 + towardBlue * 0.4,
    s: clamp(c.s * (t < 0 ? 1 + t * 0.2 : 1 - t * 0.45), 0, 100),
    l,
  };
}

/** Blend two colours; `t` 0 → a, 1 → b. Hue takes the short way round. */
export function mix(a: Hsl, b: Hsl, t: number): Hsl {
  let dh = ((b.h - a.h + 540) % 360) - 180;
  return { h: a.h + dh * t, s: a.s + (b.s - a.s) * t, l: a.l + (b.l - a.l) * t };
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

export const ENV = {
  /** Sky behind the map: a real morning sky, not a saturated gradient. */
  skyTop: hsl(206, 30, 70),
  skyHorizon: hsl(200, 24, 86),
  /** Aerial perspective — distance washes toward this, slightly warm. */
  haze: hsl(40, 16, 84),
  /** Ambient bounce colour used to tint shadowed ground. */
  bounce: hsl(80, 18, 46),
  /** Cast-shadow ink. Kept blue-violet, never neutral grey: a grey shadow on
   * green grass reads as dirt, a blue one reads as shade. */
  shadow: hsl(228, 42, 24),
  water: hsl(202, 34, 32),
  waterDeep: hsl(210, 40, 22),
  waterShallow: hsl(186, 28, 42),
  sand: hsl(40, 24, 66),
  foam: hsl(196, 20, 92),
  asphalt: hsl(220, 5, 30),
  concreteKerb: hsl(38, 6, 66),
} as const;

// ---------------------------------------------------------------------------
// Building materials
// ---------------------------------------------------------------------------

export type MaterialKind =
  | 'brick'
  | 'render' // painted stucco / render
  | 'concrete'
  | 'glass'
  | 'metal'
  | 'timber'
  | 'stone';

export interface Material {
  kind: MaterialKind;
  /** Wall body colour before lighting. */
  body: Hsl;
  /** Trim: window frames, string courses, parapet caps. */
  trim: Hsl;
  /** Glazing colour for window openings by day. */
  glass: Hsl;
  /** How strongly the surface texture shows, 0..1. */
  grain: number;
  /** Sheen: glass and metal pick up a sky gradient down the wall. */
  sheen: number;
  /** Flat-roof deck colour, when the material comes from a swatch. */
  roof?: Hsl;
}

/**
 * Build a material from a hue/sat/lightness seed. The per-tier palettes in
 * buildings.ts already choose sensible seeds; this decides how that seed
 * behaves as a *surface* — what its trim looks like, how rough it is, how
 * much sky it reflects.
 */
export function material(kind: MaterialKind, body: Hsl): Material {
  switch (kind) {
    case 'brick':
      return {
        kind,
        body,
        trim: { h: body.h + 6, s: Math.max(4, body.s * 0.45), l: Math.min(92, body.l * 1.5 + 14) },
        glass: hsl(206, 26, 30),
        grain: 0.85,
        sheen: 0.04,
      };
    case 'render':
      return {
        kind,
        body,
        trim: { h: body.h, s: body.s * 0.4, l: Math.min(94, body.l * 1.35 + 12) },
        glass: hsl(208, 24, 32),
        grain: 0.3,
        sheen: 0.06,
      };
    case 'concrete':
      return {
        kind,
        body,
        trim: { h: body.h, s: body.s * 0.5, l: Math.min(90, body.l * 1.28 + 8) },
        glass: hsl(204, 22, 30),
        grain: 0.5,
        sheen: 0.08,
      };
    case 'glass':
      return {
        kind,
        body,
        trim: { h: body.h + 4, s: body.s * 0.35, l: Math.min(88, body.l * 1.4 + 10) },
        glass: { h: body.h + 4, s: Math.min(70, body.s * 1.25 + 8), l: body.l * 0.82 },
        grain: 0.08,
        sheen: 0.85,
      };
    case 'metal':
      return {
        kind,
        body,
        trim: { h: body.h, s: body.s * 0.6, l: Math.min(92, body.l * 1.32 + 10) },
        glass: hsl(202, 18, 34),
        grain: 0.22,
        sheen: 0.45,
      };
    case 'timber':
      return {
        kind,
        body,
        trim: { h: body.h + 10, s: body.s * 0.5, l: Math.min(92, body.l * 1.45 + 14) },
        glass: hsl(210, 20, 28),
        grain: 0.7,
        sheen: 0.03,
      };
    case 'stone':
      return {
        kind,
        body,
        trim: { h: body.h, s: body.s * 0.6, l: Math.min(92, body.l * 1.2 + 8) },
        glass: hsl(206, 20, 28),
        grain: 0.55,
        sheen: 0.05,
      };
  }
}

/** Warm lamplight behind an occupied window after dark. */
export const LAMP = hsl(34, 90, 68);
/** The cool white of a fluorescent office floor left on all night. */
export const OFFICE_LAMP = hsl(48, 30, 84);
/** Sodium street lighting. */
export const STREET_LAMP = hsl(36, 82, 60);

// ---------------------------------------------------------------------------
// Swatches
// ---------------------------------------------------------------------------

/**
 * The swatch library: what real buildings are made of.
 *
 * The old palettes were hue ramps — a residential tower was "slate, a bit
 * bluer per stage", and the family deltas swung that to teal or violet. A
 * downtown of them read as a bag of sweets. Real walls are brick, buff,
 * limestone, precast, painted render, weathered siding, blue-grey or bronze
 * glass, and almost nothing on a building is more than a quarter saturated.
 * Colour belongs to awnings, signs, doors, cars and trees.
 */
export type SwatchFamily = 'brick' | 'stone' | 'render' | 'siding' | 'concrete' | 'glass' | 'metal';

export interface Swatch {
  id: string;
  family: SwatchFamily;
  /** Which surface routine paints it; siding is timber, corrugated is metal. */
  kind: MaterialKind;
  body: Hsl;
  /** Default flat-roof deck for a mass in this material. */
  roof: Hsl;
  /** The saturation this swatch is allowed; 28 for all but three. */
  satCap: number;
}

const SW = (
  id: string,
  family: SwatchFamily,
  kind: MaterialKind,
  body: Hsl,
  roof: Hsl,
  satCap = 28,
): Swatch => ({ id, family, kind, body, roof, satCap });

const MEMBRANE = hsl(220, 6, 32);
const GRAVEL = hsl(36, 8, 52);
const TAR = hsl(220, 4, 26);

export const SWATCHES: Record<string, Swatch> = Object.fromEntries(
  [
    SW('brick-red', 'brick', 'brick', hsl(10, 38, 40), TAR, 38),
    SW('brick-brown', 'brick', 'brick', hsl(18, 26, 34), TAR),
    SW('brick-buff', 'brick', 'brick', hsl(36, 24, 58), GRAVEL),
    SW('brick-white', 'brick', 'brick', hsl(40, 8, 84), GRAVEL),
    SW('brick-grey', 'brick', 'brick', hsl(210, 4, 62), MEMBRANE),
    SW('stone-limestone', 'stone', 'stone', hsl(42, 14, 74), hsl(40, 8, 46)),
    SW('stone-sandstone', 'stone', 'stone', hsl(34, 22, 66), hsl(30, 10, 42)),
    SW('stone-granite', 'stone', 'stone', hsl(215, 5, 58), MEMBRANE),
    SW('stone-brownstone', 'stone', 'stone', hsl(20, 20, 38), TAR),
    SW('render-cream', 'render', 'render', hsl(44, 22, 84), hsl(20, 30, 40)),
    SW('render-peach', 'render', 'render', hsl(26, 26, 78), hsl(18, 34, 42)),
    SW('render-sage', 'render', 'render', hsl(96, 10, 66), hsl(30, 8, 40)),
    SW('render-terracotta', 'render', 'render', hsl(18, 28, 62), hsl(14, 34, 38)),
    SW('render-white', 'render', 'render', hsl(40, 4, 92), GRAVEL),
    SW('render-grey', 'render', 'render', hsl(215, 3, 72), MEMBRANE),
    SW('siding-white', 'siding', 'timber', hsl(40, 6, 88), hsl(210, 6, 34)),
    SW('siding-grey', 'siding', 'timber', hsl(208, 4, 66), hsl(210, 6, 30)),
    SW('siding-blue', 'siding', 'timber', hsl(210, 10, 60), hsl(215, 8, 32)),
    SW('siding-olive', 'siding', 'timber', hsl(80, 10, 52), hsl(30, 12, 30)),
    SW('siding-barn', 'siding', 'timber', hsl(8, 42, 36), hsl(210, 6, 32), 42),
    SW('concrete-precast', 'concrete', 'concrete', hsl(30, 5, 64), GRAVEL),
    SW('concrete-board', 'concrete', 'concrete', hsl(35, 4, 54), MEMBRANE),
    SW('concrete-painted', 'concrete', 'concrete', hsl(215, 3, 68), MEMBRANE),
    SW('glass-blue', 'glass', 'glass', hsl(208, 28, 46), MEMBRANE),
    SW('glass-green', 'glass', 'glass', hsl(168, 20, 42), MEMBRANE),
    SW('glass-bronze', 'glass', 'glass', hsl(32, 24, 36), TAR),
    SW('glass-silver', 'glass', 'glass', hsl(210, 10, 66), MEMBRANE),
    SW('glass-black', 'glass', 'glass', hsl(220, 8, 22), TAR),
    SW('metal-aluminium', 'metal', 'metal', hsl(210, 4, 68), MEMBRANE),
    SW('metal-corrugated', 'metal', 'metal', hsl(205, 5, 60), hsl(205, 5, 48)),
    SW('metal-corten', 'metal', 'metal', hsl(20, 45, 34), hsl(20, 30, 28), 45),
    SW('metal-white', 'metal', 'metal', hsl(40, 2, 90), hsl(210, 4, 70)),
  ].map((s) => [s.id, s]),
);

export function swatch(id: string): Swatch {
  const s = SWATCHES[id];
  if (!s) throw new Error(`unknown swatch ${id}`);
  return s;
}

export function swatchIds(family: SwatchFamily): string[] {
  return Object.values(SWATCHES)
    .filter((s) => s.family === family)
    .map((s) => s.id);
}

/**
 * A material from a swatch. `body` is the (possibly skin-remapped) wall
 * colour; trim and glass are derived from it so a remapped skin stays
 * coherent, while the roof deck stays the swatch's own.
 */
export function materialOf(sw: Swatch, body: Hsl = sw.body): Material {
  return { ...material(sw.kind, body), roof: sw.roof };
}
