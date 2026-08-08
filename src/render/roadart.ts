/**
 * Roads that look like roads.
 *
 * The old painter drew a line from the tile centre to each connected edge,
 * which turned every junction into a cream asterisk and left the carriageway
 * as bare grey. This one works from the connectivity mask: asphalt with wear,
 * kerbed footways along every edge that *isn't* a road, a centre line only
 * where the road actually runs through, and crosswalk ladders at junctions.
 *
 * Each (class, mask, variant) combination bakes to a sprite once —
 * a few hundred tiny bitmaps for the entire street network.
 */

import { idx, inBounds } from '../sim/grid';
import { CityState, Zone } from '../sim/types';
import type { RoadClass } from '../sim/roads';
import { TILE_H, TILE_W, TileGeom } from './iso';
import { hash2 } from './noise';
import { ENV, css, hsl, lit, mix } from './palette';
import { LIGHT } from './sun';
import { getSkin } from './skins';
import { blit, sprite } from './spritecache';

const HW = TILE_W / 2;
const HH = TILE_H / 2;

/** Bit per side: 1 north (−y), 2 east (+x), 4 south (+y), 8 west (−x). */
export const SIDE_DIRS: [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/** Midpoint of side `k` relative to the tile centre, in screen pixels. */
export const SIDE_MID: [number, number][] = [
  [HW / 2, -HH / 2],
  [HW / 2, HH / 2],
  [-HW / 2, HH / 2],
  [-HW / 2, -HH / 2],
];

/**
 * Which sides of (x, y) carry the carriageway onward. A planted median is
 * landscaping, not a lane, and a neighbour more than one level away is a
 * cliff the road cannot climb — neither counts as connected.
 */
export function roadMask(city: CityState, x: number, y: number): number {
  const own = city.tiles[idx(x, y)];
  let mask = 0;
  for (let k = 0; k < 4; k++) {
    const [dx, dy] = SIDE_DIRS[k];
    if (!inBounds(x + dx, y + dy)) continue;
    const n = city.tiles[idx(x + dx, y + dy)];
    if (n.zone !== Zone.Road || n.median) continue;
    if (Math.abs(n.elevation - own.elevation) > 1) continue;
    mask |= 1 << k;
  }
  return mask;
}

/**
 * Turn a world-space connectivity mask into the screen-space one the baked
 * sprites are drawn for. A quarter turn moves the neighbour in grid direction
 * k to the screen position direction k+1 occupied before, so rotating the
 * bits is all it takes — the road sprites themselves are reused unchanged at
 * every angle.
 */
export function rotateMask(mask: number, quarter: number): number {
  const q = ((quarter % 4) + 4) % 4;
  return ((mask << q) | (mask >> (4 - q))) & 0b1111;
}

/** How wide the footway is for a class, as a share of the half-tile. */
function footwayWidth(cls: RoadClass): number {
  return cls >= 3 ? 0.1 : cls >= 1 ? 0.16 : 0.24;
}

function asphaltTone(cls: RoadClass) {
  const skinFill = getSkin().roadFill;
  // the skin still owns the asphalt; motorways are a blacker, newer pour
  const m = /^#([0-9a-f]{6})$/i.exec(skinFill.trim());
  let base = ENV.asphalt;
  if (m) {
    const n = parseInt(m[1], 16);
    const r = ((n >> 16) & 255) / 255;
    const g = ((n >> 8) & 255) / 255;
    const b = (n & 255) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = ((max + min) / 2) * 100;
    const d = max - min;
    const s = d === 0 ? 0 : (d / (1 - Math.abs((max + min) - 1))) * 100;
    let h = 0;
    if (d !== 0) {
      if (max === r) h = 60 * (((g - b) / d) % 6);
      else if (max === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
    }
    base = hsl(h, Math.min(40, s), l);
  }
  return cls >= 3 ? { ...base, l: base.l * 0.78 } : base;
}

/** Lane paint by class: yellow centre lines on streets, white on motorways. */
function paintColor(cls: RoadClass): string {
  if (cls >= 3) return 'rgba(238, 242, 248, 0.86)';
  if (cls >= 1) return 'rgba(233, 214, 132, 0.85)';
  return 'rgba(224, 204, 128, 0.7)';
}

function edgePts(k: number): [[number, number], [number, number]] {
  const corners: [number, number][] = [
    [0, -HH],
    [HW, 0],
    [0, HH],
    [-HW, 0],
  ];
  return [corners[k], corners[(k + 1) % 4]];
}

function paintRoadTile(
  ctx: CanvasRenderingContext2D,
  cls: RoadClass,
  mask: number,
  variant: number,
): void {
  const tone = asphaltTone(cls);
  const seed = variant * 71 + cls * 13 + mask;

  ctx.beginPath();
  ctx.moveTo(0, -HH);
  ctx.lineTo(HW, 0);
  ctx.lineTo(0, HH);
  ctx.lineTo(-HW, 0);
  ctx.closePath();
  ctx.save();
  ctx.clip();

  // carriageway
  ctx.fillStyle = css(lit(tone, LIGHT.roof * 0.92));
  ctx.fillRect(-HW, -HH, TILE_W, TILE_H);
  // wear: lighter tyre polish down the middle, darker patches at the edges
  ctx.fillStyle = css(lit(tone, LIGHT.roof * 1.16), 0.35);
  for (let k = 0; k < 5; k++) {
    const u = hash2(k, 1, seed) * 2 - 1;
    const v = hash2(k, 2, seed) * 2 - 1;
    if (Math.abs(u) + Math.abs(v) > 1) continue;
    ctx.fillRect(u * HW, v * HH, 3 + hash2(k, 3, seed) * 7, 2);
  }
  ctx.fillStyle = 'rgba(12, 14, 20, 0.2)';
  for (let k = 0; k < 4; k++) {
    const u = hash2(k, 4, seed) * 2 - 1;
    const v = hash2(k, 5, seed) * 2 - 1;
    if (Math.abs(u) + Math.abs(v) > 1) continue;
    ctx.fillRect(u * HW, v * HH, 2 + hash2(k, 6, seed) * 5, 1.6);
  }

  // footway + kerb along every side that isn't carrying the road onward
  const fw = footwayWidth(cls);
  const kerb = css(lit(ENV.concreteKerb, LIGHT.roof * 0.95));
  const pave = css(lit({ ...ENV.concreteKerb, l: ENV.concreteKerb.l * 0.86 }, LIGHT.roof * 0.9));
  for (let k = 0; k < 4; k++) {
    if (mask & (1 << k)) continue;
    const [c1, c2] = edgePts(k);
    const i1: [number, number] = [c1[0] * (1 - fw), c1[1] * (1 - fw)];
    const i2: [number, number] = [c2[0] * (1 - fw), c2[1] * (1 - fw)];
    ctx.beginPath();
    ctx.moveTo(c1[0], c1[1]);
    ctx.lineTo(c2[0], c2[1]);
    ctx.lineTo(i2[0], i2[1]);
    ctx.lineTo(i1[0], i1[1]);
    ctx.closePath();
    ctx.fillStyle = pave;
    ctx.fill();
    // the kerb face: a bright top nosing over a dark shadow line
    ctx.strokeStyle = kerb;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(i1[0], i1[1]);
    ctx.lineTo(i2[0], i2[1]);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(10, 12, 18, 0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(i1[0] * 0.94, i1[1] * 0.94);
    ctx.lineTo(i2[0] * 0.94, i2[1] * 0.94);
    ctx.stroke();
  }

  // markings
  const bits = (mask & 1 ? 1 : 0) + (mask & 2 ? 1 : 0) + (mask & 4 ? 1 : 0) + (mask & 8 ? 1 : 0);
  const paint = paintColor(cls);
  const lineW = cls >= 3 ? 1.8 : 1.4;
  ctx.strokeStyle = paint;
  ctx.lineWidth = lineW;

  if (bits >= 3) {
    // junction: no centre line through the box, crosswalk ladders on approach
    ctx.strokeStyle = 'rgba(236, 240, 246, 0.6)';
    ctx.lineWidth = 1.3;
    for (let k = 0; k < 4; k++) {
      if (!(mask & (1 << k))) continue;
      const [mx, my] = SIDE_MID[k];
      const [c1, c2] = edgePts(k);
      const ex = (c2[0] - c1[0]) / 2;
      const ey = (c2[1] - c1[1]) / 2;
      for (let s = -2; s <= 2; s++) {
        const px = mx * 0.72 + (ex * s) / 3.2;
        const py = my * 0.72 + (ey * s) / 3.2;
        ctx.beginPath();
        ctx.moveTo(px - mx * 0.13, py - my * 0.13);
        ctx.lineTo(px + mx * 0.13, py + my * 0.13);
        ctx.stroke();
      }
    }
  } else if (bits === 2) {
    const opposite = mask === 0b0101 || mask === 0b1010;
    ctx.strokeStyle = paint;
    ctx.lineWidth = lineW;
    if (opposite) {
      // straight through: a dashed centre line the full length
      const k = mask === 0b0101 ? 0 : 1;
      const [ax, ay] = SIDE_MID[k];
      const [bx, by] = SIDE_MID[(k + 2) % 4];
      ctx.setLineDash(cls >= 1 ? [] : [5, 4]);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      // a bend: curve the line through the corner
      let a = -1;
      let b = -1;
      for (let k = 0; k < 4; k++) if (mask & (1 << k)) (a === -1 ? (a = k) : (b = k));
      ctx.beginPath();
      ctx.moveTo(SIDE_MID[a][0], SIDE_MID[a][1]);
      ctx.quadraticCurveTo(0, 0, SIDE_MID[b][0], SIDE_MID[b][1]);
      ctx.stroke();
    }
  } else if (bits === 1) {
    // a stub: run the line in and finish it with a turning head
    let k = 0;
    for (let i = 0; i < 4; i++) if (mask & (1 << i)) k = i;
    ctx.beginPath();
    ctx.moveTo(SIDE_MID[k][0], SIDE_MID[k][1]);
    ctx.lineTo(SIDE_MID[k][0] * 0.15, SIDE_MID[k][1] * 0.15);
    ctx.stroke();
    ctx.fillStyle = css(lit(tone, LIGHT.roof * 1.06));
    ctx.beginPath();
    ctx.ellipse(0, 0, 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Draw the road surface for a tile. */
export function drawRoad(
  ctx: CanvasRenderingContext2D,
  geom: TileGeom,
  cls: RoadClass,
  mask: number,
  variant: number,
): void {
  const s = sprite(
    `rd${cls}m${mask}v${variant & 3}${getSkin().id}`,
    { w: TILE_W + 2, h: TILE_H + 2, ax: HW + 1, ay: HH + 1 },
    (c) => paintRoadTile(c, cls, mask, variant & 3),
  );
  blit(ctx, s, geom.cx, geom.cy);
}

/** A bridge deck over water: pier, shadow on the water, then the road. */
export function drawBridge(
  ctx: CanvasRenderingContext2D,
  geom: TileGeom,
  cls: RoadClass,
  mask: number,
  variant: number,
): void {
  ctx.fillStyle = 'rgba(12, 20, 40, 0.35)';
  ctx.beginPath();
  ctx.ellipse(geom.cx + 6, geom.cy + 5, HW * 0.8, HH * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  const pier = css(lit(hsl(210, 6, 46), LIGHT.right));
  for (const [px, py] of geom.corners) {
    if (py > geom.cy) {
      ctx.fillStyle = pier;
      ctx.fillRect(px - 2, py - 3, 4, 9);
    }
  }
  drawRoad(ctx, geom, cls, mask, variant);
  // parapet rails along the open sides
  ctx.strokeStyle = css(lit(ENV.concreteKerb, LIGHT.roof));
  ctx.lineWidth = 1.4;
  for (let k = 0; k < 4; k++) {
    if (mask & (1 << k)) continue;
    const c1 = geom.corners[k];
    const c2 = geom.corners[(k + 1) % 4];
    ctx.beginPath();
    ctx.moveTo(c1[0], c1[1] - 3);
    ctx.lineTo(c2[0], c2[1] - 3);
    ctx.stroke();
  }
}

// ---------------------------------------------------------------------------
// Street furniture
// ---------------------------------------------------------------------------

/** A lamp standard: post, arm, and a head that lights up after dark. */
function lampSprite(lit_: boolean) {
  return sprite(`lamp${lit_ ? 1 : 0}`, { w: 22, h: 40, ax: 8, ay: 34 }, (c) => {
    c.fillStyle = 'rgba(22, 26, 40, 0.24)';
    c.beginPath();
    c.ellipse(3, 0, 5, 2.2, 0, 0, Math.PI * 2);
    c.fill();
    const post = hsl(210, 6, 40);
    c.fillStyle = css(lit(post, LIGHT.right));
    c.fillRect(-1, -30, 2, 30);
    c.fillStyle = css(lit(post, LIGHT.left * 1.15));
    c.fillRect(-1, -30, 0.8, 30);
    // the arm reaching over the carriageway
    c.strokeStyle = css(lit(post, LIGHT.left));
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(0, -30);
    c.quadraticCurveTo(4, -33, 8, -32);
    c.stroke();
    c.fillStyle = lit_ ? '#ffe9b0' : css(lit(hsl(46, 10, 62), LIGHT.roof));
    c.fillRect(6, -32.4, 4.4, 1.8);
    if (lit_) {
      const g = c.createRadialGradient(8, -31, 0, 8, -31, 11);
      g.addColorStop(0, 'rgba(255, 226, 150, 0.55)');
      g.addColorStop(1, 'rgba(255, 226, 150, 0)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(8, -31, 11, 0, Math.PI * 2);
      c.fill();
    }
  });
}

/** A signal head on a post, red over amber over green. */
function signalSprite(phase: number) {
  return sprite(`sig${phase}`, { w: 14, h: 34, ax: 7, ay: 29 }, (c) => {
    c.fillStyle = 'rgba(22, 26, 40, 0.24)';
    c.beginPath();
    c.ellipse(2, 0, 4, 1.8, 0, 0, Math.PI * 2);
    c.fill();
    const post = hsl(200, 6, 34);
    c.fillStyle = css(lit(post, LIGHT.right));
    c.fillRect(-0.9, -22, 1.8, 22);
    c.fillStyle = css(lit(post, LIGHT.roof));
    c.fillRect(-2.6, -30, 5.2, 8);
    const lamps = ['#ff4436', '#ffc23a', '#3ad46a'];
    for (let k = 0; k < 3; k++) {
      c.fillStyle = k === phase ? lamps[k] : 'rgba(24, 26, 30, 0.85)';
      c.fillRect(-1.3, -29 + k * 2.4, 2.6, 1.8);
    }
  });
}

/** A car left at the kerb; the street looks abandoned without them. */
function parkedSprite(variant: number, along: boolean) {
  const colors = ['#c9c4bb', '#8f9aa6', '#7d5a4a', '#4a6a94', '#3d4249', '#a8483c'];
  return sprite(`park${variant}${along ? 'a' : 'b'}`, { w: 20, h: 14, ax: 10, ay: 9 }, (c) => {
    const body = colors[variant % colors.length];
    c.save();
    c.rotate(along ? 0.4636 : -0.4636); // along the two street directions
    c.fillStyle = 'rgba(18, 22, 36, 0.28)';
    c.fillRect(-4.6, -1.6, 10, 4);
    c.fillStyle = body;
    c.fillRect(-5, -2.2, 10, 4.4);
    c.fillStyle = 'rgba(255,255,255,0.14)';
    c.fillRect(-5, -2.2, 10, 1.9);
    c.fillStyle = 'rgba(120, 150, 178, 0.7)';
    c.fillRect(-1.6, -1.6, 3.6, 3);
    c.fillStyle = 'rgba(16, 18, 24, 0.7)';
    c.fillRect(-4, 1.4, 8, 0.8);
    c.restore();
  });
}

/**
 * What stands on the pavement. Drawn in the standing pass rather than with the
 * road surface, so a building in front occludes it properly.
 */
export function drawStreetFurniture(
  ctx: CanvasRenderingContext2D,
  geom: TileGeom,
  mask: number,
  seed: number,
  detail: 0 | 1 | 2,
  night: number,
  timeMs: number,
): void {
  if (detail === 0) return;
  const bits = (mask & 1 ? 1 : 0) + (mask & 2 ? 1 : 0) + (mask & 4 ? 1 : 0) + (mask & 8 ? 1 : 0);
  if (bits >= 3 && detail >= 1) {
    // a signal on the near corner of every real junction, all four in step
    const phase = Math.floor(timeMs / 3200 + seed * 0.11) % 3;
    blit(ctx, signalSprite(phase === 2 ? 2 : phase), geom.cx - HW * 0.42, geom.cy + HH * 0.42);
    return;
  }
  // lamps every few tiles along a street, on the footway side
  if (hash2(seed, 1, 404) > 0.72) {
    for (let k = 0; k < 4; k++) {
      if (mask & (1 << k)) continue;
      const [mx, my] = SIDE_MID[k];
      blit(ctx, lampSprite(night > 0.28), geom.cx + mx * 0.78, geom.cy + my * 0.78);
      break;
    }
  }
  if (detail === 2 && hash2(seed, 2, 909) > 0.55) {
    // a couple parked against the kerb, angled with the street
    for (let k = 0; k < 4; k++) {
      if (mask & (1 << k)) continue;
      const [mx, my] = SIDE_MID[k];
      const along = k === 1 || k === 3;
      blit(
        ctx,
        parkedSprite(Math.floor(hash2(seed, k, 31) * 6), along),
        geom.cx + mx * 0.52,
        geom.cy + my * 0.52,
      );
      break;
    }
  }
}

/** A boulevard's planted centre strip: turf, kerbs all round, a street tree. */
export function medianTone(veg: { grassHue: number; grassLight: number }) {
  return mix(
    hsl(104 + veg.grassHue, 32, 32 + veg.grassLight),
    hsl(96, 26, 36),
    0.25,
  );
}
