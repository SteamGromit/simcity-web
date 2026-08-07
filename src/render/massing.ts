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
import { LIGHT, Pt, shadowQuad } from './sun';

/** Footprint corners, north/east/south/west, clockwise on a y-down canvas. */
export type Quad = [Pt, Pt, Pt, Pt];

export interface PrismResult {
  /** The two camera-facing wall base edges, screen space. */
  walls: [Pt, Pt][];
  /** The roof outline after lifting. */
  roof: Quad;
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

/** Shrink a quad toward its centroid. */
export function inset(q: Quad, f: number): Quad {
  const cx = (q[0][0] + q[2][0]) / 2;
  const cy = (q[1][1] + q[3][1]) / 2;
  return q.map(([x, y]) => [cx + (x - cx) * f, cy + (y - cy) * f] as Pt) as Quad;
}

/** Move a quad by a screen offset. */
export function shift(q: Quad, dx: number, dy: number): Quad {
  return q.map(([x, y]) => [x + dx, y + dy] as Pt) as Quad;
}

/** Raise a quad by `h` screen pixels. */
export function raise(q: Quad, h: number): Quad {
  return q.map(([x, y]) => [x, y - h] as Pt) as Quad;
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
): void {
  if (plan.pattern === 'none' || h < 9) return;
  const cols = Math.max(1, Math.round(len / plan.bay));
  const rows = Math.max(1, Math.floor((h - 4.5) / plan.floor));
  if (rows < 1) return;
  const wU = (plan.pattern === 'curtain' ? 0.78 : 0.5) / cols;
  const wH = plan.pattern === 'ribbon' ? plan.floor * 0.4 : plan.floor * 0.52;
  const glassDay = css(lit(mat.glass, level * 0.95));
  const sill = css(lit(mat.trim, level));
  const head = css(lit({ ...mat.body, l: mat.body.l * 0.6 }, level), 0.55);

  for (let r = 0; r < rows; r++) {
    const v = 4 + r * plan.floor;
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

// ---------------------------------------------------------------------------
// The prism
// ---------------------------------------------------------------------------

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
}

/**
 * Paint a prism of height `h` standing on `foot`. Returns the wall base edges
 * and the lifted roof outline so callers can hang detail off them.
 */
export function prism(
  ctx: CanvasRenderingContext2D,
  foot: Quad,
  h: number,
  mat: Material,
  opts: PrismOptions = {},
): PrismResult {
  const seed = opts.seed ?? 1;
  const glow = opts.glow ?? false;
  const occupied = opts.occupied ?? true;
  const walls: [Pt, Pt][] = [
    [foot[1], foot[2]], // screen-right face, grid +x normal — turned from the sun
    [foot[2], foot[3]], // screen-left face, grid +y normal — catches it
  ];
  const levels = [LIGHT.right, LIGHT.left];
  const plan = opts.windows ? windowPlan(opts.windows, h) : null;

  for (let i = 0; i < walls.length; i++) {
    const [a, b] = walls[i];
    const level = levels[i];
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
      if (plan) paintWindows(wctx, len, h, mat, plan, level, seed + i * 17, glow, occupied);
      if (!glow && opts.groundAo !== false && h > 6) {
        const ao = wctx.createLinearGradient(0, 0, 0, Math.min(9, h * 0.4));
        ao.addColorStop(0, 'rgba(16, 20, 32, 0.34)');
        ao.addColorStop(1, 'rgba(16, 20, 32, 0)');
        wctx.fillStyle = ao;
        wctx.fillRect(0, 0, 1, Math.min(9, h * 0.4));
      }
    });
  }

  const roof = raise(foot, h) as Quad;
  if (!opts.noRoof && !glow) {
    const roofBase = opts.roofColor ?? roofTone(mat);
    fill(ctx, roof, css(lit(roofBase, LIGHT.roof)));
    // gravel/membrane speckle so a big roof isn't a flat plate
    const cx = (roof[0][0] + roof[2][0]) / 2;
    const cy = (roof[1][1] + roof[3][1]) / 2;
    const hw = roof[1][0] - cx;
    const hh = roof[2][1] - cy;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(roof[0][0], roof[0][1]);
    for (let i = 1; i < 4; i++) ctx.lineTo(roof[i][0], roof[i][1]);
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
  roof: Quad,
  mat: Material,
  height = 1.8,
  deck?: Hsl,
): void {
  const cap = raise(roof, height) as Quad;
  const rim = css(lit(mat.trim, LIGHT.roof * 0.98));
  // the two visible outer faces of the lip
  fill(ctx, [roof[1], roof[2], cap[2], cap[1]], css(lit(mat.trim, LIGHT.right)));
  fill(ctx, [roof[2], roof[3], cap[3], cap[2]], css(lit(mat.trim, LIGHT.left)));
  fill(ctx, cap, rim);
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
