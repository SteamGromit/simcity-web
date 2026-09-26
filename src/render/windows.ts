/**
 * Windows as objects.
 *
 * A window used to be one rectangle of glass colour with a one-pixel head
 * line. Here each pane has a frame, a reveal (a dark head and a lit jamb), a
 * sill, a sky reflection that brightens toward the top, and a state — clear,
 * blind, curtain, dark or lit by day — from the seed, so a facade reads as
 * lived in rather than printed. A curtain wall is a whole face of glass with a
 * reflected horizon and the dark bands of the buildings across the street.
 * All of it is rectangles in wall space, baked once.
 */

import { hash2 } from './noise';
import { LAMP, Material, OFFICE_LAMP, css, lit } from './palette';

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

export interface Pane {
  u: number;
  v: number;
  w: number;
  h: number;
  row: number;
  col: number;
}

/**
 * Pane rectangles in wall space (u 0..1 across, v px up). Empty when the wall
 * is under a floor tall — sheds and roof plant have no windows.
 */
export function windowGrid(len: number, h: number, plan: WindowPlan, base = 0): Pane[] {
  if (plan.pattern === 'none' || h < 9) return [];
  const cols = Math.max(1, Math.round(len / plan.bay));
  // at least one row on anything a storey tall: a starter house is 10–13 px
  // and must not go blind because a floor is nominally 8.5
  const rows = Math.max(1, Math.floor((h - 4.5 - base) / plan.floor));
  const wU = (plan.pattern === 'curtain' ? 0.86 : plan.pattern === 'ribbon' ? 0.8 : 0.5) / cols;
  const wH = Math.min(
    plan.pattern === 'ribbon'
      ? plan.floor * 0.42
      : plan.pattern === 'curtain'
        ? plan.floor * 0.78
        : plan.floor * 0.54,
    h - base - 5.5, // the first row has to fit under the roof line
  );
  if (wH < 2) return [];
  const out: Pane[] = [];
  for (let r = 0; r < rows; r++) {
    const v = base + 4 + r * plan.floor;
    if (v + wH > h - 1.5) break;
    for (let c = 0; c < cols; c++) {
      out.push({ u: (c + 0.5) / cols - wU / 2, v, w: wU, h: wH, row: r, col: c });
    }
  }
  return out;
}

export type PaneState = 'clear' | 'blind' | 'curtain' | 'dark' | 'lit';

/** What is behind a pane by day, from its position and the lot's seed. */
export function paneState(row: number, col: number, seed: number, pattern: WindowPattern): PaneState {
  const r = hash2(col * 3 + 1, row * 7 + 2, seed);
  if (pattern === 'curtain') return r > 0.7 ? 'lit' : r > 0.12 ? 'clear' : 'dark';
  if (r < 0.5) return 'clear';
  if (r < 0.7) return 'blind';
  if (r < 0.84) return 'curtain';
  if (r < 0.92) return 'dark';
  return 'lit';
}

/** Whether a pane glows after dark: lit-by-day panes always, clear ones by a
 * second roll — about 55% of a facade, which is what a city looks like. */
function glowsAtNight(state: PaneState, row: number, col: number, seed: number): boolean {
  if (state === 'dark') return false;
  if (state === 'lit') return true;
  return hash2(col, row, seed + 5) > 0.45;
}

/**
 * Paint a wall's windows. Called inside wall space. `glow` paints only the
 * lit panes on transparent black, for the night overlay sprite — no frames,
 * no reflections, nothing the `lighter` composite could whiten.
 */
export function paintWindows(
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
  const panes = windowGrid(len, h, plan, base);
  if (panes.length === 0) return;
  const px = 1 / len; // one screen pixel in u

  if (glow) {
    if (!occupied) return;
    for (const p of panes) {
      const st = paneState(p.row, p.col, seed, plan.pattern);
      if (!glowsAtNight(st, p.row, p.col, seed)) continue;
      const office = plan.pattern !== 'punched' || hash2(p.col, p.row, seed + 9) > 0.7;
      ctx.fillStyle = css(office ? OFFICE_LAMP : LAMP, st === 'curtain' ? 0.55 : 0.95);
      ctx.fillRect(p.u + px * 0.5, p.v + 0.5, p.w - px, p.h - 1);
    }
    return;
  }

  const glassTop = css(lit({ ...mat.glass, l: Math.min(92, mat.glass.l * 1.6 + 14) }, level));
  const glassBot = css(lit(mat.glass, level * 0.9));
  const frame = css(lit(mat.trim, level));
  const frameLit = css(lit(mat.trim, level * 1.15));
  const head = 'rgba(8, 10, 18, 0.62)';
  const jamb = 'rgba(255, 246, 230, 0.35)';
  const blind = css(lit({ ...mat.trim, l: Math.min(94, mat.trim.l + 10) }, level), 0.85);
  const curtain = css(lit({ h: 40, s: 18, l: 82 }, level), 0.8);
  const dark = css(lit({ ...mat.glass, l: mat.glass.l * 0.55 }, level));

  if (plan.pattern === 'curtain') {
    // one sheet of glass: a horizon reflection down the whole face, then
    // spandrels, the dark bands of neighbours, mullions, and a glint at the
    // sunlit edge
    const g = ctx.createLinearGradient(0, h, 0, 0);
    g.addColorStop(0, glassTop);
    g.addColorStop(0.55, css(lit(mat.glass, level * 1.05)));
    g.addColorStop(0.62, css(lit({ ...mat.glass, l: mat.glass.l * 0.8 }, level)));
    g.addColorStop(1, glassBot);
    ctx.fillStyle = g;
    ctx.fillRect(0, base, 1, h - base);
    const bands = 2 + Math.floor(hash2(1, 2, seed) * 3);
    for (let k = 0; k < bands; k++) {
      const u = hash2(k, 4, seed) * 0.8 + 0.05;
      const w = 0.05 + hash2(k, 6, seed) * 0.12;
      ctx.fillStyle = `rgba(10, 14, 28, ${(0.14 + hash2(k, 8, seed) * 0.12).toFixed(3)})`;
      ctx.fillRect(u, base, w, h - base);
    }
    ctx.fillStyle = css(lit(mat.trim, level * 0.9), 0.9);
    for (const p of panes) if (p.col === 0) ctx.fillRect(0, p.v + p.h, 1, plan.floor - p.h);
    const cols = Math.max(1, Math.round(len / plan.bay));
    ctx.fillStyle = css(lit(mat.trim, level * 1.05), 0.7);
    for (let c = 1; c < cols; c++) ctx.fillRect(c / cols - px * 0.35, base, px * 0.7, h - base);
    for (const p of panes) {
      const st = paneState(p.row, p.col, seed, plan.pattern);
      if (st === 'lit') {
        ctx.fillStyle = 'rgba(255, 250, 236, 0.16)';
        ctx.fillRect(p.u, p.v, p.w, p.h);
      } else if (st === 'dark') {
        ctx.fillStyle = 'rgba(8, 10, 20, 0.22)';
        ctx.fillRect(p.u, p.v, p.w, p.h);
      }
    }
    ctx.fillStyle = 'rgba(255, 252, 244, 0.22)';
    ctx.fillRect(level >= 1 ? 1 - px * 2.2 : 0, base, px * 2.2, h - base);
    return;
  }

  if (plan.pattern === 'ribbon') {
    for (const p of panes) {
      if (p.col === 0) {
        // the continuous band, once per row
        const g = ctx.createLinearGradient(0, p.v + p.h, 0, p.v);
        g.addColorStop(0, glassTop);
        g.addColorStop(1, glassBot);
        ctx.fillStyle = g;
        ctx.fillRect(0.05, p.v, 0.9, p.h);
        ctx.fillStyle = head;
        ctx.fillRect(0.05, p.v + p.h - 0.6, 0.9, 0.6);
        ctx.fillStyle = frame;
        ctx.fillRect(0.05, p.v - 0.6, 0.9, 0.6);
      }
      const st = paneState(p.row, p.col, seed, plan.pattern);
      if (st === 'blind') {
        ctx.fillStyle = blind;
        for (let y = p.v + 0.8; y < p.v + p.h - 0.4; y += 1.1) ctx.fillRect(p.u, y, p.w, 0.5);
      } else if (st === 'dark') {
        ctx.fillStyle = 'rgba(8, 10, 20, 0.3)';
        ctx.fillRect(p.u, p.v, p.w, p.h);
      }
      ctx.fillStyle = frame;
      ctx.fillRect(p.u + p.w + px * 0.2, p.v, px * 0.8, p.h);
    }
    return;
  }

  // punched: frame, reveal, sill, glass, state
  for (const p of panes) {
    const st = paneState(p.row, p.col, seed, plan.pattern);
    ctx.fillStyle = frame;
    ctx.fillRect(p.u - px * 0.8, p.v - 0.6, p.w + px * 1.6, p.h + 1.2);
    const g = ctx.createLinearGradient(0, p.v + p.h, 0, p.v);
    g.addColorStop(0, glassTop);
    g.addColorStop(1, st === 'dark' ? dark : glassBot);
    ctx.fillStyle = g;
    ctx.fillRect(p.u, p.v, p.w, p.h);
    if (st === 'blind') {
      ctx.fillStyle = blind;
      for (let y = p.v + 0.7; y < p.v + p.h - 0.3; y += 1.1) ctx.fillRect(p.u, y, p.w, 0.5);
    } else if (st === 'curtain') {
      ctx.fillStyle = curtain;
      ctx.fillRect(p.u, p.v, p.w * 0.38, p.h);
      ctx.fillRect(p.u + p.w * 0.62, p.v, p.w * 0.38, p.h);
    } else if (st === 'lit') {
      ctx.fillStyle = 'rgba(255, 244, 214, 0.35)';
      ctx.fillRect(p.u, p.v, p.w, p.h);
    }
    ctx.fillStyle = head;
    ctx.fillRect(p.u, p.v + p.h - 0.9, p.w, 0.9);
    ctx.fillStyle = jamb;
    ctx.fillRect(level >= 1 ? p.u : p.u + p.w - px * 0.6, p.v, px * 0.6, p.h);
    ctx.fillStyle = frameLit;
    ctx.fillRect(p.u - px * 1.1, p.v - 1.1, p.w + px * 2.2, 0.7);
    if (p.w * len > 4) {
      // a mullion cross once the pane is wide enough to carry one
      ctx.fillStyle = frame;
      ctx.fillRect(p.u + p.w / 2 - px * 0.3, p.v, px * 0.6, p.h);
      ctx.fillRect(p.u, p.v + p.h * 0.52, p.w, 0.5);
    }
  }
}
