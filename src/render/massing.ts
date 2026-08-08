/**
 * How a solid gets painted.
 *
 * Everything with volume — a house, a tower, a bus shelter, a museum wing —
 * is a prism standing on an isometric footprint. This module owns that: the
 * two visible walls, the roof cap, the materials on them, the windows punched
 * into them, and the shadow the whole thing throws.
 *
 * The trick that makes the detail affordable is drawing in *wall space*. A
 * wall is an affine image of the unit strip (u across, v up), so one canvas
 * transform turns "a window at 40% across, 12px up" into a plain `fillRect`
 * that lands correctly sheared on the isometric face. Brick courses, mullions,
 * spandrels and lit panes are all just rectangles in that space.
 */

import { fbm, hash2 } from './noise';
import { Hsl, LAMP, Material, MaterialKind, OFFICE_LAMP, css, lit, material, mix } from './palette';
import { LIGHT, Pt, shadowQuad, wallLight } from './sun';

/** Footprint corners, north/east/south/west, clockwise on a y-down canvas. */
export type Quad = [Pt, Pt, Pt, Pt];

export interface PrismResult {
  /** The camera-facing wall base edges, screen space. */
  walls: [Pt, Pt][];
  /** The roof outline after lifting. */
  roof: Pt[];
}

/** A diamond of the given half-extents around (cx, cy). */
export function diamond(cx: number, cy: number, hw: number, hh: number): Quad {
  return [
    [cx, cy - hh],
    [cx + hw, cy],
    [cx, cy + hh],
    [cx - hw, cy],
  ];
}

/** The projected screen offsets of one tile step along each grid axis. */
const GX: Pt = [32, 16];
const GY: Pt = [-32, 16];

/** Screen offset of a step of (ox, oy) tiles along the grid axes. */
export function tileOffset(ox: number, oy: number): Pt {
  return [ox * GX[0] + oy * GY[0], ox * GX[1] + oy * GY[1]];
}

/**
 * A rectangle `2a × 2b` *tile units* on the ground, centred at (cx, cy) and
 * projected. `a === b` is the familiar diamond; unequal extents give the slab
 * blocks and cross plans a city needs to stop looking like a box farm.
 */
export function tileRect(cx: number, cy: number, a: number, b: number): Quad {
  const p = (i: number, j: number): Pt => [
    cx + i * GX[0] + j * GY[0],
    cy + i * GX[1] + j * GY[1],
  ];
  return [p(-a, -b), p(a, -b), p(a, b), p(-a, b)];
}

/**
 * Cut the corners off a footprint by fraction `c` of each edge — the chamfer
 * that turns a plain box into a tower with a cut corner, and the cheapest
 * thing that stops a skyline reading as extruded rectangles.
 */
export function chamfer(q: Pt[], c: number): Pt[] {
  if (c <= 0.001) return q.slice();
  const out: Pt[] = [];
  for (let i = 0; i < q.length; i++) {
    const prev = q[(i - 1 + q.length) % q.length];
    const next = q[(i + 1) % q.length];
    const p = q[i];
    out.push([p[0] + (prev[0] - p[0]) * c, p[1] + (prev[1] - p[1]) * c]);
    out.push([p[0] + (next[0] - p[0]) * c, p[1] + (next[1] - p[1]) * c]);
  }
  return out;
}

/** The camera-facing edge lowest on screen: a building's street frontage. */
export function frontEdge(foot: Pt[]): [Pt, Pt] {
  let best: [Pt, Pt] = [foot[0], foot[1]];
  let bestY = -Infinity;
  for (let i = 0; i < foot.length; i++) {
    const a = foot[i];
    const b = foot[(i + 1) % foot.length];
    if (b[0] - a[0] >= -1e-9) continue;
    if (a[1] + b[1] > bestY) {
      bestY = a[1] + b[1];
      best = [a, b];
    }
  }
  return best;
}

/** Centroid of a footprint, by bounding box — exact for the symmetric shapes
 * everything here is built from. */
export function centre(q: Pt[]): Pt {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const [x, y] of q) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return [(x0 + x1) / 2, (y0 + y1) / 2];
}

/**
 * Half the screen width and height a footprint spans — the radii of the
 * ellipse that fits inside it.
 *
 * Always measure this rather than reading "the right-hand corner" and "the
 * bottom corner" off fixed indices. Corner order is grid order, not screen
 * order, so a quarter turn moves which corner is where: the old
 * `q[1][0] - cx` gave the true half-width at rest, zero a quarter turn
 * later, and its *negative* at half a turn. A negative radius makes
 * ctx.ellipse throw, and that throw escaping the render loop stopped the
 * game redrawing at all. Bounding the quad is turn-independent, and agrees
 * with the old arithmetic exactly where the old arithmetic was right.
 */
export function halfExtent(q: Pt[]): [number, number] {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const [x, y] of q) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return [(x1 - x0) / 2, (y1 - y0) / 2];
}

/** Shrink a footprint toward its centre. */
export function inset<T extends Pt[]>(q: T, f: number): T {
  const [cx, cy] = centre(q);
  return q.map(([x, y]) => [cx + (x - cx) * f, cy + (y - cy) * f] as Pt) as T;
}

/** Move a footprint by a screen offset. */
export function shift<T extends Pt[]>(q: T, dx: number, dy: number): T {
  return q.map(([x, y]) => [x + dx, y + dy] as Pt) as T;
}

/** Raise a footprint by `h` screen pixels. */
export function raise<T extends Pt[]>(q: T, h: number): T {
  return q.map(([x, y]) => [x, y - h] as Pt) as T;
}

export function fill(ctx: CanvasRenderingContext2D, pts: Pt[], style: string | CanvasGradient) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fillStyle = style;
  ctx.fill();
}

// ---------------------------------------------------------------------------
// Wall space
// ---------------------------------------------------------------------------

/**
 * Run `paint` with the canvas mapped onto the wall standing on edge a→b:
 * x becomes 0..1 across the wall, y becomes height above its base (drawn
 * upward). Clipped to the wall, so a texture can overshoot without bleeding
 * onto the neighbour.
 */
export function inWallSpace(
  ctx: CanvasRenderingContext2D,
  a: Pt,
  b: Pt,
  h: number,
  paint: (ctx: CanvasRenderingContext2D, len: number) => void,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.lineTo(b[0], b[1] - h);
  ctx.lineTo(a[0], a[1] - h);
  ctx.closePath();
  ctx.clip();
  ctx.transform(b[0] - a[0], b[1] - a[1], 0, -1, a[0], a[1]);
  paint(ctx, Math.hypot(b[0] - a[0], b[1] - a[1]));
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Surface textures — all drawn in wall space
// ---------------------------------------------------------------------------

function texture(
  ctx: CanvasRenderingContext2D,
  kind: MaterialKind,
  len: number,
  h: number,
  base: Hsl,
  level: number,
  grain: number,
  seed: number,
): void {
  if (grain <= 0.02) return;
  const dark = css(lit({ ...base, l: base.l * 0.82 }, level), 0.55 * grain);
  const pale = css(lit({ ...base, l: Math.min(96, base.l * 1.18) }, level), 0.4 * grain);
  switch (kind) {
    case 'brick': {
      // courses every ~3.2px with a half-brick offset each row
      const course = 3.2;
      ctx.fillStyle = dark;
      for (let v = course; v < h; v += course) ctx.fillRect(0, v, 1, 0.5);
      const perRow = Math.max(3, Math.round(len / 5));
      for (let v = 0, row = 0; v < h; v += course, row++) {
        for (let k = 0; k < perRow; k++) {
          const r = hash2(k, row, seed);
          if (r > 0.86) {
            ctx.fillStyle = r > 0.94 ? pale : dark;
            ctx.fillRect((k + (row % 2) * 0.5) / perRow, v + 0.5, 0.9 / perRow, course - 1);
          }
        }
      }
      break;
    }
    case 'concrete': {
      // precast panel joints, plus vertical weather streaks below them
      const panels = Math.max(2, Math.round(len / 11));
      ctx.fillStyle = dark;
      for (let k = 1; k < panels; k++) ctx.fillRect(k / panels - 0.0015, 0, 0.003, h);
      for (let v = 8; v < h; v += 9) ctx.fillRect(0, v, 1, 0.4);
      ctx.fillStyle = css(lit({ ...base, l: base.l * 0.9 }, level), 0.16 * grain);
      for (let k = 0; k < panels; k++) {
        if (hash2(k, 7, seed) < 0.6) continue;
        ctx.fillRect((k + 0.3) / panels, 0, 0.5 / panels, h);
      }
      break;
    }
    case 'timber': {
      ctx.fillStyle = dark;
      for (let v = 2.4; v < h; v += 2.4) ctx.fillRect(0, v, 1, 0.35);
      break;
    }
    case 'stone': {
      const blocks = Math.max(2, Math.round(len / 7));
      ctx.fillStyle = dark;
      for (let v = 0, row = 0; v < h; v += 4.5, row++) {
        ctx.fillRect(0, v, 1, 0.5);
        for (let k = 1; k < blocks; k++) {
          ctx.fillRect((k + (row % 2) * 0.5) / blocks, v, 0.004, 4.5);
        }
      }
      break;
    }
    case 'metal': {
      const ribs = Math.max(4, Math.round(len / 3.5));
      ctx.fillStyle = dark;
      for (let k = 1; k < ribs; k++) ctx.fillRect(k / ribs, 0, 0.4 / ribs, h);
      break;
    }
    case 'render': {
      // faint mottling — a dusting so the flat fill isn't dead. Kept low
      // contrast on purpose: at close zoom anything stronger reads as damage.
      ctx.fillStyle = css(lit({ ...base, l: base.l * 0.9 }, level), 0.16 * grain);
      const n = Math.round(len * 0.3);
      for (let k = 0; k < n; k++) {
        const u = hash2(k, 3, seed);
        const v = hash2(k, 11, seed) * h;
        if (fbm(u * 6, v * 0.4, seed, 2) < 0.58) continue;
        ctx.fillRect(u - 0.02, v, 0.04, 2.2);
      }
      break;
    }
    case 'glass': {
      // spandrels: the opaque band between floors, a shade off the glazing
      ctx.fillStyle = css(lit({ ...base, l: base.l * 0.86 }, level), 0.5);
      for (let v = 0; v < h; v += 7) ctx.fillRect(0, v, 1, 1.1);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------

export type WindowPattern = 'punched' | 'ribbon' | 'curtain' | 'none';

export interface WindowPlan {
  pattern: WindowPattern;
  /** Floor-to-floor height in screen px. */
  floor: number;
  /** Horizontal spacing of window bays, screen px. */
  bay: number;
}

/** Floor heights by how tall the mass is: cottages get big windows, towers small. */
export function windowPlan(pattern: WindowPattern, h: number): WindowPlan {
  if (h < 22) return { pattern, floor: 8.5, bay: 8 };
  if (h < 46) return { pattern, floor: 8, bay: 7.5 };
  if (h < 90) return { pattern, floor: 7.2, bay: 7 };
  return { pattern, floor: 6.6, bay: 6.6 };
}

/**
 * Punch a wall's windows. Called inside wall space. `glow` paints only the
 * lit panes on transparent black, for the night overlay sprite.
 */
function paintWindows(
  ctx: CanvasRenderingContext2D,
  len: number,
  h: number,
  mat: Material,
  plan: WindowPlan,
  level: number,
  seed: number,
  glow: boolean,
  occupied: boolean,
  base = 0,
): void {
  if (plan.pattern === 'none' || h < 9) return;
  const cols = Math.max(1, Math.round(len / plan.bay));
  const rows = Math.max(1, Math.floor((h - 4.5 - base) / plan.floor));
  if (rows < 1) return;
  const wU = (plan.pattern === 'curtain' ? 0.78 : 0.5) / cols;
  const wH = plan.pattern === 'ribbon' ? plan.floor * 0.4 : plan.floor * 0.52;
  const glassDay = css(lit(mat.glass, level * 0.95));
  const sill = css(lit(mat.trim, level));
  const head = css(lit({ ...mat.body, l: mat.body.l * 0.6 }, level), 0.55);

  for (let r = 0; r < rows; r++) {
    const v = base + 4 + r * plan.floor;
    if (v + wH > h - 1.5) break;
    if (plan.pattern === 'ribbon') {
      // a continuous band, mullions dropped in over it
      if (!glow) {
        ctx.fillStyle = glassDay;
        ctx.fillRect(0.06, v, 0.88, wH);
        ctx.fillStyle = head;
        ctx.fillRect(0.06, v + wH - 0.5, 0.88, 0.5);
      }
      for (let c = 0; c < cols; c++) {
        const u = 0.06 + (0.88 * (c + 0.5)) / cols;
        const on = hash2(c, r, seed) > 0.52;
        if (glow) {
          if (!on || !occupied) continue;
          ctx.fillStyle = css(hash2(c, r, seed + 5) > 0.6 ? OFFICE_LAMP : LAMP, 0.95);
          ctx.fillRect(u - wU * 0.45, v + 0.4, wU * 0.9, wH - 0.8);
        } else {
          ctx.fillStyle = sill;
          ctx.fillRect(u + wU * 0.5, v, 0.006, wH);
        }
      }
      continue;
    }
    for (let c = 0; c < cols; c++) {
      const u = (c + 0.5) / cols - wU / 2;
      const on = hash2(c * 3 + 1, r * 7 + 2, seed) > (plan.pattern === 'curtain' ? 0.42 : 0.55);
      if (glow) {
        if (!on || !occupied) continue;
        ctx.fillStyle = css(hash2(c, r, seed + 5) > 0.62 ? OFFICE_LAMP : LAMP, 0.95);
        ctx.fillRect(u + wU * 0.08, v + 0.5, wU * 0.84, wH - 1);
        continue;
      }
      ctx.fillStyle = glassDay;
      ctx.fillRect(u, v, wU, wH);
      // a dark head reveal: the depth cue that stops windows reading as decals
      ctx.fillStyle = head;
      ctx.fillRect(u, v + wH - 0.7, wU, 0.7);
      if (plan.pattern === 'punched' && wU * len > 3.2) {
        ctx.fillStyle = sill;
        ctx.fillRect(u - 0.15 / cols, v - 0.5, wU + 0.3 / cols, 0.5);
      }
    }
  }
}

/**
 * Everything on a wall that isn't the wall or its windows. Drawn in wall
 * space, so each piece is a handful of rectangles; `front` is true only for
 * the wall lowest on screen, which gets the pieces that belong to a street
 * frontage — the fire escape, the signage, the awnings.
 */
function facadeTrim(
  ctx: CanvasRenderingContext2D,
  len: number,
  h: number,
  mat: Material,
  level: number,
  seed: number,
  fac: Facade | undefined,
  podiumH: number,
  plan: WindowPlan | null,
  front: boolean,
): void {
  if (!fac) return;
  const trim = css(lit(mat.trim, level));
  const trimLit = css(lit(mat.trim, level * 1.12));
  const shade = 'rgba(14, 18, 28, 0.35)';
  const floor = plan?.floor ?? 8;

  if (fac.pilasters) {
    // piers between the window bays, with a shadow down their right side
    const bays = Math.max(2, Math.round(len / (plan?.bay ?? 7)));
    for (let k = 0; k <= bays; k++) {
      const u = k / bays;
      ctx.fillStyle = css(lit(mat.body, level * 1.09));
      ctx.fillRect(u - 1.1 / len, podiumH, 2.2 / len, h - podiumH - 1);
      ctx.fillStyle = shade;
      ctx.fillRect(u + 1.1 / len, podiumH, 0.8 / len, h - podiumH - 1);
    }
  }

  if (fac.stringCourse) {
    const every = fac.stringCourse * floor;
    for (let v = podiumH + every; v < h - 2; v += every) {
      ctx.fillStyle = trimLit;
      ctx.fillRect(0, v, 1, 1.1);
      ctx.fillStyle = shade;
      ctx.fillRect(0, v - 0.8, 1, 0.8);
    }
  }

  if (fac.bays) {
    // shallow projecting bays: a lit left cheek, a shaded right one
    const bays = Math.max(1, Math.round(len / 14));
    for (let k = 0; k < bays; k++) {
      const u = (k + 0.5) / bays;
      const w = 5.5 / len;
      ctx.fillStyle = css(lit(mat.body, level * 1.14));
      ctx.fillRect(u - w, podiumH + 1, w * 0.34, h - podiumH - 4);
      ctx.fillStyle = shade;
      ctx.fillRect(u + w * 0.66, podiumH + 1, w * 0.34, h - podiumH - 4);
    }
  }

  if (fac.balconies) {
    // a projecting slab and a rail per floor, skipping the podium
    for (let v = podiumH + floor; v < h - floor * 0.6; v += floor) {
      ctx.fillStyle = shade;
      ctx.fillRect(0.08, v - 1.4, 0.84, 1.4);
      ctx.fillStyle = trimLit;
      ctx.fillRect(0.08, v - 2.2, 0.84, 0.9);
      ctx.fillStyle = css(lit(mat.trim, level * 0.85), 0.75);
      ctx.fillRect(0.08, v - 2.2, 0.84, 2.6);
      // a few balconies carry something: a rail infill panel
      if (hash2(Math.round(v), 3, seed) > 0.55) {
        ctx.fillStyle = css(lit(mat.body, level * 0.8), 0.6);
        ctx.fillRect(0.12, v - 2, 0.3, 2);
      }
    }
  }

  if (fac.acUnits) {
    const cols = Math.max(2, Math.round(len / (plan?.bay ?? 7)));
    for (let v = podiumH + floor * 0.55; v < h - 3; v += floor) {
      for (let c = 0; c < cols; c++) {
        if (hash2(c, Math.round(v), seed) < 0.55) continue;
        const u = (c + 0.5) / cols;
        ctx.fillStyle = css(lit({ h: 40, s: 6, l: 72 }, level));
        ctx.fillRect(u + 1.4 / len, v, 3.4 / len, 2.6);
        ctx.fillStyle = shade;
        ctx.fillRect(u + 1.4 / len, v + 2.6, 3.4 / len, 0.7);
      }
    }
  }

  if (front && fac.fireEscape && h > 20) {
    // landings, a rail above each, uprights between them, and a drop ladder
    const w = Math.min(0.46, 18 / len);
    const u0 = 0.5 - w / 2;
    const iron = 'rgba(26, 22, 20, 0.92)';
    const rail = 'rgba(26, 22, 20, 0.55)';
    for (let v = podiumH + floor; v < h - 3; v += floor) {
      ctx.fillStyle = iron;
      ctx.fillRect(u0, v - 0.4, w, 1.3); // landing deck
      ctx.fillStyle = rail;
      ctx.fillRect(u0, v + 0.9, w, 2.6); // the railing above it
      ctx.fillStyle = iron;
      ctx.fillRect(u0, v + 3.2, w, 0.7); // top rail
      ctx.fillRect(u0 - 0.6 / len, v - 0.4, 1.2 / len, floor); // uprights
      ctx.fillRect(u0 + w - 0.6 / len, v - 0.4, 1.2 / len, floor);
      // the flight down to the next landing
      ctx.fillStyle = rail;
      ctx.fillRect(u0 + w * 0.55, v - floor + 1, w * 0.42, floor - 1.4);
    }
    ctx.fillStyle = iron;
    ctx.fillRect(u0 + w * 0.42, 0, 1.4 / len, podiumH + floor);
  }

  if (front && fac.signBoards && h > 14) {
    // boards hung over the street, the way a dense shopping street works
    for (let k = 0; k < 3; k++) {
      const v = podiumH + 2 + k * floor * 1.4;
      if (v > h - 6) break;
      if (hash2(k, 7, seed) < 0.35) continue;
      const u = 0.12 + hash2(k, 9, seed) * 0.6;
      const hue = Math.floor(hash2(k, 11, seed) * 360);
      ctx.fillStyle = `hsl(${hue} 62% 46%)`;
      ctx.fillRect(u, v, Math.min(0.3, 12 / len), 4.4);
      ctx.fillStyle = 'rgba(250, 250, 244, 0.85)';
      ctx.fillRect(u + 0.4 / len, v + 0.8, Math.min(0.3, 12 / len) - 0.8 / len, 0.7);
      ctx.fillRect(u + 0.4 / len, v + 2.4, Math.min(0.3, 12 / len) - 0.8 / len, 0.7);
    }
  }

  if (fac.cornice) {
    // the moulding where wall meets sky: a lit top, a shadow under it
    ctx.fillStyle = shade;
    ctx.fillRect(0, h - 3.4, 1, 1.2);
    ctx.fillStyle = trim;
    ctx.fillRect(-0.01, h - 2.6, 1.02, 2);
    ctx.fillStyle = trimLit;
    ctx.fillRect(-0.01, h - 0.9, 1.02, 0.9);
  }
}

// ---------------------------------------------------------------------------
// The prism
// ---------------------------------------------------------------------------

/**
 * Facade dressing. These are what separate a brick walk-up from a curtain-wall
 * office at the same height and colour, and they are all rectangles in wall
 * space — a few `fillRect`s each, baked once.
 */
export interface Facade {
  /** A projecting moulding where the wall meets the roof. */
  cornice?: boolean;
  /** A projecting band every N floors. */
  stringCourse?: number;
  /** Ground floors treated as a retail/lobby base: taller glazing, own trim. */
  podium?: number;
  /** Projecting slab balconies on every floor above the podium. */
  balconies?: boolean;
  /** A zig-zag iron fire escape down the front wall. */
  fireEscape?: boolean;
  /** Vertical piers between window bays — offices and civic blocks. */
  pilasters?: boolean;
  /** Wall-mounted air conditioners, the mark of a dense hot-climate block. */
  acUnits?: boolean;
  /** Projecting signage boards over the street. */
  signBoards?: boolean;
  /** Bay windows: a shallow projection carrying the window bay outward. */
  bays?: boolean;
}

export interface PrismOptions {
  /** Window treatment; omit for blank walls. */
  windows?: WindowPattern;
  /** Stable seed so the same lot bakes the same picture. */
  seed?: number;
  /** Set while baking the night overlay: only lit windows are drawn. */
  glow?: boolean;
  /** False for an abandoned lot — nobody is home, so nothing lights up. */
  occupied?: boolean;
  /** Skip the roof cap (a taller mass sits on top of this one). */
  noRoof?: boolean;
  /** Roof material override; defaults to a membrane grey over the body hue. */
  roofColor?: Hsl;
  /** Ambient occlusion where the walls meet the ground. */
  groundAo?: boolean;
  /** Facade dressing; the front wall gets the street-facing pieces. */
  facade?: Facade;
}

/**
 * Paint a prism of height `h` standing on `foot`. Any convex footprint works,
 * not just a diamond: an edge is camera-facing exactly when it runs right to
 * left on screen, which is what lets chamfered and slab plans go through the
 * same painter. Returns the wall base edges and the lifted roof outline so
 * callers can hang detail off them.
 */
export function prism(
  ctx: CanvasRenderingContext2D,
  foot: Pt[],
  h: number,
  mat: Material,
  opts: PrismOptions = {},
): PrismResult {
  const seed = opts.seed ?? 1;
  const glow = opts.glow ?? false;
  const occupied = opts.occupied ?? true;
  const walls: [Pt, Pt][] = [];
  const levels: number[] = [];
  for (let i = 0; i < foot.length; i++) {
    const a = foot[i];
    const b = foot[(i + 1) % foot.length];
    if (b[0] - a[0] >= -1e-9) continue; // back face, or an edge-on sliver
    walls.push([a, b]);
    levels.push(wallLight(a[0], a[1], b[0], b[1]));
  }
  // the front wall — the one lowest on screen — carries the street-level trim
  let front = -1;
  let frontY = -Infinity;
  for (let i = 0; i < walls.length; i++) {
    const y = walls[i][0][1] + walls[i][1][1];
    if (y > frontY) {
      frontY = y;
      front = i;
    }
  }
  const plan = opts.windows ? windowPlan(opts.windows, h) : null;

  for (let i = 0; i < walls.length; i++) {
    const [a, b] = walls[i];
    const level = levels[i];
    const fac = opts.facade;
    inWallSpace(ctx, a, b, h, (wctx, len) => {
      if (!glow) {
        // body with a vertical falloff: sky light at the parapet, bounced
        // ground light at the base, a trough of shade between
        const g = wctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, css(lit(mat.body, level * 0.93)));
        g.addColorStop(0.22, css(lit(mat.body, level * 0.985)));
        g.addColorStop(1, css(lit(mat.body, level * (1 + mat.sheen * 0.22))));
        wctx.fillStyle = g;
        wctx.fillRect(0, 0, 1, h);
        texture(wctx, mat.kind, len, h, mat.body, level, mat.grain, seed + i * 31);
        if (mat.sheen > 0.3) {
          // sky reflection down a glass or metal skin
          const s = wctx.createLinearGradient(0, h, 0, 0);
          s.addColorStop(0, `rgba(198, 226, 246, ${0.34 * mat.sheen})`);
          s.addColorStop(0.45, `rgba(150, 186, 214, ${0.12 * mat.sheen})`);
          s.addColorStop(1, 'rgba(90, 120, 150, 0)');
          wctx.fillStyle = s;
          wctx.fillRect(0, 0, 1, h);
        }
      }
      const podium = fac?.podium ? Math.min(fac.podium, Math.floor(h / (plan?.floor ?? 8))) : 0;
      const podiumH = podium ? 4 + podium * (plan?.floor ?? 8) : 0;
      if (!glow && podiumH > 0) {
        // a retail/lobby base: taller glazing behind its own trim frame
        wctx.fillStyle = css(lit(mat.glass, level * 1.15));
        wctx.fillRect(0.04, 2, 0.92, podiumH - 3);
        wctx.fillStyle = css(lit(mat.trim, level));
        wctx.fillRect(0, 0, 1, 2);
        wctx.fillRect(0, podiumH - 1.2, 1, 1.6);
        const bays = Math.max(2, Math.round(len / 9));
        for (let k = 1; k < bays; k++) wctx.fillRect(k / bays - 0.004, 2, 0.008, podiumH - 3);
      }
      if (plan) {
        paintWindows(wctx, len, h, mat, plan, level, seed + i * 17, glow, occupied, podiumH);
      }
      if (!glow) facadeTrim(wctx, len, h, mat, level, seed + i * 23, fac, podiumH, plan, i === front);
      if (!glow && opts.groundAo !== false && h > 6) {
        const ao = wctx.createLinearGradient(0, 0, 0, Math.min(9, h * 0.4));
        ao.addColorStop(0, 'rgba(16, 20, 32, 0.34)');
        ao.addColorStop(1, 'rgba(16, 20, 32, 0)');
        wctx.fillStyle = ao;
        wctx.fillRect(0, 0, 1, Math.min(9, h * 0.4));
      }
    });
  }

  const roof = raise(foot, h);
  if (!opts.noRoof && !glow) {
    const roofBase = opts.roofColor ?? roofTone(mat);
    fill(ctx, roof, css(lit(roofBase, LIGHT.roof)));
    // gravel/membrane speckle so a big roof isn't a flat plate
    const [cx, cy] = centre(roof);
    let hw = 0;
    let hh = 0;
    for (const [x, y] of roof) {
      hw = Math.max(hw, Math.abs(x - cx));
      hh = Math.max(hh, Math.abs(y - cy));
    }
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(roof[0][0], roof[0][1]);
    for (let i = 1; i < roof.length; i++) ctx.lineTo(roof[i][0], roof[i][1]);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = css(lit(roofBase, LIGHT.roof * 0.86), 0.5);
    const n = Math.min(90, Math.round(hw * hh * 0.05));
    for (let k = 0; k < n; k++) {
      const u = hash2(k, 1, seed) * 2 - 1;
      const v = hash2(k, 2, seed) * 2 - 1;
      if (Math.abs(u) + Math.abs(v) > 0.94) continue;
      ctx.fillRect(cx + u * hw, cy + v * hh, 1.2, 1.2);
    }
    ctx.restore();
  }
  return { walls, roof };
}

/** Roof deck colour for a wall material — dark membrane over the body hue. */
export function roofTone(mat: Material): Hsl {
  return mix(mat.body, { h: 220, s: 6, l: 34 }, mat.kind === 'glass' ? 0.5 : 0.62);
}

/**
 * A raised parapet lip around a flat roof — the silhouette cue that says
 * "this is a building" rather than "this is a box". Only the rim rises: the
 * deck inside keeps the roof's own colour, so it reads as a wall around a
 * roof rather than a tray with something in it.
 */
export function parapet(
  ctx: CanvasRenderingContext2D,
  roof: Pt[],
  mat: Material,
  height = 1.8,
  deck?: Hsl,
): void {
  const cap = raise(roof, height);
  // the visible outer faces of the lip
  for (let i = 0; i < roof.length; i++) {
    const a = roof[i];
    const b = roof[(i + 1) % roof.length];
    if (b[0] - a[0] >= -1e-9) continue;
    fill(ctx, [a, b, cap[(i + 1) % roof.length], cap[i]], css(lit(mat.trim, wallLight(a[0], a[1], b[0], b[1]))));
  }
  fill(ctx, cap, css(lit(mat.trim, LIGHT.roof * 0.98)));
  // the deck seen over the rim, back where the roof surface already was
  fill(ctx, inset(cap, 0.86), css(lit(deck ?? roofTone(mat), LIGHT.roof * 0.94)));
}

/** Ground contact shadow: a soft dark pool hugging the footprint, drawn under
 * everything so a mass never looks pasted onto the grass. */
export function contactShadow(ctx: CanvasRenderingContext2D, foot: Quad, strength = 1): void {
  fill(ctx, inset(foot, 1.16), `rgba(24, 28, 44, ${0.13 * strength})`);
  fill(ctx, inset(foot, 1.05), `rgba(24, 28, 44, ${0.16 * strength})`);
}

/**
 * The long shadow a mass throws across the ground. Drawn in its own pass,
 * before any building, so a tower's shadow lands on the street in front of it
 * instead of being overpainted by the next row of tiles.
 */
export function castShadow(
  ctx: CanvasRenderingContext2D,
  foot: Quad,
  h: number,
  alpha = 0.3,
): void {
  if (h <= 1) return;
  const quad = shadowQuad(foot, h);
  fill(ctx, quad, `rgba(28, 32, 58, ${alpha})`);
}

/** Re-export so callers don't have to reach into two modules for one shape. */
export { material, css, lit, mix };
export type { Material, Hsl, MaterialKind };
