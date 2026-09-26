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

export type TreeKind =
  | 'broadleaf'
  | 'conifer'
  | 'scrub'
  | 'palm'
  | 'dead'
  | 'oak'
  | 'maple'
  | 'birch'
  | 'pine'
  | 'spruce'
  | 'cypress';

/** The species a generic kind resolves to for a variant: `broadleaf` is one
 * of oak, maple or birch, `conifer` one of pine, spruce or cypress. A named
 * species stays itself. */
export function speciesOf(kind: TreeKind, variant: number): TreeKind {
  const v = ((Math.round(variant) % 6) + 6) % 6;
  if (kind === 'broadleaf') return (['oak', 'maple', 'birch', 'oak', 'maple', 'oak'] as TreeKind[])[v];
  if (kind === 'conifer') return (['pine', 'spruce', 'spruce', 'pine', 'cypress', 'spruce'] as TreeKind[])[v];
  return kind;
}

const CONIFERS = new Set<TreeKind>(['conifer', 'pine', 'spruce', 'cypress']);

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
  const conifer = CONIFERS.has(kind);
  // a maple goes red in autumn; a birch is a paler, yellower green
  const hueShift = kind === 'maple' && season === 'autumn' ? -22 : kind === 'birch' ? 8 : 0;
  const lightShift = kind === 'birch' ? 5 : 0;
  const warp = (c: Hsl): Hsl => ({
    h: c.h + (conifer ? CONIFER_SHIFT.h : 0) + hueShift + (tone - 0.5) * 16,
    s: c.s + (conifer ? CONIFER_SHIFT.s : 0) + (tone - 0.5) * 10,
    l: c.l + (conifer ? CONIFER_SHIFT.l : 0) + lightShift + (tone - 0.5) * 7,
  });
  return { light: warp(base.light), mid: warp(base.mid), dark: warp(base.dark) };
}

interface TreeSpec {
  kind: TreeKind;
  /** Canopy height in screen px. */
  height: number;
  /** Canopy half-width. */
  spread: number;
  variant: number;
}

/** One leaf cluster: a small ellipse in one of the three canopy tones. */
function dab(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, tone: Hsl, level: number): void {
  ctx.fillStyle = css(lit(tone, level));
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.85, 0, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * A broadleaf crown from many leaf clusters over a dark core: the clusters
 * in the upper-left third take the light, those in the lower-right third the
 * shade, the rest the mid tone, with a little dapple thrown in. `rx`/`ry` are
 * the crown's half-extents about (cx, cy).
 */
function crown(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  pal: CanopyPalette,
  variant: number,
  density: number,
): void {
  ctx.fillStyle = css(lit(pal.dark, LIGHT.right * 0.9));
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx * 0.92, ry * 0.92, 0, 0, Math.PI * 2);
  ctx.fill();
  const n = Math.max(12, Math.round(rx * ry * density));
  for (let k = 0; k < n; k++) {
    const a = hash2(k, 1, variant) * Math.PI * 2;
    const d = Math.sqrt(hash2(k, 2, variant));
    const x = cx + Math.cos(a) * d * rx;
    const y = cy + Math.sin(a) * d * ry;
    const t = (x - cx) / rx - (y - cy) / ry; // +: upper-left, −: lower-right
    const r = hash2(k, 3, variant);
    const tone = t > 0.35 ? (r < 0.15 ? pal.mid : pal.light) : t < -0.35 ? (r < 0.15 ? pal.mid : pal.dark) : r < 0.15 ? pal.light : pal.mid;
    dab(ctx, x, y, 1.3 + hash2(k, 4, variant) * 1.4, tone, 1);
  }
}

function paintTree(ctx: CanvasRenderingContext2D, spec: TreeSpec, season: Season): void {
  const { height, spread, variant } = spec;
  const kind = speciesOf(spec.kind, variant);
  const tone = hash2(variant, 7, 991);
  const pal = canopyFor(kind, season, tone);
  const conifer = CONIFERS.has(kind);
  const trunkH = conifer ? height * 0.18 : kind === 'birch' ? height * 0.42 : height * 0.34;
  const trunkW = Math.max(1.1, spread * (kind === 'birch' ? 0.12 : 0.16));
  const trunk = kind === 'birch' ? hsl(40, 8, 78) : TRUNK;

  // contact shadow, squashed to the ground plane
  ctx.fillStyle = 'rgba(26, 32, 46, 0.26)';
  ctx.beginPath();
  ctx.ellipse(spread * 0.42, 0, spread * 0.95, spread * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();

  // trunk: tapered, lit on the left, a bark line down the shade side
  ctx.fillStyle = css(lit(trunk, LIGHT.right));
  ctx.beginPath();
  ctx.moveTo(-trunkW * 0.7, 0);
  ctx.lineTo(trunkW * 0.7, 0);
  ctx.lineTo(trunkW * 0.38, -trunkH - 1);
  ctx.lineTo(-trunkW * 0.38, -trunkH - 1);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = css(lit(trunk, LIGHT.left * 1.15));
  ctx.fillRect(-trunkW * 0.7, -trunkH - 1, trunkW * 0.5, trunkH + 1);
  ctx.fillStyle = 'rgba(20, 14, 10, 0.35)';
  ctx.fillRect(trunkW * 0.3, -trunkH - 1, 0.5, trunkH + 1);
  if (kind === 'birch') {
    ctx.fillStyle = 'rgba(30, 26, 24, 0.7)';
    for (let k = 0; k < 4; k++) ctx.fillRect(-trunkW * 0.5, -trunkH * (0.2 + k * 0.22), trunkW * 0.6, 0.6);
  }

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

  if (kind === 'palm') {
    const crownY = -trunkH - height * 0.12;
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + hash2(variant, k, 5) * 0.5;
      const len = spread * (0.9 + hash2(variant, k, 9) * 0.4);
      ctx.strokeStyle = css(lit(k % 2 ? pal.mid : pal.light, Math.cos(a) < 0 ? LIGHT.left : LIGHT.right));
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, crownY);
      ctx.quadraticCurveTo(Math.cos(a) * len * 0.6, crownY - 4, Math.cos(a) * len, crownY + Math.abs(Math.sin(a)) * 2 + 3);
      ctx.stroke();
    }
    return;
  }

  if (kind === 'cypress') {
    // a narrow flame: stacked ellipses shrinking to a point
    const tiers = 4;
    for (let k = 0; k < tiers; k++) {
      const t = k / tiers;
      const w = spread * 0.55 * (1 - t * 0.7);
      const y = -trunkH - (height - trunkH) * (t + 0.18);
      dab(ctx, 0, y, Math.max(1, w), pal.dark, LIGHT.right);
      dab(ctx, -w * 0.25, y - 0.5, Math.max(0.8, w * 0.6), pal.mid, LIGHT.left);
    }
    return;
  }

  if (conifer) {
    // layered skirts, widest at the bottom; a pine is taller and sparser
    // with its trunk showing, a spruce is dense to the ground
    const pine = kind === 'pine';
    const tiers = pine ? 5 : 7;
    const base = pine ? trunkH + height * 0.18 : trunkH;
    for (let k = tiers - 1; k >= 0; k--) {
      const t = k / tiers;
      const w = spread * (1 - t * 0.72) * (pine ? 0.9 : 1);
      const yTop = -base - (height - base) * (t + (pine ? 0.26 : 0.32));
      const yBot = -base - (height - base) * t;
      // each skirt is a notched triangle: the notches are what make it a branch
      const notch = w * 0.12;
      ctx.fillStyle = css(lit(pal.mid, LIGHT.right));
      ctx.beginPath();
      ctx.moveTo(0, yTop);
      ctx.lineTo(w, yBot);
      ctx.lineTo(w * 0.6, yBot + notch);
      ctx.lineTo(w * 0.3, yBot + w * 0.2);
      ctx.lineTo(0, yBot + w * 0.34);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = css(lit(pal.light, LIGHT.left * 1.06));
      ctx.beginPath();
      ctx.moveTo(0, yTop);
      ctx.lineTo(-w, yBot);
      ctx.lineTo(-w * 0.6, yBot + notch);
      ctx.lineTo(-w * 0.3, yBot + w * 0.2);
      ctx.lineTo(0, yBot + w * 0.34);
      ctx.closePath();
      ctx.fill();
    }
    return;
  }

  // oak, maple, birch, scrub: a crown of leaf clusters
  const shape =
    kind === 'oak'
      ? { rx: spread * 1.15, ry: (height - trunkH) * 0.5, lift: 0.5 }
      : kind === 'maple'
        ? { rx: spread * 0.95, ry: (height - trunkH) * 0.56, lift: 0.5 }
        : kind === 'birch'
          ? { rx: spread * 0.7, ry: (height - trunkH) * 0.6, lift: 0.52 }
          : { rx: spread * 0.9, ry: (height - trunkH) * 0.45, lift: 0.45 };
  const cy = -trunkH - (height - trunkH) * shape.lift;
  crown(ctx, 0, cy, Math.max(2, shape.rx), Math.max(1.5, shape.ry), pal, variant, kind === 'scrub' ? 0.5 : 0.7);
  if (kind === 'maple') {
    // a slight point at the top
    dab(ctx, -shape.rx * 0.1, cy - shape.ry * 0.95, Math.max(1, shape.rx * 0.28), pal.light, 1.02);
  }
}

const KIND_CODE: Record<TreeKind, string> = {
  broadleaf: 'b',
  conifer: 'c',
  scrub: 's',
  palm: 'p',
  dead: 'd',
  oak: 'o',
  maple: 'm',
  birch: 'i',
  pine: 'n',
  spruce: 'r',
  cypress: 'y',
};

/** A tree sprite, baked once per (kind, size bucket, variant, season). */
export function treeSprite(kind: TreeKind, size: number, variant: number, season: Season): Sprite {
  const height = Math.round(size);
  const spread = Math.max(3, Math.round(size * 0.42));
  // two letters of season: spring and summer both start with an s, and for a
  // long while shared a sprite
  const key = `t${KIND_CODE[kind]}${height}v${variant}${season.slice(0, 2)}`;
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
  const s = sprite(`hg${Math.round(len)}${season.slice(0, 2)}`, { w: len + 6, h: 12, ax: (len + 6) / 2, ay: 9 }, (c) => {
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

/** Scrub and bramble on the forest floor, baked per variant and season. */
export function drawUndergrowth(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  variant: number,
  season: Season,
): void {
  const pal = canopyFor('scrub', season, 0.5);
  const v = ((Math.round(variant) % 4) + 4) % 4;
  const s = sprite(`ug${v}${season.slice(0, 2)}`, { w: 40, h: 16, ax: 20, ay: 12 }, (c) => {
    for (let k = 0; k < 7; k++) {
      const px = hash2(k, 1, v) * 36 - 18;
      const py = hash2(k, 2, v) * 8 - 4;
      c.fillStyle = css(lit(k % 2 ? pal.dark : pal.mid, LIGHT.roof * 0.9), 0.85);
      c.beginPath();
      c.ellipse(px, py, 3 + hash2(k, 3, v) * 2, 1.6 + hash2(k, 4, v), 0, 0, Math.PI * 2);
      c.fill();
    }
  });
  blit(ctx, s, x, y);
}
