import { Stage, Zone } from '../sim/types';
import { TileGeom } from './iso';

/** Heights (px) by zone and stage 1..7. */
const HEIGHTS: Partial<Record<Zone, number[]>> = {
  [Zone.Residential]: [0, 14, 26, 44, 60, 78, 96, 116],
  [Zone.Commercial]: [0, 16, 34, 58, 76, 96, 118, 142],
  [Zone.Industrial]: [0, 12, 22, 36, 48, 62, 78, 95],
};

/** Base wall colors [h, s, l] by zone and stage. */
const PALETTES: Partial<Record<Zone, [number, number, number][]>> = {
  [Zone.Residential]: [
    [0, 0, 0],
    [95, 30, 62], // small house, pale green
    [150, 25, 55], // rowhouse teal-green
    [205, 30, 52], // apartment slate-blue
    [212, 33, 49], // mid-rise
    [218, 36, 46], // block tower
    [224, 39, 43], // high-rise
    [230, 42, 40], // residential tower
  ],
  [Zone.Commercial]: [
    [0, 0, 0],
    [190, 35, 60], // shop
    [195, 45, 55], // office, glassy cyan
    [210, 40, 48], // tower
    [206, 46, 50], // glass mid-rise
    [211, 50, 46], // office slab
    [216, 53, 44], // corporate tower
    [221, 56, 42], // skyscraper
  ],
  [Zone.Industrial]: [
    [0, 0, 0],
    [35, 35, 55], // shed, ochre
    [25, 30, 48], // works, rust
    [20, 25, 42], // factory
    [18, 23, 40], // heavy works
    [15, 21, 38], // refinery block
    [12, 19, 36], // industrial complex
    [10, 17, 34], // mega-plant
  ],
};

function hsl(h: number, s: number, l: number): string {
  return `hsl(${h} ${s}% ${l}%)`;
}

function fillPoly(ctx: CanvasRenderingContext2D, pts: [number, number][], fill: string) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Fill the tile's ground quad. */
export function fillTile(ctx: CanvasRenderingContext2D, geom: TileGeom, fill: string) {
  fillPoly(ctx, geom.corners, fill);
}

export function strokeTile(
  ctx: CanvasRenderingContext2D,
  geom: TileGeom,
  stroke: string,
  width: number,
) {
  ctx.beginPath();
  ctx.moveTo(geom.corners[0][0], geom.corners[0][1]);
  for (let i = 1; i < 4; i++) ctx.lineTo(geom.corners[i][0], geom.corners[i][1]);
  ctx.closePath();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.stroke();
}

interface Face {
  a: [number, number]; // bottom corners of a visible wall
  b: [number, number];
  brightness: number; // 0..1 lighting factor
}

/**
 * Pseudo-3D box rising from the tile. Footprint is the ground quad inset
 * toward the center by fraction f. The corners run clockwise on screen at
 * every view angle, so a wall is camera-facing exactly when its projected
 * edge runs right-to-left (dx < 0); brightness follows the outward normal
 * so the "sun" stays screen-left at every rotation.
 */
function box(
  ctx: CanvasRenderingContext2D,
  geom: TileGeom,
  f: number,
  h: number,
  hue: number,
  sat: number,
  lit: number,
): Face[] {
  const foot: [number, number][] = geom.corners.map(([px, py]) => [
    geom.cx + (px - geom.cx) * f,
    geom.cy + (py - geom.cy) * f,
  ]);

  const faces: Face[] = [];
  for (let i = 0; i < 4; i++) {
    const a = foot[i];
    const b = foot[(i + 1) % 4];
    const dx = b[0] - a[0];
    if (dx >= -1e-9) continue; // back face (or edge-on sliver at axis angles)
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const brightness = 0.62 + 0.18 * (dy / len + 1) / 2;
    faces.push({ a, b, brightness });
    fillPoly(
      ctx,
      [a, b, [b[0], b[1] - h], [a[0], a[1] - h]],
      hsl(hue, sat, lit * brightness),
    );
  }

  fillPoly(
    ctx,
    foot.map(([px, py]) => [px, py - h] as [number, number]),
    hsl(hue, sat * 0.7, Math.min(90, lit * 1.12)),
  );
  return faces;
}

function windows(ctx: CanvasRenderingContext2D, faces: Face[], h: number, litUp: boolean) {
  ctx.strokeStyle = litUp ? 'rgba(255,240,160,0.55)' : 'rgba(20,20,30,0.45)';
  ctx.lineWidth = 1.5;
  for (const face of faces) {
    const ax = face.a[0] + (face.b[0] - face.a[0]) * 0.12;
    const ay = face.a[1] + (face.b[1] - face.a[1]) * 0.12;
    const bx = face.a[0] + (face.b[0] - face.a[0]) * 0.88;
    const by = face.a[1] + (face.b[1] - face.a[1]) * 0.88;
    for (let wy = 6; wy < h - 4; wy += 6) {
      ctx.beginPath();
      ctx.moveTo(ax, ay - wy);
      ctx.lineTo(bx, by - wy);
      ctx.stroke();
    }
  }
}

function smokestack(ctx: CanvasRenderingContext2D, cx: number, cy: number, h: number) {
  ctx.fillStyle = '#6b625c';
  ctx.fillRect(cx, cy - h - 16, 5, 16);
  ctx.fillStyle = '#544d48';
  ctx.fillRect(cx, cy - h - 16, 5, 3);
}

export function tree(ctx: CanvasRenderingContext2D, tx: number, ty: number) {
  ctx.fillStyle = '#5d4534';
  ctx.fillRect(tx - 1, ty, 2, 6);
  ctx.beginPath();
  ctx.arc(tx, ty - 3, 5, 0, Math.PI * 2);
  ctx.fillStyle = 'hsl(120 45% 30%)';
  ctx.fill();
}

/** Utility pole glyph, used for power-line tiles and wires over roads. */
export function drawPole(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.strokeStyle = '#8a7f72';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy + 12);
  ctx.lineTo(cx, cy - 22);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - 8, cy - 18);
  ctx.lineTo(cx + 8, cy - 18);
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

/** Zone tint for undeveloped zoned tiles. */
export const ZONE_TINT: Partial<Record<Zone, string>> = {
  [Zone.Residential]: 'rgba(60,200,80,0.30)',
  [Zone.Commercial]: 'rgba(70,130,255,0.30)',
  [Zone.Industrial]: 'rgba(235,200,60,0.30)',
};

export function drawBuilding(
  ctx: CanvasRenderingContext2D,
  geom: TileGeom,
  zone: Zone,
  stage: Stage,
  abandoned: boolean,
  powered: boolean,
  variant: number, // 0..1 stable per tile
) {
  const { cx, cy } = geom;

  if (zone === Zone.Park) {
    fillTile(ctx, geom, 'hsl(105 45% 42%)');
    tree(ctx, cx - 10, cy - 4);
    tree(ctx, cx + 8, cy + 1);
    return;
  }

  if (zone === Zone.PowerPlant) {
    box(ctx, geom, 0.85, 20, 15, 12, 38);
    smokestack(ctx, cx - 16, cy - 16, 22);
    smokestack(ctx, cx - 4, cy - 16, 26);
    return;
  }

  if (zone === Zone.PowerLine) {
    drawPole(ctx, cx, cy);
    return;
  }

  if (zone === Zone.FireStation || zone === Zone.PoliceStation || zone === Zone.School) {
    const style =
      zone === Zone.FireStation
        ? { h: 18, f: 0.8, hue: 2, sat: 62, lit: 46 }
        : zone === Zone.PoliceStation
          ? { h: 18, f: 0.8, hue: 215, sat: 45, lit: 44 }
          : { h: 12, f: 0.85, hue: 45, sat: 42, lit: 56 };
    const faces = box(ctx, geom, style.f, style.h, style.hue, style.sat, style.lit);
    // white service band across the visible walls
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    const bandY = style.h * 0.45;
    for (const face of faces) {
      ctx.beginPath();
      ctx.moveTo(face.a[0], face.a[1] - bandY);
      ctx.lineTo(face.b[0], face.b[1] - bandY);
      ctx.stroke();
    }
    if (zone === Zone.School) {
      ctx.strokeStyle = '#cfc8ba';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy - style.h - 14);
      ctx.lineTo(cx, cy - style.h);
      ctx.stroke();
      ctx.fillStyle = '#d24b3f';
      ctx.fillRect(cx, cy - style.h - 14, 7, 4);
    }
    if (!powered) drawNoPowerBolt(ctx, cx, cy - style.h - 12);
    return;
  }

  if (stage === 0) {
    const tint = ZONE_TINT[zone];
    if (tint) fillTile(ctx, geom, tint);
    if (!powered) drawNoPowerBolt(ctx, cx, cy - 4);
    return;
  }

  const h = (HEIGHTS[zone]?.[stage] ?? 12) * (0.92 + variant * 0.16);
  // Footprint must stay under 1.0 to preserve the painter's-order invariant.
  const f = Math.min(0.85, 0.55 + stage * 0.05);
  let [hue, sat, lit] = PALETTES[zone]?.[stage] ?? [0, 0, 50];
  hue += Math.floor(variant * 24) - 12;

  if (abandoned) {
    sat = 6;
    lit = 32;
  }
  const faces = box(ctx, geom, f, h, hue, sat, lit);
  if (stage >= 2 && zone !== Zone.Industrial) windows(ctx, faces, h, !abandoned);
  if (zone === Zone.Industrial && stage >= 2 && !abandoned) smokestack(ctx, cx + 8, cy - 8, h + 8);

  if (abandoned) {
    // boarded-up cross over the roof
    ctx.strokeStyle = 'rgba(30,25,20,0.8)';
    ctx.lineWidth = 2;
    const r = 0.5 * f;
    ctx.beginPath();
    ctx.moveTo(cx - 14 * r, cy - h - 5 * r);
    ctx.lineTo(cx + 14 * r, cy - h + 5 * r);
    ctx.moveTo(cx + 14 * r, cy - h - 5 * r);
    ctx.lineTo(cx - 14 * r, cy - h + 5 * r);
    ctx.stroke();
  }

  if (!powered && !abandoned) {
    drawNoPowerBolt(ctx, cx, cy - h - 12);
  }
}
