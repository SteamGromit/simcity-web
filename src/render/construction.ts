/**
 * A lot that just grew is a building site. Stage 1 and 2 for their first
 * three months: a timber frame and a scaffold with green mesh on the street
 * face. Stage 3 and up for five: a concrete frame to a third of the final
 * height, hoarding along the street edge, a skip, and a tower crane for
 * stage 5 and up. The threshold rule is pure; the painting is canvas.
 */

import type { Stage } from '../sim/types';
import { TILE_H, TILE_W } from './iso';
import { css, diamond, fill, lit, material, prism, type Hsl } from './massing';
import { hsl } from './palette';
import { frontWallFor } from './frontage';
import { LIGHT, wallLight, type Pt } from './sun';

export type BuildState = 0 | 1 | 2;

/** 0 finished; 1 a frame and scaffold (stage 1–2, grew < 3); 2 a concrete frame (stage ≥ 3, grew < 5). */
export function buildStateFor(stage: Stage, grew: number): BuildState {
  if (stage <= 0) return 0;
  if (stage >= 3) return grew < 5 ? 2 : 0;
  return grew < 3 ? 1 : 0;
}

const TIMBER = hsl(34, 42, 58);
const CONCRETE = hsl(40, 6, 66);
const MESH = 'rgba(74, 168, 96, 0.38)';
const PLYWOOD = hsl(36, 44, 50);
const CRANE = hsl(48, 88, 54);

/** The tile diamond's edge on screen side `side` (0 N, 1 E, 2 S, 3 W). */
function tileEdge(side: number, size: number): [Pt, Pt] {
  const hw = (TILE_W * size) / 2;
  const hh = (TILE_H * size) / 2;
  const c: Pt[] = [[0, -hh], [hw, 0], [0, hh], [-hw, 0]];
  return [c[side], c[(side + 1) % 4]];
}

export interface SiteSpec {
  build: BuildState;
  stage: Stage;
  /** Screen side of the street, −1 none. */
  side: number;
  size: number;
  seed: number;
}

/** Paint the building site in place of the building. `plan` is the primary mass's projected footprint, `h` its finished height. */
export function paintConstruction(ctx: CanvasRenderingContext2D, spec: SiteSpec, plan: Pt[], h: number): void {
  const { build, stage, side, size, seed } = spec;
  // the slab
  fill(ctx, plan, css(lit(CONCRETE, LIGHT.roof * 0.96)));
  const walls: [Pt, Pt][] = [];
  for (let i = 0; i < plan.length; i++) {
    const a = plan[i];
    const b = plan[(i + 1) % plan.length];
    if (b[0] - a[0] < -1e-9) walls.push([a, b]);
  }
  const front = frontWallFor(walls, side);
  const frameH = build === 1 ? h * 0.55 : h / 3;

  for (let w = 0; w < walls.length; w++) {
    const [a, b] = walls[w];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const level = wallLight(a[0], a[1], b[0], b[1]);
    const at = (t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    if (build === 1) {
      // studs every few pixels, a plate along the top
      ctx.strokeStyle = css(lit(TIMBER, level));
      ctx.lineWidth = 0.9;
      const n = Math.max(2, Math.round(len / 3.2));
      for (let k = 0; k <= n; k++) {
        const p = at(k / n);
        ctx.beginPath();
        ctx.moveTo(p[0], p[1]);
        ctx.lineTo(p[0], p[1] - frameH);
        ctx.stroke();
      }
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1] - frameH);
      ctx.lineTo(b[0], b[1] - frameH);
      ctx.stroke();
      // a diagonal brace
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(at(0.5)[0], at(0.5)[1] - frameH);
      ctx.stroke();
    } else {
      // columns and floor slabs
      ctx.strokeStyle = css(lit(CONCRETE, level * 0.92));
      ctx.lineWidth = 1.6;
      const n = Math.max(2, Math.round(len / 6));
      for (let k = 0; k <= n; k++) {
        const p = at(k / n);
        ctx.beginPath();
        ctx.moveTo(p[0], p[1]);
        ctx.lineTo(p[0], p[1] - frameH);
        ctx.stroke();
      }
      const floors = Math.max(1, Math.round(frameH / 7));
      for (let f = 1; f <= floors; f++) {
        const y = (frameH * f) / floors;
        fill(ctx, [[a[0], a[1] - y], [b[0], b[1] - y], [b[0], b[1] - y - 1.4], [a[0], a[1] - y - 1.4]], css(lit(CONCRETE, level)));
      }
    }
    if (w === front && build === 1) {
      // scaffold with green mesh, standing a step out from the wall
      const nx = (b[1] - a[1]) / len;
      const ny = -(b[0] - a[0]) / len;
      const sx = ny < 0 ? -nx : nx;
      const sy = Math.abs(ny);
      const o = (p: Pt): Pt => [p[0] + sx * 2.2, p[1] + sy * 2.2];
      const oa = o(a);
      const ob = o(b);
      const top = frameH + 4;
      fill(ctx, [oa, ob, [ob[0], ob[1] - top], [oa[0], oa[1] - top]], MESH);
      ctx.strokeStyle = 'rgba(120, 124, 130, 0.9)';
      ctx.lineWidth = 0.8;
      const poles = Math.max(2, Math.round(len / 7));
      for (let k = 0; k <= poles; k++) {
        const p: Pt = [oa[0] + (ob[0] - oa[0]) * (k / poles), oa[1] + (ob[1] - oa[1]) * (k / poles)];
        ctx.beginPath();
        ctx.moveTo(p[0], p[1]);
        ctx.lineTo(p[0], p[1] - top);
        ctx.stroke();
      }
      for (const y of [top * 0.33, top * 0.66, top]) {
        ctx.beginPath();
        ctx.moveTo(oa[0], oa[1] - y);
        ctx.lineTo(ob[0], ob[1] - y);
        ctx.stroke();
      }
    }
  }

  if (build === 2) {
    // hoarding along the street edge of the lot, and a skip beside it
    const hs = side === 1 || side === 2 ? side : 2;
    const [e1, e2] = tileEdge(hs, size);
    const level = wallLight(e1[0], e1[1], e2[0], e2[1]);
    fill(ctx, [e1, e2, [e2[0], e2[1] - 3.2], [e1[0], e1[1] - 3.2]], css(lit(PLYWOOD, level)));
    ctx.strokeStyle = 'rgba(30, 24, 18, 0.5)';
    ctx.lineWidth = 0.5;
    for (let t = 0.1; t < 1; t += 0.15) {
      const p: Pt = [e1[0] + (e2[0] - e1[0]) * t, e1[1] + (e2[1] - e1[1]) * t];
      ctx.beginPath();
      ctx.moveTo(p[0], p[1]);
      ctx.lineTo(p[0], p[1] - 3.2);
      ctx.stroke();
    }
    const sk: Pt = [e1[0] + (e2[0] - e1[0]) * 0.8 - (hs === 2 ? -5 : 5), e1[1] + (e2[1] - e1[1]) * 0.8 - 4];
    prism(ctx, diamond(sk[0], sk[1], 4.2, 2.1), 3, material('metal', hsl(48, 60, 48)), { seed, groundAo: false });
    if (stage >= 5) {
      // a tower crane beside the frame: mast, jib toward the street, a hook
      const far = plan.reduce((m, p) => (p[1] < m[1] ? p : m), plan[0]);
      const mx = far[0] + 6;
      const my = far[1] + 3;
      const mastH = h * 0.55 + 18;
      ctx.strokeStyle = css(lit(CRANE, LIGHT.left));
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.lineTo(mx, my - mastH);
      ctx.stroke();
      ctx.lineWidth = 1.4;
      const jib = hs === 2 ? -30 : 30;
      ctx.beginPath();
      ctx.moveTo(mx - jib * 0.3, my - mastH + 1);
      ctx.lineTo(mx + jib, my - mastH + 1 + Math.abs(jib) * 0.18);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(40, 40, 44, 0.8)';
      ctx.lineWidth = 0.6;
      const hx = mx + jib * 0.7;
      const hy = my - mastH + 1 + Math.abs(jib) * 0.126;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx, hy + mastH * 0.45);
      ctx.stroke();
      ctx.fillStyle = css(lit(hsl(210, 8, 40), LIGHT.left));
      ctx.fillRect(hx - 1.5, hy + mastH * 0.45, 3, 2);
    }
  }
}

export type { Hsl };
