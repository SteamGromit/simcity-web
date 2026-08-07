/**
 * Vegetation and small ground furniture.
 *
 * A tree used to be a brown rectangle with a green circle on it, repeated
 * three times per forest tile from the same two offsets — which read as
 * polka dots once more than a handful were on screen. Trees are now baked
 * sprites: a layered canopy lit from the same sun as everything else, a
 * tapering trunk, a contact shadow, and enough variants (species × size ×
 * seasonal palette) that a wood looks like a wood.
 */

import type { Season } from '../sim/weather';
import { hash2 } from './noise';
import { Hsl, css, hsl, lit, mix } from './palette';
import { LIGHT } from './sun';
import { Sprite, blit, sprite } from './spritecache';

export type TreeKind = 'broadleaf' | 'conifer' | 'scrub' | 'palm' | 'dead';

interface CanopyPalette {
  /** Sunlit crown, mid mass, and the shaded underside. */
  light: Hsl;
  mid: Hsl;
  dark: Hsl;
}

const SEASON_CANOPY: Record<Season, CanopyPalette> = {
  spring: { light: hsl(96, 52, 55), mid: hsl(108, 46, 40), dark: hsl(126, 40, 25) },
  summer: { light: hsl(104, 44, 47), mid: hsl(118, 40, 34), dark: hsl(136, 36, 21) },
  autumn: { light: hsl(38, 62, 52), mid: hsl(26, 56, 39), dark: hsl(16, 46, 24) },
  winter: { light: hsl(96, 14, 48), mid: hsl(104, 12, 36), dark: hsl(120, 12, 24) },
};

const CONIFER_SHIFT = { h: -14, s: 6, l: -8 };
const TRUNK = hsl(24, 26, 30);

function canopyFor(kind: TreeKind, season: Season, tone: number): CanopyPalette {
  const base = SEASON_CANOPY[season];
  const warp = (c: Hsl): Hsl => ({
    h: c.h + (kind === 'conifer' ? CONIFER_SHIFT.h : 0) + (tone - 0.5) * 16,
    s: c.s + (kind === 'conifer' ? CONIFER_SHIFT.s : 0) + (tone - 0.5) * 10,
    l: c.l + (kind === 'conifer' ? CONIFER_SHIFT.l : 0) + (tone - 0.5) * 7,
  });
  return { light: warp(base.light), mid: warp(base.mid), dark: warp(base.dark) };
}

/** One blob of foliage, lit upper-left and shaded lower-right. */
function blob(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  pal: CanopyPalette,
  level: number,
): void {
  ctx.fillStyle = css(lit(pal.dark, level));
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = css(lit(pal.mid, level));
  ctx.beginPath();
  ctx.ellipse(x - rx * 0.1, y - ry * 0.2, rx * 0.88, ry * 0.82, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = css(lit(pal.light, level));
  ctx.beginPath();
  ctx.ellipse(x - rx * 0.3, y - ry * 0.42, rx * 0.5, ry * 0.44, 0, 0, Math.PI * 2);
  ctx.fill();
}

interface TreeSpec {
  kind: TreeKind;
  /** Canopy height in screen px. */
  height: number;
  /** Canopy half-width. */
  spread: number;
  variant: number;
}

function paintTree(ctx: CanvasRenderingContext2D, spec: TreeSpec, season: Season): void {
  const { kind, height, spread, variant } = spec;
  const tone = hash2(variant, 7, 991);
  const pal = canopyFor(kind, season, tone);
  const trunkH = kind === 'conifer' ? height * 0.16 : height * 0.34;
  const trunkW = Math.max(1.1, spread * 0.16);

  // contact shadow, squashed to the ground plane
  ctx.fillStyle = 'rgba(26, 32, 46, 0.26)';
  ctx.beginPath();
  ctx.ellipse(spread * 0.42, 0, spread * 0.95, spread * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();

  // trunk: tapered, lit on the left
  ctx.fillStyle = css(lit(TRUNK, LIGHT.right));
  ctx.beginPath();
  ctx.moveTo(-trunkW * 0.7, 0);
  ctx.lineTo(trunkW * 0.7, 0);
  ctx.lineTo(trunkW * 0.38, -trunkH - 1);
  ctx.lineTo(-trunkW * 0.38, -trunkH - 1);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = css(lit(TRUNK, LIGHT.left * 1.15));
  ctx.fillRect(-trunkW * 0.7, -trunkH - 1, trunkW * 0.5, trunkH + 1);

  if (kind === 'dead') {
    ctx.strokeStyle = css(lit(TRUNK, LIGHT.left));
    ctx.lineWidth = 1;
    for (let k = 0; k < 4; k++) {
      const a = -0.4 - hash2(variant, k, 13) * 2.2;
      ctx.beginPath();
      ctx.moveTo(0, -trunkH * (0.5 + k * 0.15));
      ctx.lineTo(Math.cos(a) * spread * 0.8, -trunkH - Math.abs(Math.sin(a)) * height * 0.4);
      ctx.stroke();
    }
    return;
  }

  if (kind === 'conifer') {
    // stacked skirts, widest at the bottom
    const tiers = 4;
    for (let k = tiers - 1; k >= 0; k--) {
      const t = k / tiers;
      const w = spread * (1 - t * 0.72);
      const yTop = -trunkH - (height - trunkH) * (t + 0.32);
      const yBot = -trunkH - (height - trunkH) * t;
      ctx.fillStyle = css(lit(pal.mid, LIGHT.right));
      ctx.beginPath();
      ctx.moveTo(0, yTop);
      ctx.lineTo(w, yBot);
      ctx.lineTo(0, yBot + w * 0.34);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = css(lit(pal.light, LIGHT.left * 1.06));
      ctx.beginPath();
      ctx.moveTo(0, yTop);
      ctx.lineTo(-w, yBot);
      ctx.lineTo(0, yBot + w * 0.34);
      ctx.closePath();
      ctx.fill();
    }
    return;
  }

  if (kind === 'palm') {
    const crown = -trunkH - height * 0.12;
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + hash2(variant, k, 5) * 0.5;
      const len = spread * (0.9 + hash2(variant, k, 9) * 0.4);
      ctx.strokeStyle = css(lit(k % 2 ? pal.mid : pal.light, Math.cos(a) < 0 ? LIGHT.left : LIGHT.right));
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, crown);
      ctx.quadraticCurveTo(Math.cos(a) * len * 0.6, crown - 4, Math.cos(a) * len, crown + Math.abs(Math.sin(a)) * 2 + 3);
      ctx.stroke();
    }
    return;
  }

  // broadleaf / scrub: three or four overlapping blobs
  const lobes = kind === 'scrub' ? 3 : 4;
  const crownY = -trunkH - (height - trunkH) * 0.42;
  for (let k = 0; k < lobes; k++) {
    const a = (k / lobes) * Math.PI * 2 + variant;
    const r = spread * (k === 0 ? 0.82 : 0.56);
    blob(
      ctx,
      Math.cos(a) * spread * (k === 0 ? 0 : 0.42),
      crownY + Math.sin(a) * (height - trunkH) * (k === 0 ? 0 : 0.18),
      r,
      r * 0.82,
      pal,
      k === 0 ? 1 : 0.94 + hash2(variant, k, 21) * 0.14,
    );
  }
}

const KIND_CODE: Record<TreeKind, string> = {
  broadleaf: 'b',
  conifer: 'c',
  scrub: 's',
  palm: 'p',
  dead: 'd',
};

/** A tree sprite, baked once per (kind, size bucket, variant, season). */
export function treeSprite(kind: TreeKind, size: number, variant: number, season: Season): Sprite {
  const height = Math.round(size);
  const spread = Math.max(3, Math.round(size * 0.42));
  const key = `t${KIND_CODE[kind]}${height}v${variant}${season[0]}`;
  const w = spread * 2.6;
  const h = height + spread * 0.7;
  return sprite(key, { w, h, ax: w / 2, ay: h - spread * 0.6 }, (ctx) => {
    paintTree(ctx, { kind, height, spread, variant }, season);
  });
}

/**
 * Draw a tree with its trunk base at (x, y). `wind` leans the canopy — the
 * sprite is sheared rather than re-baked, so a hurricane costs nothing.
 */
export function drawTree(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  kind: TreeKind,
  size: number,
  variant: number,
  season: Season,
  wind = 0,
): void {
  const s = treeSprite(kind, size, variant, season);
  if (wind === 0) {
    blit(ctx, s, x, y);
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.transform(1, 0, wind / Math.max(8, s.h), 1, 0, 0);
  blit(ctx, s, 0, 0);
  ctx.restore();
}

/** A weathered boulder for rocky ground. */
export function drawRock(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, variant: number): void {
  const key = `rk${Math.round(size)}v${variant}`;
  const s = sprite(key, { w: size * 2.4, h: size * 1.9, ax: size * 1.2, ay: size * 1.35 }, (c) => {
    const body = hsl(28, 10, 44);
    c.fillStyle = 'rgba(26, 32, 46, 0.24)';
    c.beginPath();
    c.ellipse(size * 0.3, 0, size * 0.9, size * 0.38, 0, 0, Math.PI * 2);
    c.fill();
    const pts: [number, number][] = [];
    const n = 6;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const r = size * (0.6 + hash2(variant, k, 3) * 0.45);
      pts.push([Math.cos(a) * r, -size * 0.34 + Math.sin(a) * r * 0.55]);
    }
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts.slice(1)) c.lineTo(p[0], p[1]);
    c.closePath();
    c.fillStyle = css(lit(body, LIGHT.right));
    c.fill();
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts.slice(1, 4)) c.lineTo(p[0], p[1]);
    c.closePath();
    c.fillStyle = css(lit(body, LIGHT.roof));
    c.fill();
  });
  blit(ctx, s, x, y);
}

/** A clipped hedge, used as a yard prop and a park edge. */
export function drawHedge(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, season: Season): void {
  const pal = canopyFor('scrub', season, 0.4);
  const s = sprite(`hg${Math.round(len)}${season[0]}`, { w: len + 6, h: 12, ax: (len + 6) / 2, ay: 9 }, (c) => {
    c.fillStyle = 'rgba(26, 32, 46, 0.2)';
    c.fillRect(-len / 2 + 1, -1, len, 3);
    c.fillStyle = css(lit(pal.dark, LIGHT.right));
    c.fillRect(-len / 2, -5, len, 5);
    c.fillStyle = css(lit(pal.mid, LIGHT.left));
    c.fillRect(-len / 2, -6.5, len, 2.5);
    c.fillStyle = css(lit(pal.light, LIGHT.roof));
    c.fillRect(-len / 2, -7.5, len, 1.4);
  });
  blit(ctx, s, x, y);
}

/** Effective canopy tone for anything that wants to match the trees. */
export function canopyTone(season: Season): Hsl {
  return mix(SEASON_CANOPY[season].mid, SEASON_CANOPY[season].light, 0.35);
}
