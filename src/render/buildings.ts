import { Stage, Zone } from '../sim/types';
import { TILE_H, TILE_W } from './iso';

const HW = TILE_W / 2; // 32
const HH = TILE_H / 2; // 16

/** Heights (px) by zone and stage 1..3. */
const HEIGHTS: Partial<Record<Zone, number[]>> = {
  [Zone.Residential]: [0, 14, 26, 44],
  [Zone.Commercial]: [0, 16, 34, 58],
  [Zone.Industrial]: [0, 12, 22, 36],
};

/** Base wall colors [h, s, l] by zone and stage. */
const PALETTES: Partial<Record<Zone, [number, number, number][]>> = {
  [Zone.Residential]: [
    [0, 0, 0],
    [95, 30, 62], // small house, pale green
    [150, 25, 55], // rowhouse teal-green
    [205, 30, 52], // apartment slate-blue
  ],
  [Zone.Commercial]: [
    [0, 0, 0],
    [190, 35, 60], // shop
    [195, 45, 55], // office, glassy cyan
    [210, 40, 48], // tower
  ],
  [Zone.Industrial]: [
    [0, 0, 0],
    [35, 35, 55], // shed, ochre
    [25, 30, 48], // works, rust
    [20, 25, 42], // factory
  ],
};

function hsl(h: number, s: number, l: number): string {
  return `hsl(${h} ${s}% ${l}%)`;
}

/** Fill the ground diamond whose top corner sits at (sx, sy). */
export function diamond(ctx: CanvasRenderingContext2D, sx: number, sy: number, fill: string) {
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(sx + HW, sy + HH);
  ctx.lineTo(sx, sy + TILE_H);
  ctx.lineTo(sx - HW, sy + HH);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Pseudo-3D box on the tile at (sx, sy): footprint fraction f, height h. */
function box(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  f: number,
  h: number,
  hue: number,
  sat: number,
  lit: number,
) {
  const cx = sx;
  const cy = sy + HH; // diamond center
  const top = { x: cx, y: cy - HH * f };
  const right = { x: cx + HW * f, y: cy };
  const bottom = { x: cx, y: cy + HH * f };
  const left = { x: cx - HW * f, y: cy };

  // left face (darker)
  ctx.beginPath();
  ctx.moveTo(left.x, left.y);
  ctx.lineTo(bottom.x, bottom.y);
  ctx.lineTo(bottom.x, bottom.y - h);
  ctx.lineTo(left.x, left.y - h);
  ctx.closePath();
  ctx.fillStyle = hsl(hue, sat, lit * 0.62);
  ctx.fill();

  // right face (mid)
  ctx.beginPath();
  ctx.moveTo(bottom.x, bottom.y);
  ctx.lineTo(right.x, right.y);
  ctx.lineTo(right.x, right.y - h);
  ctx.lineTo(bottom.x, bottom.y - h);
  ctx.closePath();
  ctx.fillStyle = hsl(hue, sat, lit * 0.8);
  ctx.fill();

  // roof
  ctx.beginPath();
  ctx.moveTo(top.x, top.y - h);
  ctx.lineTo(right.x, right.y - h);
  ctx.lineTo(bottom.x, bottom.y - h);
  ctx.lineTo(left.x, left.y - h);
  ctx.closePath();
  ctx.fillStyle = hsl(hue, sat * 0.7, Math.min(90, lit * 1.12));
  ctx.fill();
}

function windows(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  f: number,
  h: number,
  lit: boolean,
) {
  const cy = sy + HH;
  const bottom = { x: sx, y: cy + HH * f };
  ctx.strokeStyle = lit ? 'rgba(255,240,160,0.55)' : 'rgba(20,20,30,0.45)';
  ctx.lineWidth = 1.5;
  for (let wy = 6; wy < h - 4; wy += 6) {
    ctx.beginPath();
    ctx.moveTo(bottom.x - HW * f * 0.8, bottom.y - wy - (HH * f * 0.8) / 2);
    ctx.lineTo(bottom.x, bottom.y - wy);
    ctx.lineTo(bottom.x + HW * f * 0.8, bottom.y - wy - (HH * f * 0.8) / 2);
    ctx.stroke();
  }
}

function smokestack(ctx: CanvasRenderingContext2D, sx: number, sy: number, h: number) {
  ctx.fillStyle = '#6b625c';
  ctx.fillRect(sx + 8, sy + HH - h - 16, 5, 16);
  ctx.fillStyle = '#544d48';
  ctx.fillRect(sx + 8, sy + HH - h - 16, 5, 3);
}

/** Zone tint for undeveloped zoned tiles. */
export const ZONE_TINT: Partial<Record<Zone, string>> = {
  [Zone.Residential]: 'rgba(60,200,80,0.30)',
  [Zone.Commercial]: 'rgba(70,130,255,0.30)',
  [Zone.Industrial]: 'rgba(235,200,60,0.30)',
};

export function drawBuilding(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  zone: Zone,
  stage: Stage,
  abandoned: boolean,
  powered: boolean,
  variant: number, // 0..1 stable per tile
) {
  if (zone === Zone.Park) {
    diamond(ctx, sx, sy, 'hsl(105 45% 42%)');
    for (const [dx, tdy] of [
      [-10, 0],
      [8, 5],
    ] as const) {
      const tx = sx + dx;
      const ty = sy + 10 + tdy;
      ctx.fillStyle = '#5d4534';
      ctx.fillRect(tx - 1, ty, 2, 6);
      ctx.beginPath();
      ctx.arc(tx, ty - 3, 5, 0, Math.PI * 2);
      ctx.fillStyle = 'hsl(120 45% 30%)';
      ctx.fill();
    }
    return;
  }

  if (zone === Zone.PowerPlant) {
    box(ctx, sx, sy, 0.85, 20, 15, 12, 38);
    smokestack(ctx, sx - 16, sy, 22);
    smokestack(ctx, sx - 4, sy, 26);
    return;
  }

  if (zone === Zone.PowerLine) {
    drawPole(ctx, sx, sy);
    return;
  }

  if (stage === 0) {
    const tint = ZONE_TINT[zone];
    if (tint) diamond(ctx, sx, sy, tint);
    if (!powered) drawNoPowerBolt(ctx, sx, sy + 2);
    return;
  }

  const h = (HEIGHTS[zone]?.[stage] ?? 12) * (0.92 + variant * 0.16);
  const f = 0.55 + stage * 0.1;
  let [hue, sat, lit] = PALETTES[zone]?.[stage] ?? [0, 0, 50];
  hue += Math.floor(variant * 24) - 12;

  if (abandoned) {
    sat = 6;
    lit = 32;
  }
  box(ctx, sx, sy, f, h, hue, sat, lit);
  if (stage >= 2 && zone !== Zone.Industrial) windows(ctx, sx, sy, f, h, !abandoned);
  if (zone === Zone.Industrial && stage >= 2 && !abandoned) smokestack(ctx, sx + 10, sy, h + 8);

  if (abandoned) {
    // boarded-up cross on the right face
    ctx.strokeStyle = 'rgba(30,25,20,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx + 4, sy + HH - h * 0.7);
    ctx.lineTo(sx + HW * f * 0.7, sy + HH - h * 0.2);
    ctx.moveTo(sx + HW * f * 0.7, sy + HH - h * 0.7);
    ctx.lineTo(sx + 4, sy + HH - h * 0.2);
    ctx.stroke();
  }

  if (!powered && !abandoned) {
    drawNoPowerBolt(ctx, sx, sy - h - 6);
  }
}

/** Utility pole glyph, used for power-line tiles and wires over roads. */
export function drawPole(ctx: CanvasRenderingContext2D, sx: number, sy: number) {
  ctx.strokeStyle = '#8a7f72';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sx, sy + TILE_H - 4);
  ctx.lineTo(sx, sy - 6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(sx - 8, sy - 2);
  ctx.lineTo(sx + 8, sy - 2);
  ctx.stroke();
}

/** Yellow "no power" bolt centered at (bx, by). */
export function drawNoPowerBolt(ctx: CanvasRenderingContext2D, bx: number, by: number) {
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.moveTo(bx + 2, by - 10);
  ctx.lineTo(bx - 3, by - 1);
  ctx.lineTo(bx + 0.5, by - 1);
  ctx.lineTo(bx - 2, by + 8);
  ctx.lineTo(bx + 4, by - 3);
  ctx.lineTo(bx + 0.5, by - 3);
  ctx.closePath();
  ctx.fill();
}
