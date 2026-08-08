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
  const l = clamp(c.l * level, 2, 96);
  // shadowed faces cool toward the sky, sunlit faces warm slightly
  const hueShift = t < 0 ? t * 14 : t * -6;
  const towardBlue = t < 0 ? -t * 8 : 0;
  return {
    h: c.h + (c.h > 180 && c.h < 300 ? -hueShift : hueShift) * 0.6 + towardBlue * 0.4,
    s: clamp(c.s * (t < 0 ? 1 + t * 0.25 : 1 - t * 0.5), 0, 100),
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
  /** Sky behind the map: the void the old renderer painted #10151c. */
  skyTop: hsl(208, 44, 62),
  skyHorizon: hsl(202, 38, 78),
  /** Aerial perspective — distance washes toward this. */
  haze: hsl(205, 34, 80),
  /** Ambient bounce colour used to tint shadowed ground. */
  bounce: hsl(96, 22, 44),
  /** Cast-shadow ink. Kept blue-violet, never neutral grey: a grey shadow on
   * green grass reads as dirt, a blue one reads as shade. */
  shadow: hsl(232, 40, 22),
  water: hsl(200, 40, 28),
  waterDeep: hsl(212, 46, 20),
  waterShallow: hsl(190, 32, 38),
  sand: hsl(42, 26, 62),
  foam: hsl(196, 22, 90),
  asphalt: hsl(220, 8, 26),
  concreteKerb: hsl(210, 8, 62),
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
export const LAMP = hsl(38, 92, 66);
/** The cool blue-white of a fluorescent office floor left on all night. */
export const OFFICE_LAMP = hsl(52, 42, 82);
/** Sodium street lighting. */
export const STREET_LAMP = hsl(36, 88, 62);
