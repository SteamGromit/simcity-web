/**
 * Lots, not tiles.
 *
 * Every building used to stand on a tinted diamond with a garden path. A real
 * building stands on a *plot*: a sidewalk along the street, a lawn with mow
 * lines, a driveway to a garage, a fence or hedge down one side, a car; or a
 * parking lot with painted bays; or a fenced yard with pallets and tanks.
 * The ground is the half of the picture a box-on-grass has none of.
 *
 * The layout is a pure function of the lot and which screen side its road is
 * on. Canonical layouts are authored with the road on side 2 (the lower-left
 * edge) and rotated into place, so the same plot turns with the camera and
 * the driveway always meets the street. The painter bakes it into its own
 * tile-sized sprite — not the building's, or every house would bake four
 * times over — blitted in the ground pass so cast shadows fall on it.
 */

import { idx, inBounds } from '../sim/grid';
import { frontage } from '../sim/roads';
import { normalizeTier } from '../sim/tiers';
import { CityState, Stage, Tier, Zone } from '../sim/types';
import type { Season } from '../sim/weather';
import { TILE_H, TILE_W, TileGeom } from './iso';
import { fill } from './massing';
import { hash2 } from './noise';
import { ENV, Hsl, css, hsl, lit } from './palette';
import { vegTint } from './seasonfx';
import { blit, sprite } from './spritecache';
import { LIGHT, Pt, wallLight } from './sun';
import { grain } from './surface';

export type LotGround = 'lawn' | 'paving' | 'asphalt' | 'gravel' | 'plaza' | 'field' | 'xeriscape';

export type FeatureKind =
  | 'sidewalk'
  | 'driveway'
  | 'path'
  | 'fence'
  | 'hedge'
  | 'bed'
  | 'mailbox'
  | 'car'
  | 'bays'
  | 'lamp'
  | 'sign'
  | 'dumpster'
  | 'planter'
  | 'bench'
  | 'container'
  | 'pallets'
  | 'tank'
  | 'truck'
  | 'tree'
  | 'shrub'
  | 'kerb'
  | 'rows';

/**
 * Tile-fraction coordinates: u along grid x, v along grid y, both −0.5..0.5
 * over the whole block; `w`/`d` are extents along u/v; `along` is the screen
 * side (0..3) a linear feature runs beside; `n` a count for repeated things.
 */
export interface Feature {
  kind: FeatureKind;
  u: number;
  v: number;
  w?: number;
  d?: number;
  along?: number;
  n?: number;
}

export interface LotLayout {
  ground: LotGround;
  features: Feature[];
}

/** Screen-side directions in grid steps at rest: 0 north, 1 east, 2 south, 3 west. */
const SIDE_DIRS: [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/**
 * Which screen side (0..3) the nearest frontage road is on, or −1 when there
 * is none within two tiles. A quarter turn moves grid side k to screen side
 * k+q — the same rule `rotateMask` applies to road connectivity.
 */
export function roadSideOf(city: CityState, x: number, y: number, quarter: number): number {
  for (let r = 1; r <= 2; r++) {
    for (let k = 0; k < 4; k++) {
      const [dx, dy] = SIDE_DIRS[k];
      const nx = x + dx * r;
      const ny = y + dy * r;
      if (!inBounds(nx, ny)) continue;
      if (frontage(city.tiles[idx(nx, ny)])) return (k + ((quarter % 4) + 4)) % 4;
    }
  }
  return -1;
}

/** One quarter turn in tile space: (u, v) → (−v, u); extents swap; the side steps on. */
export function rotateFeature(f: Feature, turns: number): Feature {
  let out: Feature = { ...f };
  const n = ((turns % 4) + 4) % 4;
  for (let t = 0; t < n; t++) {
    const next: Feature = { ...out, u: -out.v, v: out.u };
    delete next.w;
    delete next.d;
    if (out.d !== undefined) next.w = out.d;
    if (out.w !== undefined) next.d = out.w;
    if (out.along !== undefined) next.along = (out.along + 1) % 4;
    out = next;
  }
  return out;
}

type Fam = 'R1' | 'R2' | 'R3' | 'C1' | 'C2' | 'C3' | 'ag' | 'dirty' | 'manu' | 'tech';

function famOf(zone: Zone, tier: Tier): Fam {
  const t = normalizeTier(zone, tier);
  if (zone === Zone.Industrial) return t as Fam;
  return `${zone === Zone.Residential ? 'R' : 'C'}${t}` as Fam;
}

/** Canonical layouts: road on side 2, i.e. the v = +0.5 edge. */
function canonical(fam: Fam, stage: Stage, bucket: number, desert: boolean): LotLayout {
  const r = (k: number) => hash2(bucket, k, 1234 + stage);
  const F: Feature[] = [];
  const sidewalk = (): void => {
    F.push({ kind: 'sidewalk', u: 0, v: 0.46, w: 1, d: 0.08, along: 2 });
  };

  // ---- residential --------------------------------------------------------
  if (fam === 'R1' || fam === 'R2' || fam === 'R3') {
    if (stage <= 3) {
      sidewalk();
      const gx = r(1) > 0.5 ? 0.3 : -0.3; // which side the garage is on
      F.push({ kind: 'driveway', u: gx, v: 0.22, w: 0.16, d: 0.56, along: 2 });
      F.push({ kind: 'path', u: -gx * 0.35, v: 0.3, w: 0.08, d: 0.34, along: 2 });
      if (r(2) > 0.4) F.push({ kind: 'car', u: gx, v: 0.34, w: 0.12, d: 0.2, along: 2 });
      F.push({
        kind: fam === 'R3' ? 'hedge' : r(3) > 0.5 ? 'fence' : 'hedge',
        u: gx > 0 ? -0.47 : 0.47,
        v: 0,
        w: 0.05,
        d: 0.9,
        along: gx > 0 ? 3 : 1,
      });
      F.push({ kind: 'bed', u: -gx * 0.35, v: 0.42, w: 0.2, d: 0.06 });
      F.push({ kind: 'mailbox', u: -gx * 0.35 + 0.08, v: 0.47, w: 0.02, d: 0.02 });
      const trees = fam === 'R3' ? 2 : fam === 'R2' ? 1 + (r(4) > 0.6 ? 1 : 0) : r(4) > 0.5 ? 1 : 0;
      for (let k = 0; k < trees; k++) {
        F.push({ kind: 'tree', u: (r(5 + k) - 0.5) * 0.7, v: -0.38 + r(8 + k) * 0.2 });
      }
      F.push({ kind: 'shrub', u: -gx * 0.35 - 0.1, v: 0.38 });
      return { ground: desert ? 'xeriscape' : 'lawn', features: F };
    }
    if (stage <= 5) {
      sidewalk();
      F.push({ kind: 'kerb', u: 0, v: 0.42, w: 1, d: 0.02, along: 2 });
      F.push({ kind: 'planter', u: -0.36, v: 0.4, w: 0.12, d: 0.06 });
      F.push({ kind: 'planter', u: 0.36, v: 0.4, w: 0.12, d: 0.06 });
      F.push({ kind: 'dumpster', u: 0.4, v: -0.42, w: 0.1, d: 0.08 });
      if (r(2) > 0.5) F.push({ kind: 'car', u: -0.1, v: 0.38, w: 0.12, d: 0.2, along: 2 });
      F.push({ kind: 'tree', u: -0.42, v: -0.3 });
      return { ground: 'paving', features: F };
    }
    // towers stand on a plaza
    sidewalk();
    F.push({ kind: 'planter', u: -0.38, v: 0.36, w: 0.14, d: 0.08 });
    F.push({ kind: 'planter', u: 0.38, v: 0.36, w: 0.14, d: 0.08 });
    F.push({ kind: 'bench', u: 0, v: 0.4, w: 0.12, d: 0.03, along: 2 });
    F.push({ kind: 'lamp', u: 0.44, v: 0.44 });
    F.push({ kind: 'tree', u: -0.4, v: 0.3 });
    return { ground: 'plaza', features: F };
  }

  // ---- commercial ---------------------------------------------------------
  if (fam === 'C1' || fam === 'C2' || fam === 'C3') {
    if (fam === 'C1' && stage <= 3) {
      sidewalk();
      const n = 4 + Math.floor(r(1) * 3);
      F.push({ kind: 'bays', u: 0, v: 0.26, w: 0.84, d: 0.24, along: 2, n });
      const cars = 1 + Math.floor(r(2) * Math.min(4, n - 1));
      for (let k = 0; k < cars; k++) {
        F.push({
          kind: 'car',
          u: -0.36 + (k / (n - 1)) * 0.72 + (r(9 + k) - 0.5) * 0.02,
          v: 0.26,
          w: 0.1,
          d: 0.18,
          along: 2,
        });
      }
      F.push({ kind: 'lamp', u: 0.44, v: 0.24 });
      F.push({ kind: 'sign', u: -0.44, v: 0.44 });
      F.push({ kind: 'dumpster', u: 0.42, v: -0.42, w: 0.1, d: 0.08 });
      return { ground: 'asphalt', features: F };
    }
    if (stage <= 5) {
      sidewalk();
      F.push({ kind: 'kerb', u: 0, v: 0.42, w: 1, d: 0.02, along: 2 });
      if (r(2) > 0.4) F.push({ kind: 'truck', u: 0.2, v: 0.36, w: 0.14, d: 0.22, along: 2 });
      F.push({ kind: 'planter', u: -0.4, v: 0.4, w: 0.1, d: 0.06 });
      F.push({ kind: 'dumpster', u: -0.42, v: -0.42, w: 0.1, d: 0.08 });
      return { ground: 'paving', features: F };
    }
    sidewalk();
    F.push({ kind: 'planter', u: -0.4, v: 0.34, w: 0.14, d: 0.08 });
    F.push({ kind: 'planter', u: 0.4, v: 0.34, w: 0.14, d: 0.08 });
    F.push({ kind: 'bench', u: -0.2, v: 0.4, w: 0.12, d: 0.03, along: 2 });
    F.push({ kind: 'lamp', u: 0.44, v: 0.44 });
    if (r(3) > 0.5) F.push({ kind: 'car', u: 0.1, v: 0.42, w: 0.1, d: 0.16, along: 2 });
    F.push({ kind: 'tree', u: 0.42, v: 0.2 });
    return { ground: 'plaza', features: F };
  }

  // ---- industrial ---------------------------------------------------------
  if (fam === 'ag') {
    F.push({ kind: 'rows', u: 0, v: 0, w: 1, d: 1, n: r(1) > 0.5 ? 0 : 1 });
    F.push({ kind: 'fence', u: 0, v: 0.47, w: 0.96, d: 0.04, along: 2 });
    F.push({ kind: 'path', u: 0.3, v: 0.3, w: 0.08, d: 0.4, along: 2 });
    return { ground: 'field', features: F };
  }
  F.push({ kind: 'fence', u: 0, v: 0.47, w: 0.96, d: 0.04, along: 2 });
  F.push({ kind: 'fence', u: -0.47, v: 0, w: 0.04, d: 0.96, along: 3 });
  F.push({ kind: 'driveway', u: 0.3, v: 0.25, w: 0.2, d: 0.5, along: 2 });
  if (r(1) > 0.4) F.push({ kind: 'truck', u: 0.3, v: 0.3, w: 0.14, d: 0.24, along: 2 });
  F.push({ kind: 'pallets', u: -0.36, v: 0.36, w: 0.14, d: 0.1 });
  if (fam !== 'tech') F.push({ kind: 'container', u: -0.34, v: -0.34, w: 0.22, d: 0.1, along: 3 });
  if (fam === 'dirty') F.push({ kind: 'tank', u: 0.38, v: -0.34, w: 0.12, d: 0.12 });
  F.push({ kind: 'lamp', u: 0.44, v: 0.44 });
  return { ground: fam === 'tech' ? 'paving' : fam === 'manu' ? 'asphalt' : 'gravel', features: F };
}

/**
 * The plot for a lot, turned so its driveway meets the road on screen side
 * `side` (−1: no road in reach, which lays it out as if the road were on the
 * near-left edge). A block is laid out over its whole footprint in the same
 * −0.5..0.5 space, so `size` only matters to the painter.
 */
export function layoutLot(
  zone: Zone,
  tier: Tier,
  stage: Stage,
  bucket: number,
  size: number,
  side: number,
  desert: boolean,
): LotLayout {
  void size;
  const base = canonical(famOf(zone, tier), stage, bucket, desert);
  const turns = ((((side < 0 ? 2 : side) - 2) % 4) + 4) % 4;
  return { ground: base.ground, features: base.features.map((f) => rotateFeature(f, turns)) };
}

// ---------------------------------------------------------------------------
// The painter
// ---------------------------------------------------------------------------

/** The projected screen offsets of one tile step along each grid axis. */
const GX: Pt = [32, 16];
const GY: Pt = [-32, 16];

/** Tile-fraction (u, v) over a `size` block → screen offset from the centre. */
export function project(u: number, v: number, size: number): Pt {
  return [(u * GX[0] + v * GY[0]) * size, (u * GX[1] + v * GY[1]) * size];
}

/** The screen quad of a feature's extent box, clockwise on a y-down canvas. */
function box(f: Feature, size: number): Pt[] {
  const w = (f.w ?? 0.04) / 2;
  const d = (f.d ?? 0.04) / 2;
  return [
    project(f.u - w, f.v - d, size),
    project(f.u + w, f.v - d, size),
    project(f.u + w, f.v + d, size),
    project(f.u - w, f.v + d, size),
  ];
}

/** Screen offsets of the layout's trees — drawn live by the renderer, so the
 * season's own sprite stands on the plot. */
export function treePositions(layout: LotLayout, size: number): Pt[] {
  return layout.features.filter((f) => f.kind === 'tree').map((f) => project(f.u, f.v, size));
}

const GROUND_TONE: Record<LotGround, (season: Season) => Hsl> = {
  lawn: (s) => {
    const v = vegTint(s);
    return hsl(100 + v.grassHue, 34, 36 + v.grassLight);
  },
  xeriscape: () => hsl(36, 22, 58),
  paving: () => hsl(40, 5, 62),
  plaza: () => hsl(35, 6, 66),
  asphalt: () => hsl(220, 5, 34),
  gravel: () => hsl(34, 8, 50),
  field: (s) => {
    const v = vegTint(s);
    return hsl(70 + v.grassHue * 0.5, 30, 38 + v.grassLight * 0.6);
  },
};

/** The two endpoints of a linear feature, along whichever axis it is longer. */
function ends(f: Feature, size: number): [Pt, Pt, boolean] {
  const horizontal = (f.w ?? 0) >= (f.d ?? 0);
  const a = project(f.u - (horizontal ? (f.w ?? 0) / 2 : 0), f.v - (horizontal ? 0 : (f.d ?? 0) / 2), size);
  const b = project(f.u + (horizontal ? (f.w ?? 0) / 2 : 0), f.v + (horizontal ? 0 : (f.d ?? 0) / 2), size);
  return [a, b, horizontal];
}

function strokeEdge(ctx: CanvasRenderingContext2D, q: Pt[], style: string): void {
  ctx.strokeStyle = style;
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(q[0][0], q[0][1]);
  for (let i = 1; i < q.length; i++) ctx.lineTo(q[i][0], q[i][1]);
  ctx.closePath();
  ctx.stroke();
}

/** Lines across a strip feature at even intervals — expansion joints. */
function jointLines(ctx: CanvasRenderingContext2D, f: Feature, size: number, n: number): void {
  const [a, b, horizontal] = ends(f, size);
  const w = horizontal ? (f.d ?? 0.1) : (f.w ?? 0.1);
  ctx.strokeStyle = 'rgba(20, 24, 30, 0.2)';
  ctx.lineWidth = 0.5;
  for (let k = 1; k < n; k++) {
    const t = k / n;
    const cu = f.u + (horizontal ? -(f.w ?? 0) / 2 + t * (f.w ?? 0) : 0);
    const cv = f.v + (horizontal ? 0 : -(f.d ?? 0) / 2 + t * (f.d ?? 0));
    const p = horizontal ? project(cu, cv - w / 2, size) : project(cu - w / 2, cv, size);
    const q = horizontal ? project(cu, cv + w / 2, size) : project(cu + w / 2, cv, size);
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    ctx.lineTo(q[0], q[1]);
    ctx.stroke();
  }
  void a;
  void b;
}

/** A small box standing on the ground: a shadow, its lit faces, a top.
 * `glazed` adds a cabin band for vehicles. */
function solid(
  ctx: CanvasRenderingContext2D,
  f: Feature,
  size: number,
  h: number,
  body: Hsl,
  glazed: boolean,
): void {
  const q = box(f, size);
  fill(
    ctx,
    q.map(([x, y]) => [x + 1.5, y + 1] as Pt),
    'rgba(20, 24, 40, 0.3)',
  );
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    if (b[0] - a[0] >= -1e-9) continue;
    fill(
      ctx,
      [a, b, [b[0], b[1] - h], [a[0], a[1] - h]],
      css(lit(body, wallLight(a[0], a[1], b[0], b[1]))),
    );
  }
  fill(
    ctx,
    q.map(([x, y]) => [x, y - h] as Pt),
    css(lit(body, LIGHT.roof)),
  );
  if (glazed) {
    const c = project(f.u, f.v, size);
    ctx.fillStyle = 'rgba(120, 150, 180, 0.7)';
    ctx.fillRect(c[0] - 2, c[1] - h - 0.6, 4, 1.4);
  }
}

function paintFeature(ctx: CanvasRenderingContext2D, f: Feature, size: number, seed: number): void {
  const q = box(f, size);
  const c = project(f.u, f.v, size);
  switch (f.kind) {
    case 'sidewalk':
      fill(ctx, q, css(lit(hsl(38, 6, 68), LIGHT.roof)));
      strokeEdge(ctx, q, 'rgba(20, 24, 30, 0.25)');
      jointLines(ctx, f, size, 6);
      break;
    case 'kerb':
      fill(ctx, q, css(lit(ENV.concreteKerb, LIGHT.roof * 1.05)));
      break;
    case 'driveway':
      fill(ctx, q, css(lit(hsl(36, 5, 60), LIGHT.roof)));
      jointLines(ctx, f, size, 4);
      break;
    case 'path':
      fill(ctx, q, css(lit(hsl(40, 12, 64), LIGHT.roof)));
      break;
    case 'bed': {
      fill(ctx, q, css(hsl(24, 30, 30)));
      const [a, b] = ends(f, size);
      for (let k = 0; k < 5; k++) {
        const t = (k + 0.5) / 5;
        ctx.fillStyle = `hsl(${[0, 40, 320, 50, 10][k]} 70% 60%)`;
        ctx.fillRect(a[0] + (b[0] - a[0]) * t - 0.7, a[1] + (b[1] - a[1]) * t - 1.2, 1.4, 1.2);
      }
      break;
    }
    case 'rows': {
      // crop rows across the field, one way or the other
      const n = 9;
      ctx.strokeStyle = 'rgba(30, 40, 14, 0.35)';
      ctx.lineWidth = 1.2;
      for (let k = 1; k < n; k++) {
        const t = -0.5 + k / n;
        const a = f.n ? project(t, -0.48, size) : project(-0.48, t, size);
        const b = f.n ? project(t, 0.48, size) : project(0.48, t, size);
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
      }
      break;
    }
    case 'bays': {
      // painted parking bays: lines across the strip, evenly spaced
      const n = f.n ?? 5;
      const [, , horizontal] = ends(f, size);
      const len = horizontal ? (f.w ?? 0.8) : (f.d ?? 0.8);
      const across = horizontal ? (f.d ?? 0.2) : (f.w ?? 0.2);
      ctx.strokeStyle = 'rgba(240, 240, 236, 0.5)';
      ctx.lineWidth = 0.8;
      for (let k = 0; k <= n; k++) {
        const t = -len / 2 + (k / n) * len;
        const a = horizontal ? project(f.u + t, f.v - across / 2, size) : project(f.u - across / 2, f.v + t, size);
        const b = horizontal ? project(f.u + t, f.v + across / 2, size) : project(f.u + across / 2, f.v + t, size);
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
      }
      break;
    }
    case 'fence': {
      const [a, b] = ends(f, size);
      const posts = Math.max(2, Math.round(Math.max(f.w ?? 0, f.d ?? 0) * 10));
      ctx.strokeStyle = 'rgba(235, 230, 220, 0.9)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1] - 3);
      ctx.lineTo(b[0], b[1] - 3);
      ctx.moveTo(a[0], a[1] - 1.5);
      ctx.lineTo(b[0], b[1] - 1.5);
      ctx.stroke();
      ctx.fillStyle = 'rgba(225, 220, 208, 0.95)';
      for (let k = 0; k <= posts; k++) {
        const t = k / posts;
        ctx.fillRect(a[0] + (b[0] - a[0]) * t - 0.5, a[1] + (b[1] - a[1]) * t - 4, 1, 4);
      }
      break;
    }
    case 'hedge': {
      const [a, b] = ends(f, size);
      const g = hsl(110, 30, 30);
      ctx.strokeStyle = css(lit(g, LIGHT.right));
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1] - 1);
      ctx.lineTo(b[0], b[1] - 1);
      ctx.stroke();
      ctx.strokeStyle = css(lit(g, LIGHT.roof));
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1] - 3);
      ctx.lineTo(b[0], b[1] - 3);
      ctx.stroke();
      break;
    }
    case 'shrub': {
      const g = hsl(110, 32, 32);
      ctx.fillStyle = css(lit(g, LIGHT.right));
      ctx.beginPath();
      ctx.ellipse(c[0], c[1] - 1.5, 3, 2.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = css(lit(g, LIGHT.roof));
      ctx.beginPath();
      ctx.ellipse(c[0] - 0.8, c[1] - 2.4, 1.8, 1.3, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'mailbox':
      ctx.fillStyle = 'rgba(60, 50, 40, 0.9)';
      ctx.fillRect(c[0] - 0.4, c[1] - 4, 0.8, 4);
      ctx.fillStyle = '#3a4a6a';
      ctx.fillRect(c[0] - 1.4, c[1] - 5.6, 2.8, 1.8);
      break;
    case 'lamp':
      ctx.fillStyle = 'rgba(60, 64, 70, 0.9)';
      ctx.fillRect(c[0] - 0.5, c[1] - 12, 1, 12);
      ctx.fillStyle = '#e8e2c8';
      ctx.fillRect(c[0] - 1.5, c[1] - 13.5, 3, 1.6);
      break;
    case 'sign':
      ctx.fillStyle = 'rgba(60, 64, 70, 0.9)';
      ctx.fillRect(c[0] - 0.6, c[1] - 14, 1.2, 14);
      ctx.fillStyle = `hsl(${Math.floor(hash2(seed, 7, 3) * 360)} 60% 46%)`;
      ctx.fillRect(c[0] - 4, c[1] - 19, 8, 5);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.fillRect(c[0] - 3, c[1] - 17.6, 6, 0.8);
      break;
    case 'car':
      solid(
        ctx,
        f,
        size,
        4,
        hsl(
          Math.floor(hash2(seed, Math.round(f.u * 100), 9) * 360),
          30 + hash2(seed, 5, 2) * 40,
          40 + hash2(seed, 6, 2) * 35,
        ),
        true,
      );
      break;
    case 'truck':
      solid(ctx, f, size, 7, hsl(210, 6, 70), true);
      break;
    case 'dumpster':
      solid(ctx, f, size, 4, hsl(150, 28, 30), false);
      break;
    case 'container':
      solid(ctx, f, size, 6, hsl([8, 210, 30, 150][Math.floor(hash2(seed, 3, 4) * 4)], 40, 40), false);
      break;
    case 'pallets':
      solid(ctx, f, size, 2.5, hsl(34, 30, 52), false);
      break;
    case 'tank': {
      const t = hsl(200, 8, 60);
      ctx.fillStyle = css(lit(t, LIGHT.right));
      ctx.beginPath();
      ctx.ellipse(c[0], c[1] - 3, 4, 3.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = css(lit(t, LIGHT.roof));
      ctx.beginPath();
      ctx.ellipse(c[0] - 1, c[1] - 4.2, 2.6, 2.2, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'planter':
      fill(ctx, q, css(lit(hsl(30, 10, 46), LIGHT.roof)));
      ctx.fillStyle = css(hsl(110, 30, 34));
      ctx.beginPath();
      ctx.ellipse(c[0], c[1] - 1.5, Math.max(1, (f.w ?? 0.1) * 32 * size * 0.4), 1.6, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'bench':
      ctx.fillStyle = 'rgba(90, 70, 50, 0.95)';
      ctx.fillRect(c[0] - 3, c[1] - 2.2, 6, 1.2);
      ctx.fillRect(c[0] - 2.6, c[1] - 1, 0.7, 1);
      ctx.fillRect(c[0] + 1.9, c[1] - 1, 0.7, 1);
      break;
    case 'tree':
      break; // drawn live by the renderer with the season's sprite
  }
}

function paintLotGround(
  ctx: CanvasRenderingContext2D,
  lay: LotLayout,
  size: number,
  seed: number,
  season: Season,
): void {
  const hw = (TILE_W * size) / 2;
  const hh = (TILE_H * size) / 2;
  const tone = GROUND_TONE[lay.ground](season);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, -hh);
  ctx.lineTo(hw, 0);
  ctx.lineTo(0, hh);
  ctx.lineTo(-hw, 0);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = css(lit(tone, LIGHT.roof * 0.95));
  ctx.fillRect(-hw, -hh, hw * 2, hh * 2);
  // ground texture: mow stripes on a lawn, joints on paving, patches on
  // asphalt, gravel speckle
  if (lay.ground === 'lawn') {
    ctx.fillStyle = css(lit(tone, LIGHT.roof * 1.06), 0.35);
    for (let k = -6; k <= 6; k += 2) {
      const a = project(-0.5, -0.5 + (k + 6) / 12, size);
      const b = project(0.5, -0.5 + (k + 6) / 12, size);
      const a2 = project(-0.5, -0.5 + (k + 7) / 12, size);
      const b2 = project(0.5, -0.5 + (k + 7) / 12, size);
      fill(ctx, [a, b, b2, a2], ctx.fillStyle as string);
    }
  } else if (lay.ground === 'paving' || lay.ground === 'plaza') {
    ctx.strokeStyle = 'rgba(20, 24, 30, 0.18)';
    ctx.lineWidth = 0.6;
    const step = lay.ground === 'plaza' ? 0.125 : 0.2;
    for (let t = -0.5 + step; t < 0.5; t += step) {
      const a = project(t, -0.5, size);
      const b = project(t, 0.5, size);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
      const c = project(-0.5, t, size);
      const d = project(0.5, t, size);
      ctx.beginPath();
      ctx.moveTo(c[0], c[1]);
      ctx.lineTo(d[0], d[1]);
      ctx.stroke();
    }
  } else if (lay.ground === 'asphalt') {
    for (let k = 0; k < 6; k++) {
      const p = project((hash2(k, 1, seed) - 0.5) * 0.8, (hash2(k, 2, seed) - 0.5) * 0.8, size);
      ctx.fillStyle = hash2(k, 3, seed) > 0.5 ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.05)';
      ctx.beginPath();
      ctx.ellipse(p[0], p[1], 4 + hash2(k, 4, seed) * 6, 2 + hash2(k, 5, seed) * 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (lay.ground === 'gravel' || lay.ground === 'xeriscape') {
    for (let k = 0; k < 40 * size; k++) {
      const p = project((hash2(k, 1, seed) - 0.5) * 0.96, (hash2(k, 2, seed) - 0.5) * 0.96, size);
      ctx.fillStyle = hash2(k, 3, seed) > 0.5 ? 'rgba(30, 26, 20, 0.2)' : 'rgba(255, 250, 240, 0.16)';
      ctx.fillRect(p[0], p[1], 1.2, 0.8);
    }
  }
  // features, back to front by screen y
  const feats = lay.features
    .slice()
    .sort((a, b) => project(a.u, a.v, size)[1] - project(b.u, b.v, size)[1]);
  for (const f of feats) paintFeature(ctx, f, size, seed);
  ctx.restore();
}

/** Headroom above the diamond for the things on a plot that stand up. */
const LOT_HEADROOM = 20;

/**
 * Blit the plot under a lot: baked once per (family, band, bucket, size,
 * side) — and per season only when the ground is grass, which must match the
 * meadow around it.
 */
export function drawLotGround(
  ctx: CanvasRenderingContext2D,
  geom: TileGeom,
  zone: Zone,
  tier: Tier,
  stage: Stage,
  bucket: number,
  size: number,
  side: number,
  desert: boolean,
  season: Season,
): void {
  if (stage === 0) return;
  const lay = layoutLot(zone, tier, stage, bucket, size, side, desert);
  const fam = famOf(zone, tier);
  const band = stage <= 2 ? 0 : stage <= 5 ? 1 : 2;
  const seasonal = lay.ground === 'lawn' || lay.ground === 'field';
  const key = `G${fam}${band}.${bucket}.${size}.${side < 0 ? 2 : side}${
    seasonal ? season.slice(0, 2) : ''
  }${desert ? 'd' : ''}`;
  const hw = (TILE_W * size) / 2;
  const hh = (TILE_H * size) / 2;
  const s = sprite(
    key,
    { w: hw * 2 + 2, h: hh * 2 + 2 + LOT_HEADROOM, ax: hw + 1, ay: hh + 1 + LOT_HEADROOM },
    (c) => {
      paintLotGround(c, lay, size, bucket * 17 + stage * 3 + band, season);
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      grain(c, c.canvas.width, c.canvas.height, 0.025, bucket + 11);
      c.restore();
    },
  );
  blit(ctx, s, geom.cx, geom.cy);
}
