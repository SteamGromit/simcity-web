/**
 * The eight landmarks, each a hand-authored composition on the pieces the
 * ordinary lots are built from: prisms, roof caps, drums. Drawn in sprite
 * space with the tile's ground centre at the origin.
 */

import { cutCorner, css, fill, lit, prism, raise, tileOffset, tileRect } from './massing';
import { hsl, material, type Hsl, type Material } from './palette';
import { roofCap } from './roofs';
import { LIGHT, wallLight, type Pt } from './sun';
import { letteringDashes } from './frontage';
import { channels } from './archetypes';
import type { SignatureKind } from './signature';

export interface SignatureSpec {
  kind: SignatureKind;
  /** Screen side of the street, −1 none. */
  side: number;
  seed: number;
  glow: boolean;
}

/** A material with a slate deck: the generic mix of a warm wall with the
 * roof grey lands on mauve, which the ordinary lots never see because their
 * swatches carry a deck colour of their own. */
function stone(kind: 'brick' | 'render' | 'concrete' | 'metal', body: Hsl, roof: Hsl = hsl(215, 8, 36)): Material {
  return { ...material(kind, body), roof };
}
/** Render or concrete with the slate deck. */
function stone_(body: Hsl, kind: 'render' | 'concrete' = 'render'): Material {
  return stone(kind, body);
}

/** A plan `2a × 2b` tile units centred `ox, oy` tile units from the lot centre. */
function plan(ox: number, oy: number, a: number, b: number): Pt[] {
  const c = tileOffset(ox, oy);
  return tileRect(c[0], c[1], a, b);
}

/** A cylinder standing on the ground at (cx, cy). */
function drum(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, h: number, body: Hsl): void {
  const g = ctx.createLinearGradient(cx - rx, 0, cx + rx, 0);
  g.addColorStop(0, css(lit(body, LIGHT.left * 0.92)));
  g.addColorStop(0.42, css(lit(body, LIGHT.left * 1.08)));
  g.addColorStop(1, css(lit(body, LIGHT.right * 0.9)));
  ctx.fillStyle = g;
  ctx.fillRect(cx - rx, cy - h, rx * 2, h);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI);
  ctx.fill();
  ctx.fillStyle = css(lit(body, LIGHT.roof));
  ctx.beginPath();
  ctx.ellipse(cx, cy - h, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** The visible walls of a footprint, lowest last. */
function visibleWalls(q: Pt[]): [Pt, Pt][] {
  const out: [Pt, Pt][] = [];
  for (let i = 0; i < q.length; i++) {
    const a = q[i];
    const b = q[(i + 1) % q.length];
    if (b[0] - a[0] < -1e-9) out.push([a, b]);
  }
  return out;
}

const alongX = (side: number) => side === 0 || side === 2 || side < 0;
/** Toward the street, in tile units along the perpendicular axis. */
const toward = (side: number) => (side === 1 || side === 2 ? 1 : -1);

export function paintSignature(ctx: CanvasRenderingContext2D, spec: SignatureSpec): void {
  const { kind, side, seed, glow } = spec;
  const ax = alongX(side);
  const tw = toward(side);
  const chan = channels(((seed % 97) + 0.5) / 97);
  switch (kind) {
    case 'church': {
      if (glow) return;
      const stone = stone_(hsl(38, 14, 72));
      const nave = ax ? plan(0, -tw * 0.04, 0.4, 0.19) : plan(-tw * 0.04, 0, 0.19, 0.4);
      const r = prism(ctx, nave, 22, stone, { seed, windows: 'punched', front: side });
      roofCap(ctx, r.roof, 'gabled', hsl(210, 12, 36), seed, stone, 0);
      // the tower at the street end, a spire on top
      const tower = ax ? plan(-0.3, tw * 0.17, 0.1, 0.1) : plan(tw * 0.17, -0.3, 0.1, 0.1);
      const t = prism(ctx, tower, 44, stone_(hsl(38, 16, 78)), { seed: seed + 1, windows: 'none' });
      // belfry louvres high on each visible wall, a string course under them
      for (const [a, b] of t.walls) {
        const level = wallLight(a[0], a[1], b[0], b[1]);
        const m = (u: number, dy: number): Pt => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u - dy];
        fill(ctx, [m(0.3, 33), m(0.7, 33), m(0.7, 40), m(0.3, 40)], css(lit(hsl(30, 10, 18), level)));
        fill(ctx, [m(0, 30), m(1, 30), m(1, 31.2), m(0, 31.2)], css(lit(hsl(38, 10, 60), level)));
      }
      const top = t.roof;
      const cx = (top[0][0] + top[2][0]) / 2;
      const cy = (top[1][1] + top[3][1]) / 2;
      fill(ctx, [top[3], top[2], [cx, cy - 26]], css(lit(hsl(210, 14, 34), LIGHT.left)));
      fill(ctx, [top[2], top[1], [cx, cy - 26]], css(lit(hsl(210, 14, 34), LIGHT.right)));
      ctx.strokeStyle = css(lit(hsl(44, 60, 70), LIGHT.roof));
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 26);
      ctx.lineTo(cx, cy - 31);
      ctx.moveTo(cx - 1.6, cy - 29.5);
      ctx.lineTo(cx + 1.6, cy - 29.5);
      ctx.stroke();
      // an arched door on the nave's front wall
      const walls = visibleWalls(nave);
      const w = walls[walls.length - 1];
      const d1: Pt = [w[0][0] + (w[1][0] - w[0][0]) * 0.44, w[0][1] + (w[1][1] - w[0][1]) * 0.44];
      const d2: Pt = [w[0][0] + (w[1][0] - w[0][0]) * 0.56, w[0][1] + (w[1][1] - w[0][1]) * 0.56];
      fill(ctx, [d1, d2, [d2[0], d2[1] - 7], [(d1[0] + d2[0]) / 2, (d1[1] + d2[1]) / 2 - 9], [d1[0], d1[1] - 7]], 'rgba(40, 28, 20, 0.9)');
      return;
    }
    case 'mansion': {
      if (glow) return;
      // a hedge round the grounds, a drive to the door, the house set back
      ctx.strokeStyle = css(lit(hsl(118, 34, 30), LIGHT.roof));
      ctx.lineWidth = 2.2;
      const ring = plan(0, 0, 0.46, 0.46);
      ctx.beginPath();
      ctx.moveTo(ring[0][0], ring[0][1] - 1);
      for (let i = 1; i <= 4; i++) ctx.lineTo(ring[i % 4][0], ring[i % 4][1] - 1);
      ctx.stroke();
      const house = ax ? plan(0, -tw * 0.12, 0.3, 0.22) : plan(-tw * 0.12, 0, 0.22, 0.3);
      const drive = ax ? plan(0, tw * 0.3, 0.05, 0.16) : plan(tw * 0.3, 0, 0.16, 0.05);
      fill(ctx, drive, 'rgba(214, 206, 190, 0.75)');
      const render = stone_(hsl(42, 30, 86));
      const r = prism(ctx, house, 24, render, { seed, windows: 'punched', front: side, facade: { cornice: true, pilasters: true } });
      roofCap(ctx, r.roof, 'hipped', hsl(28, 30, 40), seed, render, 0);
      // a portico over the door
      const w = r.walls[r.walls.length - 1];
      const p1: Pt = [w[0][0] + (w[1][0] - w[0][0]) * 0.36, w[0][1] + (w[1][1] - w[0][1]) * 0.36];
      const p2: Pt = [w[0][0] + (w[1][0] - w[0][0]) * 0.64, w[0][1] + (w[1][1] - w[0][1]) * 0.64];
      fill(ctx, [[p1[0], p1[1] - 9], [p2[0], p2[1] - 9], [p2[0], p2[1] + 2.5 - 9], [p1[0], p1[1] + 2.5 - 9]], css(lit(hsl(42, 20, 92), LIGHT.roof)));
      ctx.strokeStyle = css(lit(hsl(42, 20, 92), LIGHT.left));
      ctx.lineWidth = 1.2;
      for (const t of [0.38, 0.62]) {
        const p: Pt = [w[0][0] + (w[1][0] - w[0][0]) * t + 1.5, w[0][1] + (w[1][1] - w[0][1]) * t + 1.5];
        ctx.beginPath();
        ctx.moveTo(p[0], p[1]);
        ctx.lineTo(p[0], p[1] - 8);
        ctx.stroke();
      }
      return;
    }
    case 'pub': {
      const brick = stone('brick', hsl(14, 46, 38), hsl(20, 10, 30));
      let q = plan(0, 0, 0.38, 0.38);
      // the splay at the street corner: the corner nearest the viewer
      const v = q.reduce((m, p, i) => (p[1] > q[m][1] ? i : m), 0);
      q = cutCorner(q, v, 0.3);
      if (glow) {
        for (const [a, b] of visibleWalls(q)) {
          fill(ctx, [a, b, [b[0], b[1] - 6.5], [a[0], a[1] - 6.5]], 'rgba(255, 190, 110, 0.6)');
          fill(ctx, [[a[0], a[1] - 6.5], [b[0], b[1] - 6.5], [b[0], b[1] - 9.4], [a[0], a[1] - 9.4]], 'rgba(255, 198, 112, 0.85)');
        }
        return;
      }
      const r = prism(ctx, q, 20, brick, { seed, windows: 'punched', facade: { cornice: true, stringCourse: 1 } });
      roofCap(ctx, r.roof, 'parapet', brick.body, seed, brick, 0);
      const green = hsl(150, 34, 24);
      for (const [a, b] of r.walls) {
        const level = wallLight(a[0], a[1], b[0], b[1]);
        fill(ctx, [a, b, [b[0], b[1] - 6.5], [a[0], a[1] - 6.5]], css(lit({ ...brick.glass, l: brick.glass.l * 0.6 }, level)));
        fill(ctx, [[a[0], a[1] - 6.5], [b[0], b[1] - 6.5], [b[0], b[1] - 9.4], [a[0], a[1] - 9.4]], css(lit(green, level)));
        let u = 0.1;
        for (const d of letteringDashes(chan, 5)) {
          const p: Pt = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
          const q2: Pt = [a[0] + (b[0] - a[0]) * (u + d), a[1] + (b[1] - a[1]) * (u + d)];
          fill(ctx, [[p[0], p[1] - 7.4], [q2[0], q2[1] - 7.4], [q2[0], q2[1] - 8.5], [p[0], p[1] - 8.5]], 'rgba(248, 230, 160, 0.9)');
          u += d + 0.04;
        }
      }
      // the hanging sign on a bracket at the corner
      const c = q[v + 1] ?? q[v];
      ctx.strokeStyle = 'rgba(30, 26, 22, 0.9)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(c[0], c[1] - 14);
      ctx.lineTo(c[0] + 6, c[1] - 14);
      ctx.stroke();
      ctx.fillStyle = css(lit(green, LIGHT.left));
      ctx.fillRect(c[0] + 2.5, c[1] - 13.5, 4.5, 4);
      ctx.fillStyle = 'rgba(248, 230, 160, 0.9)';
      ctx.fillRect(c[0] + 3.3, c[1] - 12.4, 2.9, 1.2);
      return;
    }
    case 'clock': {
      if (glow) return;
      const stone = stone_(hsl(36, 16, 70), 'concrete');
      const hall = ax ? plan(0.12, -tw * 0.08, 0.3, 0.26) : plan(-tw * 0.08, 0.12, 0.26, 0.3);
      const hr = prism(ctx, hall, 16, stone, { seed, windows: 'punched', front: side, facade: { cornice: true, pilasters: true } });
      roofCap(ctx, hr.roof, 'parapet', stone.body, seed, stone, 0);
      const tower = ax ? plan(-0.26, tw * 0.1, 0.15, 0.15) : plan(tw * 0.1, -0.26, 0.15, 0.15);
      const t = prism(ctx, tower, 66, stone, { seed: seed + 3, windows: 'punched', facade: { stringCourse: 3 } });
      // a clock face high on each visible wall
      for (const [a, b] of t.walls) {
        const mx = (a[0] + b[0]) / 2;
        const my = (a[1] + b[1]) / 2 - 56;
        ctx.fillStyle = 'rgba(250, 246, 232, 0.95)';
        ctx.beginPath();
        ctx.ellipse(mx, my, 3.6, 3.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(30, 28, 26, 0.9)';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(mx, my);
        ctx.lineTo(mx, my - 2.8);
        ctx.moveTo(mx, my);
        ctx.lineTo(mx + 2, my + 0.8);
        ctx.stroke();
      }
      // a pyramid cap
      const top = t.roof;
      const cx = (top[0][0] + top[2][0]) / 2;
      const cy = (top[1][1] + top[3][1]) / 2;
      fill(ctx, [top[3], top[2], [cx, cy - 14]], css(lit(hsl(160, 22, 42), LIGHT.left)));
      fill(ctx, [top[2], top[1], [cx, cy - 14]], css(lit(hsl(160, 22, 42), LIGHT.right)));
      return;
    }
    case 'store': {
      const stone = stone_(hsl(40, 18, 80));
      const q = plan(0, 0, 0.45, 0.42);
      if (glow) {
        for (const [a, b] of visibleWalls(q)) fill(ctx, [a, b, [b[0], b[1] - 9], [a[0], a[1] - 9]], 'rgba(255, 220, 150, 0.7)');
        return;
      }
      const r = prism(ctx, q, 32, stone, { seed, windows: 'ribbon', front: side, facade: { cornice: true, podium: 1, pilasters: true } });
      roofCap(ctx, r.roof, 'parapet', stone.body, seed, stone, 0);
      // a glass canopy the length of the street face, out over the footway
      const walls = r.walls;
      const idx = side === 1 ? walls.reduce((m, w, i) => (w[0][0] + w[1][0] > walls[m][0][0] + walls[m][1][0] ? i : m), 0)
        : side === 2 ? walls.reduce((m, w, i) => (w[0][0] + w[1][0] < walls[m][0][0] + walls[m][1][0] ? i : m), 0)
        : walls.length - 1;
      const [a, b] = walls[idx];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      let nx = (b[1] - a[1]) / len;
      let ny = -(b[0] - a[0]) / len;
      if (ny < 0) {
        nx = -nx;
        ny = -ny;
      }
      const o = (p: Pt, d: number): Pt => [p[0] + nx * d, p[1] + ny * d];
      fill(ctx, [[a[0], a[1] - 11], [b[0], b[1] - 11], [o(b, 5.5)[0], o(b, 5.5)[1] - 9.6], [o(a, 5.5)[0], o(a, 5.5)[1] - 9.6]], 'rgba(170, 206, 230, 0.55)');
      ctx.strokeStyle = 'rgba(60, 70, 80, 0.8)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(o(a, 5.5)[0], o(a, 5.5)[1] - 9.6);
      ctx.lineTo(o(b, 5.5)[0], o(b, 5.5)[1] - 9.6);
      ctx.stroke();
      // the name across the fascia
      let u = 0.15;
      for (const d of letteringDashes(chan, 7)) {
        const p: Pt = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
        const q2: Pt = [a[0] + (b[0] - a[0]) * (u + d), a[1] + (b[1] - a[1]) * (u + d)];
        fill(ctx, [[p[0], p[1] - 12.4], [q2[0], q2[1] - 12.4], [q2[0], q2[1] - 14], [p[0], p[1] - 14]], css(lit(hsl(350, 60, 40), LIGHT.left)));
        u += d + 0.03;
      }
      return;
    }
    case 'gasholder': {
      if (glow) return;
      const rust = hsl(16, 40, 36);
      const steel = hsl(210, 8, 46);
      const rx = 22;
      const ry = 11;
      // the frame's back columns, the drum, then the front columns
      const cols = 8;
      const colAt = (k: number): Pt => [Math.cos((k / cols) * Math.PI * 2) * (rx + 3), Math.sin((k / cols) * Math.PI * 2) * (ry + 1.5) + 2];
      ctx.strokeStyle = css(lit(steel, LIGHT.left));
      ctx.lineWidth = 1.2;
      const stroke = (k: number) => {
        const p = colAt(k);
        ctx.beginPath();
        ctx.moveTo(p[0], p[1]);
        ctx.lineTo(p[0], p[1] - 40);
        ctx.stroke();
      };
      for (let k = 0; k < cols; k++) if (Math.sin((k / cols) * Math.PI * 2) < 0) stroke(k);
      drum(ctx, 0, 2, rx, ry, 28, rust);
      for (let k = 0; k < cols; k++) if (Math.sin((k / cols) * Math.PI * 2) >= 0) stroke(k);
      ctx.lineWidth = 0.7;
      for (const y of [14, 27, 40]) {
        ctx.beginPath();
        ctx.ellipse(0, 2 - y, rx + 3, ry + 1.5, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      return;
    }
    case 'silos': {
      if (glow) return;
      const steel = hsl(200, 8, 72);
      const n = 3;
      // three drums in a row along the street, back to front
      const centres: Pt[] = [];
      for (let k = 0; k < n; k++) {
        const o = (k - 1) * 0.27;
        const c = ax ? tileOffset(o, -tw * 0.1) : tileOffset(-tw * 0.1, o);
        centres.push(c);
      }
      centres.sort((p, q) => p[1] - q[1]);
      for (const [cx, cy] of centres) {
        drum(ctx, cx, cy, 7.5, 3.8, 36, steel);
        fill(ctx, [[cx - 7.5, cy - 36], [cx + 7.5, cy - 36], [cx, cy - 44]], css(lit(hsl(200, 8, 62), LIGHT.left)));
      }
      // a conveyor up to the last silo, and a shed at its foot
      const shed = ax ? plan(0.3, tw * 0.22, 0.12, 0.1) : plan(tw * 0.22, 0.3, 0.1, 0.12);
      const sr = prism(ctx, shed, 8, stone('metal', hsl(200, 6, 58), hsl(200, 6, 42)), { seed, windows: 'none' });
      roofCap(ctx, sr.roof, 'gabled', hsl(200, 6, 40), seed, undefined, 0);
      const last = centres[centres.length - 1];
      const foot = tileOffset(ax ? 0.3 : tw * 0.22, ax ? tw * 0.22 : 0.3);
      ctx.strokeStyle = css(lit(hsl(200, 8, 40), LIGHT.left));
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(foot[0], foot[1] - 6);
      ctx.lineTo(last[0] + 4, last[1] - 42);
      ctx.stroke();
      return;
    }
    case 'chimney': {
      if (glow) return;
      const brick = stone('brick', hsl(12, 40, 42), hsl(210, 6, 38));
      const shed = ax ? plan(0.04, 0, 0.4, 0.32) : plan(0, 0.04, 0.32, 0.4);
      const r = prism(ctx, shed, 15, brick, { seed, windows: 'punched', front: side });
      roofCap(ctx, r.roof, 'sawtooth', hsl(210, 6, 40), seed, brick, 0); // a neutral body: the shell is mixed from it, and brick through blue lands on mauve
      // a tapered stack at the back corner, banded, with a dark cap
      const base = ax ? tileOffset(-0.36, -tw * 0.36) : tileOffset(-tw * 0.36, -0.36);
      const bx = base[0];
      const by = base[1];
      const H = 60;
      fill(ctx, [[bx - 4, by], [bx, by + 2], [bx, by - H + 1.4], [bx - 2.2, by - H]], css(lit(brick.body, LIGHT.left)));
      fill(ctx, [[bx, by + 2], [bx + 4, by], [bx + 2.2, by - H], [bx, by - H + 1.4]], css(lit(brick.body, LIGHT.right)));
      ctx.strokeStyle = 'rgba(40, 24, 18, 0.5)';
      ctx.lineWidth = 0.6;
      for (const y of [12, 30, 48]) {
        ctx.beginPath();
        ctx.moveTo(bx - 4 + (y / H) * 1.8, by - y);
        ctx.lineTo(bx + 4 - (y / H) * 1.8, by - y);
        ctx.stroke();
      }
      fill(ctx, [[bx - 3, by - H], [bx + 3, by - H], [bx + 3, by - H - 2.5], [bx - 3, by - H - 2.5]], css(lit(hsl(20, 10, 24), LIGHT.left)));
      void raise;
      return;
    }
  }
}
