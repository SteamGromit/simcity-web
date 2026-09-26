/**
 * One sun for the whole city.
 *
 * The camera no longer rotates, so the light can finally be a real direction
 * rather than a screen-space fudge: it sits low in the west, which puts the
 * two visible walls of every box at different brightnesses and throws every
 * mass a shadow that lies *along the ground plane* toward the screen's lower
 * right. Because the direction is fixed, a shadow can be baked into a sprite
 * and a tower's shadow across the street is correct rather than suggestive.
 *
 * Pure — no canvas — so the geometry is unit-testable.
 */

export type Pt = [number, number];

/**
 * Shadow displacement per screen pixel of height. This is a direction in the
 * ground plane (grid +x, slightly +y) already projected to screen, so a
 * shadow reads as lying flat rather than pasted on.
 */
export const SUN_DX = 0.5;
export const SUN_DY = 0.42;

/** Face brightness multipliers under the fixed sun. */
export const LIGHT = {
  /** Roofs face the sky and take the most light. */
  roof: 1.1,
  /** The screen-left wall (grid +y normal) catches the sun. */
  left: 1.0,
  /** The screen-right wall (grid +x normal) turns away from it. */
  right: 0.64,
  /** Anything treated as ambient-only — undersides, recesses. */
  ambient: 0.46,
} as const;

/**
 * Value multipliers across (u) and up (v) a face. The shared corner of the
 * two visible walls is u=0 on the screen-left wall and u=1 on the right one:
 * both darken into it, which is what makes two parallelograms read as one
 * solid. Sky light brightens toward the top; bounced ground light keeps the
 * base from going black.
 */
export const FACE = {
  freeLit: 1.04,
  cornerLit: 0.9,
  freeShade: 0.92,
  cornerShade: 0.8,
  baseV: 0.94,
  topV: 1.03,
} as const;

/** The lit value at (u across, v01 up) on a wall of the given screen side. */
export function faceValue(u: number, v01: number, side: 'left' | 'right'): number {
  const t = side === 'left' ? u : 1 - u; // 0 at the shared corner
  const [corner, free] =
    side === 'left' ? [FACE.cornerLit, FACE.freeLit] : [FACE.cornerShade, FACE.freeShade];
  const across = corner + (free - corner) * Math.min(1, t / 0.55);
  const up =
    v01 < 0.25
      ? FACE.baseV + (1 - FACE.baseV) * (v01 / 0.25)
      : 1 + (FACE.topV - 1) * ((v01 - 0.25) / 0.75);
  return LIGHT[side] * across * up;
}

/** Where a point `h` pixels above the ground drops its shadow. */
export function shadowOffset(h: number): Pt {
  return [h * SUN_DX, h * SUN_DY];
}

/**
 * Convex hull of a point set (monotone chain), returned counter-clockwise in
 * maths orientation — which is clockwise on a y-down canvas, matching how
 * tile quads are wound everywhere else. Degenerate inputs come back as-is.
 */
export function convexHull(pts: Pt[]): Pt[] {
  if (pts.length < 3) return pts.slice();
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Pt, a: Pt, b: Pt) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Pt[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) {
      lower.pop();
    }
    lower.push(q);
  }
  const upper: Pt[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) {
      upper.pop();
    }
    upper.push(q);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * The ground shadow a prism of height `h` over footprint `foot` throws: the
 * footprint swept along the sun vector, i.e. the hull of the footprint and
 * its displaced copy. One convex polygon, one fill — cheap enough to do for
 * every building on screen every frame.
 */
export function shadowQuad(foot: Pt[], h: number): Pt[] {
  const [dx, dy] = shadowOffset(h);
  const moved: Pt[] = foot.map(([x, y]) => [x + dx, y + dy]);
  return convexHull(foot.concat(moved));
}

/**
 * How much a wall of a given screen-space orientation is lit. `dx` is the
 * projected run of the wall's base edge: negative runs are camera-facing
 * (see the winding note in massing.ts), and of those, the one heading up-left
 * is the sunlit side.
 */
export function wallLight(ax: number, ay: number, bx: number, by: number): number {
  void ax;
  void bx;
  // Screen-left wall: its base edge runs left-and-*up*, so the sun in the
  // west catches it; the screen-right wall runs left-and-down, and turns away.
  return by - ay <= 0 ? LIGHT.left : LIGHT.right;
}
