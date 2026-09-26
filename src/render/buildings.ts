import { buildingBySlot } from '../content/registry';
import { MAX_BUILDING_PROPS, MOD_SLOT_BASE, type VisualDef } from '../content/types';
import { Stage, Tier, Wealth, Zone } from '../sim/types';
import { normalizeTier } from '../sim/tiers';
import { entityFor } from '../sim/entities';
import { TILE_H, TILE_W, TileGeom } from './iso';
import { getSkin } from './skins';
import { hash2 } from './noise';
import {
  Quad,
  centre,
  castShadow,
  chamfer,
  tileOffset,
  tileRect,
  contactShadow,
  css,
  diamond,
  fill,
  halfExtent,
  inset,
  lit,
  material,
  mix,
  parapet,
  prism,
  raise,

  shift,
  type Facade,
  type Hsl,
  type Material,

  type WindowPattern,
} from './massing';
import { LAMP, hsl, materialOf, swatch } from './palette';
import { LIGHT, wallLight, type Pt } from './sun';
import {
  chimneyHeight,
  effectiveRoofStyle,
  placeRoofProps,
  roofCap,
  roofKit,
  pipeRun,
  towerCrown,
  wantsHatch,
} from './roofs';
import { grain } from './surface';
import { layoutLot, treePositions } from './lots';
import { Sprite, blit, sprite } from './spritecache';
import { drawHedge, drawRock, drawTree } from './scenery';
import { effectiveSeason } from './seasonfx';
import type { Season } from '../sim/weather';
import {
  Archetype,
  channels,
  boxExtent,
  footprintBudget,
  heightScaleFor,
  pickArchetype,
  pickFarmLayout,
  pickSwatch,
  PropKind,
  RoofStyle,
} from './archetypes';

/** Heights (px) by zone and stage 1..7. */
const HEIGHTS: Partial<Record<Zone, number[]>> = {
  [Zone.Residential]: [0, 15, 27, 46, 63, 82, 102, 124],
  [Zone.Commercial]: [0, 17, 35, 60, 80, 102, 126, 152],
  [Zone.Industrial]: [0, 13, 23, 37, 50, 64, 80, 98],
};

// ---------------------------------------------------------------------------
// Small shared helpers, kept at their old names for the rest of the renderer
// ---------------------------------------------------------------------------

export function fillPoly(ctx: CanvasRenderingContext2D, pts: [number, number][], style: string) {
  fill(ctx, pts, style);
}

/** Fill the tile's ground quad. */
export function fillTile(ctx: CanvasRenderingContext2D, geom: TileGeom, style: string) {
  fill(ctx, geom.corners, style);
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

/** The tile geometry as the massing module's Quad. */
export function quadOf(geom: TileGeom): Quad {
  return geom.corners.slice(0, 4) as Quad;
}

/**
 * The corner of a footprint nearest the viewer — the one lowest on screen.
 *
 * Corners are held in *grid* order, so which index that is changes with every
 * quarter turn. Anything that means "the front of the lot" has to measure it
 * rather than assume corner 2, which is precisely the assumption that took the
 * game down at 180° in v0.59.0. At rest this is corner 2, so everything built
 * on it is unchanged in the unrotated view.
 */
export function nearCorner(q: Pt[]): number {
  let at = 0;
  for (let i = 1; i < q.length; i++) if (q[i][1] > q[at][1]) at = i;
  return at;
}

/** The near edge, from the nearest corner along the quad's own winding. */
export function nearEdge(q: Quad): [Pt, Pt] {
  const n = nearCorner(q);
  return [q[n], q[(n + 1) % 4]];
}

/** Shift a quad by a tile-space offset, in units of the tile's own diagonal. */
function offsetQuad(q: Quad, ox: number, oy: number): Quad {
  const dx = ox * (q[1][0] - q[0][0]) + oy * (q[3][0] - q[0][0]);
  const dy = ox * (q[1][1] - q[0][1]) + oy * (q[3][1] - q[0][1]);
  return q.map(([x, y]) => [x + dx, y + dy] as Pt) as Quad;
}

/** The season the trees are wearing this frame. */
let season: Season = 'summer';
export function setRenderSeason(s: Season): void {
  season = effectiveSeason(s);
}

/** Kept for compatibility with the old canopy hook; the season now drives it. */
export function setCanopyColor(_c: string): void {
  /* trees take their colour from the season, see scenery.ts */
}

/** A tree at (tx, ty). Retained for the handful of one-off call sites. */
export function tree(ctx: CanvasRenderingContext2D, tx: number, ty: number, wind = 0) {
  const v = Math.abs(Math.round(tx * 7 + ty * 13)) % 6;
  drawTree(ctx, tx, ty, v === 4 ? 'conifer' : 'broadleaf', 15 + (v % 3) * 3, v, season, wind);
}

/** Utility pole glyph, used for power-line tiles and wires over roads. */
export function drawPole(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  const s = sprite('pole', { w: 24, h: 42, ax: 12, ay: 34 }, (c) => {
    c.fillStyle = 'rgba(24, 30, 44, 0.22)';
    c.beginPath();
    c.ellipse(3, 0, 6, 2.6, 0, 0, Math.PI * 2);
    c.fill();
    const wood = hsl(28, 22, 34);
    c.fillStyle = css(lit(wood, LIGHT.right));
    c.fillRect(-1.4, -30, 2.8, 30);
    c.fillStyle = css(lit(wood, LIGHT.left * 1.1));
    c.fillRect(-1.4, -30, 1.1, 30);
    c.fillStyle = css(lit(wood, LIGHT.roof));
    c.fillRect(-8, -26, 16, 1.6);
    c.fillStyle = 'rgba(140, 160, 180, 0.9)';
    for (const dx of [-6, -2, 2, 6]) c.fillRect(dx - 0.5, -28.5, 1, 2.5);
  });
  blit(ctx, s, cx, cy);
}

/** Soft ground shadow under a small object. */
export function drawShadow(ctx: CanvasRenderingContext2D, geom: TileGeom, f: number) {
  contactShadow(ctx, inset(quadOf(geom), f), 1);
}

/** Yellow "no power" bolt centered at (bx, by). */
export function drawNoPowerBolt(ctx: CanvasRenderingContext2D, bx: number, by: number) {
  ctx.fillStyle = '#ffd23f';
  ctx.strokeStyle = 'rgba(40, 30, 0, 0.55)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(bx + 2, by - 10);
  ctx.lineTo(bx - 3, by - 1);
  ctx.lineTo(bx + 0.5, by - 1);
  ctx.lineTo(bx - 2, by + 8);
  ctx.lineTo(bx + 4, by - 3);
  ctx.lineTo(bx + 0.5, by - 3);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
}

/** Zone tint for undeveloped zoned tiles. */
export const ZONE_TINT: Partial<Record<Zone, string>> = {
  [Zone.Residential]: 'rgba(60,200,80,0.30)',
  [Zone.Commercial]: 'rgba(70,130,255,0.30)',
  [Zone.Industrial]: 'rgba(235,200,60,0.30)',
};

const ZONE_STAKE: Partial<Record<Zone, Hsl>> = {
  [Zone.Residential]: hsl(126, 62, 48),
  [Zone.Commercial]: hsl(214, 74, 58),
  [Zone.Industrial]: hsl(46, 78, 54),
};

/** A zoned but undeveloped lot: graded ground, boundary pegs, survey string. */
function drawSurveyedLot(ctx: CanvasRenderingContext2D, geom: TileGeom, zone: Zone) {
  const q = inset(quadOf(geom), 0.9);
  fill(ctx, q, 'rgba(122, 104, 74, 0.34)');
  const peg = ZONE_STAKE[zone];
  if (!peg) return;
  // quiet on purpose: a freshly-zoned district is mostly empty lots, and at
  // full strength the boundary strings drowned out the city they surround
  ctx.strokeStyle = css(peg, 0.42);
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.moveTo(q[0][0], q[0][1]);
  for (let i = 1; i < 4; i++) ctx.lineTo(q[i][0], q[i][1]);
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = css(peg, 0.8);
  for (const [px, py] of q) ctx.fillRect(px - 0.8, py - 3, 1.6, 3);
}

// ---------------------------------------------------------------------------
// Growable lots: R / C / I
// ---------------------------------------------------------------------------

type FamilyKey = 'R1' | 'R2' | 'R3' | 'C1' | 'C2' | 'C3' | 'dirty' | 'manu' | 'tech' | 'ag';

function familyOf(zone: Zone, tier: Tier): FamilyKey {
  const t = normalizeTier(zone, tier);
  if (zone === Zone.Industrial) return t as FamilyKey;
  return `${zone === Zone.Residential ? 'R' : 'C'}${t as Wealth}` as FamilyKey;
}

interface LotStyle {
  /** Draw a parapet lip round flat roofs. */
  lip: boolean;
}

/** Whether a lot's flat roof gets a parapet lip. What a lot is *made of* is
 * the archetype's business now (see `swatches` in archetypes.ts); this only
 * decides the roofline. Still consumes a channel, so the bake's decision
 * stream — which `hearthTip` replays — keeps its order. */
function styleFor(fam: FamilyKey, stage: Stage, pick: number): LotStyle {
  void pick;
  const mid = stage >= 3;
  switch (fam) {
    case 'R1':
    case 'R2':
    case 'C1':
      return { lip: mid };
    case 'R3':
    case 'C2':
    case 'C3':
    case 'tech':
      return { lip: true };
    case 'dirty':
    case 'manu':
    case 'ag':
    default:
      return { lip: false };
  }
}

/** How many distinct looks a (zone, stage, tier) gets. Enough that a street
 * never repeats next door; few enough that the sprite cache stays small.
 * Each bucket also draws a different archetype and palette family, so six
 * buckets is well over six visibly different buildings. */
const VARIANTS = 6;

export function variantBucket(variant: number): number {
  return Math.min(VARIANTS - 1, Math.floor(variant * VARIANTS));
}

/** The height a growable lot's tallest mass reaches, in screen pixels. */
export function growableHeight(zone: Zone, stage: Stage, tier: Tier, bucket: number): number {
  return (
    (HEIGHTS[zone]?.[stage] ?? 12) *
    heightScaleFor(zone, tier) *
    (0.9 + (bucket / VARIANTS) * 0.2) *
    getSkin().heightScale
  );
}

export type StackKind = 'smoke' | 'steam' | 'hearth';
export interface StackTip { x: number; y: number; kind: StackKind; s: number }

// Roof geometry and painters live in roofs.ts; the pure placement halves are
// re-exported here because the ambient pass and its tests reach for them here.
export { placeRoofProps, chimneyHeight };

/** Doors, shopfronts and signage along the front wall — the marks that make a
 * lot legible as somewhere people go. */
function streetLevel(
  ctx: CanvasRenderingContext2D,
  walls: [Pt, Pt][],
  zone: Zone,
  stage: Stage,
  mat: ReturnType<typeof material>,
  seed: number,
  entityHue: number | null,
  initials: string | null,
): void {
  if (walls.length === 0) return;
  const [a, b] = walls.reduce((p, w) => (w[0][1] + w[1][1] > p[0][1] + p[1][1] ? w : p), walls[0]);
  const at = (t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  if (zone === Zone.Commercial && stage >= 1) {
    // a shopfront on every visible wall: glazing over a dark interior, a
    // stall riser, a fascia in the business colour, a reflection strip
    const fascia = entityHue !== null ? hsl(entityHue, 48, 40) : mat.trim;
    for (const [p, q2] of walls) {
      const level = wallLight(p[0], p[1], q2[0], q2[1]);
      fill(
        ctx,
        [p, q2, [q2[0], q2[1] - 6.5], [p[0], p[1] - 6.5]],
        css(lit({ ...mat.glass, l: mat.glass.l * 0.7 }, level)),
      );
      fill(ctx, [p, q2, [q2[0], q2[1] - 1.2], [p[0], p[1] - 1.2]], css(lit(mat.trim, level * 0.9)));
      fill(
        ctx,
        [[p[0], p[1] - 6.5], [q2[0], q2[1] - 6.5], [q2[0], q2[1] - 9.2], [p[0], p[1] - 9.2]],
        css(lit(fascia, level)),
      );
      fill(
        ctx,
        [[p[0], p[1] - 6.5], [q2[0], q2[1] - 6.5], [q2[0], q2[1] - 5.6], [p[0], p[1] - 5.6]],
        'rgba(255, 252, 244, 0.25)',
      );
    }
    if (stage <= 3 && hash2(5, 6, seed) > 0.5) {
      // an awning off the front wall, with the shade it throws under it
      const a1 = at(0.1);
      const a2 = at(0.9);
      const awn = entityHue !== null ? hsl(entityHue, 52, 46) : hsl(18, 40, 46);
      fill(
        ctx,
        [[a1[0], a1[1] - 9.2], [a2[0], a2[1] - 9.2], [a2[0], a2[1] - 5.2], [a1[0], a1[1] - 5.2]],
        css(lit(awn, LIGHT.roof)),
      );
      fill(
        ctx,
        [[a1[0], a1[1] - 5.2], [a2[0], a2[1] - 5.2], [a2[0], a2[1] - 4.4], [a1[0], a1[1] - 4.4]],
        'rgba(10, 14, 26, 0.35)',
      );
    }
  }
  if (stage >= 5) {
    // tower lobby: a tall recessed entrance under a canopy
    const e1 = at(0.32);
    const e2 = at(0.68);
    fill(ctx, [e1, e2, [e2[0], e2[1] - 10], [e1[0], e1[1] - 10]], 'rgba(16, 20, 28, 0.72)');
    ctx.strokeStyle = css(lit(mat.trim, LIGHT.left * 1.2));
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(e1[0], e1[1] - 10.5);
    ctx.lineTo(e2[0], e2[1] - 10.5);
    ctx.stroke();
  } else {
    const d1 = at(0.42);
    const d2 = at(0.58);
    fill(ctx, [d1, d2, [d2[0], d2[1] - 7], [d1[0], d1[1] - 7]], 'rgba(28, 22, 18, 0.85)');
    ctx.strokeStyle = css(lit(mat.trim, LIGHT.left * 1.1));
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(d1[0], d1[1] - 7.4);
    ctx.lineTo(d2[0], d2[1] - 7.4);
    ctx.stroke();
    if (zone === Zone.Residential && hash2(3, 4, seed) > 0.5) {
      // a stoop light beside the door
      ctx.fillStyle = css(LAMP, 0.5);
      ctx.beginPath();
      ctx.arc(d2[0] + 1.5, d2[1] - 6, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (entityHue !== null) {
    const p = at(0.2);
    const w = 12;
    const y = stage >= 5 ? p[1] - 13 : p[1] - 12;
    ctx.fillStyle = `hsl(${entityHue} 62% 46%)`;
    ctx.fillRect(p[0] - w / 2, y - 6, w, 6);
    ctx.strokeStyle = 'rgba(248, 248, 244, 0.8)';
    ctx.lineWidth = 0.7;
    ctx.strokeRect(p[0] - w / 2, y - 6, w, 6);
    if (initials) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 5px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(initials, p[0], y - 1.4);
      ctx.textAlign = 'left';
    }
  }
}

/** What a field wears in each season: tilled brown in spring, green rows in
 * summer, gold at harvest, pale stubble in winter. */
const CROP: Record<Season, { soil: Hsl; crop: Hsl }> = {
  spring: { soil: hsl(28, 26, 32), crop: hsl(88, 30, 36) },
  summer: { soil: hsl(40, 24, 34), crop: hsl(96, 36, 34) },
  autumn: { soil: hsl(34, 22, 36), crop: hsl(44, 46, 46) },
  winter: { soil: hsl(36, 12, 46), crop: hsl(42, 16, 56) },
};

/** Farmland: tilled ground under crop rows, a barn, a fence along the
 * street, and whatever the layout adds — a silo, a coop with a pond, a
 * tractor. Baked per season. */
function paintFarm(ctx: CanvasRenderingContext2D, q: Quad, bucket: number, season: Season): void {
  const chan = channels((bucket + 0.5) / VARIANTS);
  const layout = pickFarmLayout(chan());
  const wear = CROP[season];
  const soil = { ...wear.soil, h: wear.soil.h + chan() * 10, l: wear.soil.l + chan() * 6 };
  fill(ctx, q, css(soil));
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(q[0][0], q[0][1]);
  for (let i = 1; i < 4; i++) ctx.lineTo(q[i][0], q[i][1]);
  ctx.closePath();
  ctx.clip();
  // crop rows one way or the other across the field, a darker furrow
  // between each pair. The centre is measured, not assembled from corner
  // 0's x and corner 1's y — that only lands on the middle at rest.
  const [cx, cy] = centre(q);
  for (let k = -5; k <= 5; k++) {
    const crop = k % 2 !== 0;
    ctx.strokeStyle = crop ? css(lit(wear.crop, 1)) : css(lit(soil, 0.82), 0.8);
    ctx.lineWidth = crop ? 2 : 1.2;
    ctx.beginPath();
    if (layout.furrowAngle === 0) {
      ctx.moveTo(cx - 34, cy + k * 3.4 - 17);
      ctx.lineTo(cx + 34, cy + k * 3.4 + 17);
    } else {
      ctx.moveTo(cx - 34, cy - k * 3.4 + 17);
      ctx.lineTo(cx + 34, cy - k * 3.4 - 17);
    }
    ctx.stroke();
  }
  ctx.restore();
  // a post-and-rail fence along the street edge
  {
    const [fa, fb] = nearEdge(q);
    ctx.strokeStyle = 'rgba(225, 216, 196, 0.9)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(fa[0], fa[1] - 2.6);
    ctx.lineTo(fb[0], fb[1] - 2.6);
    ctx.stroke();
    ctx.fillStyle = 'rgba(215, 206, 186, 0.95)';
    for (let t = 0.05; t < 1; t += 0.12) {
      ctx.fillRect(fa[0] + (fb[0] - fa[0]) * t - 0.5, fa[1] + (fb[1] - fa[1]) * t - 3.6, 1, 3.6);
    }
  }
  if (chan() > 0.6) {
    // a tractor parked in the field: a lit box with a darker cab and big wheels
    const tx = cx + (layout.barnOx > 0 ? -18 : 18);
    const ty = cy + 6;
    ctx.fillStyle = 'rgba(20, 24, 40, 0.3)';
    ctx.fillRect(tx - 3, ty + 0.5, 8, 2.4);
    ctx.fillStyle = css(lit(hsl(8, 60, 42), LIGHT.right));
    ctx.fillRect(tx - 3, ty - 3, 7, 3.4);
    ctx.fillStyle = css(lit(hsl(8, 60, 42), LIGHT.roof));
    ctx.fillRect(tx - 3, ty - 3.8, 7, 0.9);
    ctx.fillStyle = 'rgba(30, 34, 44, 0.9)';
    ctx.fillRect(tx + 1, ty - 6, 2.6, 3);
    ctx.fillStyle = '#1e2026';
    ctx.beginPath();
    ctx.ellipse(tx - 2, ty + 0.4, 1.6, 1.6, 0, 0, Math.PI * 2);
    ctx.ellipse(tx + 3, ty + 0.4, 1.1, 1.1, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const barnQ = inset(offsetQuad(q, layout.barnOx, layout.barnOy), 0.42);
  const barn = material('timber', hsl(9, 44, 34));
  const r = prism(ctx, barnQ, 10 + chan() * 4, barn, { seed: bucket + 3, windows: 'none' });
  roofCap(ctx, r.roof, 'gabled', barn.body, bucket);
  // the big sliding door, which is what actually says "barn"
  const a = barnQ[2];
  const b = barnQ[3];
  const at = (t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const d1 = at(0.3);
  const d2 = at(0.7);
  fill(ctx, [d1, d2, [d2[0], d2[1] - 7], [d1[0], d1[1] - 7]], css(lit(hsl(30, 20, 26), LIGHT.left)));
  ctx.strokeStyle = css(lit(hsl(38, 22, 74), LIGHT.left * 1.1));
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(d1[0], d1[1] - 7.3);
  ctx.lineTo(d2[0], d2[1] - 7.3);
  ctx.moveTo(d1[0], d1[1]);
  ctx.lineTo(d2[0], d2[1] - 7);
  ctx.stroke();
  if (layout.extra === 'silo') {
    const s = offsetQuad(q, -layout.barnOx, -layout.barnOy);
    const scx = (s[0][0] + s[2][0]) / 2;
    const scy = (s[1][1] + s[3][1]) / 2;
    // corrugated concrete, not bare metal — a white post was reading as a mast
    const body = hsl(38, 12, 56);
    const h = 15;
    ctx.fillStyle = css(lit(body, LIGHT.right));
    ctx.fillRect(scx - 3.4, scy - h, 6.8, h);
    ctx.fillStyle = css(lit(body, LIGHT.left * 1.06));
    ctx.fillRect(scx - 3.4, scy - h, 2.4, h);
    ctx.fillStyle = css(lit(body, LIGHT.right * 0.86), 0.5);
    for (let v = 2; v < h; v += 3) ctx.fillRect(scx - 3.4, scy - v, 6.8, 0.6);
    fill(
      ctx,
      [
        [scx - 3.8, scy - h],
        [scx + 3.8, scy - h],
        [scx, scy - h - 5],
      ],
      css(lit(hsl(206, 8, 46), LIGHT.roof)),
    );
  } else if (layout.extra === 'coop') {
    // a farm pond beside the coop, with a lighter rim of trodden bank
    const pc = centre(offsetQuad(q, -layout.barnOx * 1.4, -layout.barnOy * 1.4));
    ctx.fillStyle = css(hsl(44, 20, 58));
    ctx.beginPath();
    ctx.ellipse(pc[0], pc[1], 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = css(hsl(200, 34, 40));
    ctx.beginPath();
    ctx.ellipse(pc[0], pc[1], 6.5, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    const c = inset(offsetQuad(q, -layout.barnOx * 0.8, -layout.barnOy * 0.8), 0.2);
    const r2 = prism(ctx, c, 5, material('timber', hsl(34, 26, 52)), { seed: bucket });
    roofCap(ctx, r2.roof, 'gabled', hsl(34, 26, 52), bucket + 1);
  }
}

/**
 * Sprite padding. Every pixel here is paid for on every distinct lot in the
 * city, so the box is only as big as what actually overhangs: props and masts
 * above the roof, and nothing much to the sides — the archetype invariant
 * keeps masses inside the tile diamond.
 */
const GROWABLE_MARGIN_X = 7;
const GROWABLE_MARGIN_BOT = 10;
/** Headroom over the mass: a crown as well as a mast once it's tall enough. */
function marginTop(h: number): number {
  return h > 62 ? 56 : 30;
}

interface LotKey {
  zone: Zone;
  stage: Stage;
  tier: Tier;
  bucket: number;
  size: number;
  abandoned: boolean;
  glow: boolean;
  /** Set for farms only: a field is the one growable that wears the season. */
  season?: Season;
}

/** Industrial growable stack placement — shared by the bake and stackTips. */
export function industryStacks(
  stage: Stage,
  kind: 'dirty' | 'manu',
  hw: number,
  hh: number,
  h: number,
): { x: number; y: number; w: number; stackH: number }[] {
  const stackH = 18 + stage * 3;
  const out = [{ x: hw * 0.34, y: hh * 0.2 - h, w: 3.2, stackH }];
  if (kind === 'dirty' && stage >= 3) {
    out.push({ x: -hw * 0.34 * 0.4, y: hh * 0.2 * 1.6 - h, w: 2.6, stackH: stackH * 0.7 });
  }
  return out;
}

/**
 * Bake one growable lot. Everything static about it — masses, materials,
 * windows, roof, signage — lands in a bitmap that is afterwards copied in a
 * single call, which is what makes this much detail affordable at all.
 */
function paintLot(ctx: CanvasRenderingContext2D, k: LotKey): void {
  const { zone, stage, tier, bucket, size, abandoned, glow } = k;
  const kind = normalizeTier(zone, tier);
  const fam = familyOf(zone, tier);
  const half = (bucket + 0.5) / VARIANTS;
  const chan = channels(half);
  const hw = (TILE_W * size) / 2;
  const hh = (TILE_H * size) / 2;
  const base = { cx: 0, cy: 0 };
  const tile = diamond(0, 0, hw, hh);

  if (fam === 'ag' && !abandoned) {
    if (!glow) paintFarm(ctx, tile, bucket, k.season ?? 'summer');
    return;
  }

  const h = growableHeight(zone, stage, tier, bucket);
  // channel order is load-bearing: archetype, style, swatch, jitter —
  // hearthTip replays the first draw to find the chimney the bake placed
  const arch: Archetype = pickArchetype(zone, tier, stage, chan());
  const style = styleFor(fam, stage, chan());
  const sw = swatch(pickSwatch(arch, chan()));
  const jitter = chan();
  let body: Hsl = {
    h: (sw.body.h + Math.floor(jitter * 9) - 4 + 360) % 360,
    s: sw.body.s,
    l: Math.max(0, Math.min(100, sw.body.l + (hash2(bucket, stage, 5) - 0.5) * 6)),
  };
  if (abandoned) body = { h: body.h, s: 5, l: 30 };
  const skinned = getSkin().building(body.h, body.s, body.l);
  body = { h: skinned[0], s: skinned[1], l: skinned[2] };
  const mat = abandoned ? material('render', body) : materialOf(sw, body);

  const budget = footprintBudget(stage);
  // Back to front by the *centre* of each mass, and — critically — shortest
  // first when two masses share a centre. Sorting by the south corner put a
  // wide low podium after the slender tower standing on it, which painted the
  // podium's roof cap straight across the tower's face.
  const masses = arch.boxes
    .map((sb) => {
      const e = boxExtent(sb);
      const c = tileOffset(sb.ox * budget, sb.oy * budget);
      const plan = tileRect(c[0] + base.cx, c[1] + base.cy, (e.w * budget) / 2, (e.d * budget) / 2);
      return { sb, q: sb.chamfer ? chamfer(plan, sb.chamfer) : (plan as Pt[]) };
    })
    .sort((a, b) => centre(a.q)[1] - centre(b.q)[1] || a.sb.hf - b.sb.hf);

  const ink = glow ? 0 : getSkin().outline;
  let primary: { roof: Pt[]; walls: [Pt, Pt][] } | null = null;
  for (const { sb, q } of masses) {
    const mh = h * sb.hf;
    const r = prism(ctx, q, mh, mat, {
      seed: bucket * 13 + stage,
      windows: abandoned ? 'punched' : arch.windows,
      glow,
      occupied: !abandoned,
      noRoof: false,
      // the dressing belongs to the mass that reaches full height — a podium
      // under a tower gets the podium treatment from its own recipe instead
      facade: sb.hf === 1 && !abandoned ? arch.facade : undefined,
      // a pitched roof overhangs the wall and throws a band of shade down it
      // — the roof the plan can actually carry, not the one the archetype asks for
      eaveShadow: sb.hf === 1 && pitched(effectiveRoofStyle(raise(q, mh), arch.roof)) ? 3.5 : undefined,
    });
    if (ink > 0) {
      // Cartoon ink goes on each mass *as it is drawn*, so a mass in front
      // paints over the ink of the one behind. Inking the tallest mass once
      // at the end drew its outline straight across everything standing in
      // front of it.
      ctx.strokeStyle = 'rgba(28, 20, 32, 0.9)';
      ctx.lineWidth = ink;
      for (const [a, b] of r.walls) {
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.lineTo(b[0], b[1] - mh);
        ctx.lineTo(a[0], a[1] - mh);
        ctx.closePath();
        ctx.stroke();
      }
    }
    if (sb.hf === 1) primary = { roof: r.roof, walls: r.walls };
  }
  if (primary && glow && zone === Zone.Commercial && stage >= 1) {
    // a shop's glazing spills light onto the pavement after dark
    for (const [p, q2] of primary.walls) {
      fill(ctx, [p, q2, [q2[0], q2[1] - 6.5], [p[0], p[1] - 6.5]], css(LAMP, 0.55));
    }
  }
  if (!primary || glow) return;

  let top = primary.roof;
  if (h > 62 && arch.roof !== 'gabled' && arch.roof !== 'sawtooth') {
    top = towerCrown(ctx, primary.roof, mat, body, bucket * 11 + stage);
  } else {
    roofCap(ctx, primary.roof, arch.roof, body, bucket, mat);
    if (style.lip && arch.roof === 'flat') {
      parapet(ctx, primary.roof, material('concrete', mix(body, hsl(212, 6, 60), 0.55)), 1.8);
    }
  }
  if (!abandoned) {
    const crowned = top !== primary.roof;
    roofKit(
      ctx, top, arch.props, body, bucket * 7 + 1, h,
      !crowned && wantsHatch(effectiveRoofStyle(primary.roof, arch.roof)),
    );
    const ent = entityFor(zone, kind, stage, half);
    streetLevel(
      ctx,
      primary.walls,
      zone,
      stage,
      mat,
      bucket * 5 + 2,
      ent ? ent.hue : null,
      ent ? ent.initials : null,
    );
    tierAccents(ctx, top, zone, kind, stage, bucket * 3 + stage);
  } else {
    // boarded up: planks over the openings and a broken roofline
    ctx.strokeStyle = 'rgba(48, 38, 28, 0.85)';
    ctx.lineWidth = 2;
    for (const [p, q2] of primary.walls) {
      for (const t of [0.35, 0.62]) {
        ctx.beginPath();
        ctx.moveTo(p[0] + (q2[0] - p[0]) * 0.15, p[1] + (q2[1] - p[1]) * 0.15 - h * t);
        ctx.lineTo(p[0] + (q2[0] - p[0]) * 0.85, p[1] + (q2[1] - p[1]) * 0.85 - h * t - 3);
        ctx.stroke();
      }
    }
  }

  if (zone === Zone.Industrial && stage >= 2 && !abandoned && (kind === 'dirty' || kind === 'manu')) {
    const stacks = industryStacks(stage, kind, hw, hh, h);
    // pipe runs along the roof: between the two stacks of a dirty works, or
    // from the single stack back across the roof of a manufacturing shed
    const pipe = hsl(205, 6, 58);
    if (stacks.length >= 2) {
      pipeRun(ctx, [stacks[0].x, stacks[0].y - 4], [stacks[1].x, stacks[1].y - 4], 1.4, pipe);
    } else if (stacks.length === 1) {
      pipeRun(ctx, [stacks[0].x, stacks[0].y - 3], [stacks[0].x - hw * 0.4, stacks[0].y - 3 + hh * 0.2], 1.2, pipe);
    }
    for (const [i2, st] of stacks.entries()) {
      const q2 = diamond(st.x, st.y, st.w, st.w / 2);
      prism(ctx, q2, st.stackH, material('brick', hsl(16, 22 - i2 * 2, 34 - i2 * 4)), {
        seed: bucket + i2,
        groundAo: false,
      });
      ctx.fillStyle = 'rgba(30, 26, 24, 0.8)';
      ctx.fillRect(st.x - st.w - 0.2, st.y - st.stackH - 2, st.w * 2 + 0.4, 2.4);
    }
  }
}

/** The small marks that make wealth and industry type legible at a glance. */
function tierAccents(
  ctx: CanvasRenderingContext2D,
  roof: Pt[],
  zone: Zone,
  tier: Tier,
  stage: Stage,
  seed = 0,
): void {
  const rc = zone === Zone.Residential || zone === Zone.Commercial;
  const cx = (roof[0][0] + roof[2][0]) / 2;
  const cy = (roof[1][1] + roof[3][1]) / 2;
  if (rc && tier === 3 && stage >= 6 && hash2(seed, 12, 883) > 0.72) {
    // A gilded mast marks a prestige tower — but only some of them. Giving one
    // to every §§§ lot turned a wealthy downtown into a pin cushion.
    ctx.strokeStyle = '#e8e2d2';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy - 18);
    ctx.stroke();
    ctx.fillStyle = '#ffd76a';
    ctx.fillRect(cx - 1.2, cy - 20, 2.4, 2.4);
  } else if (rc && tier === 1) {
    // a poorer lot's roof is a little dirtier, and that is all it takes
    fill(ctx, roof, 'rgba(38, 34, 28, 0.14)');
  }
}

function lotSprite(k: LotKey): Sprite {
  const h = k.stage > 0 ? growableHeight(k.zone, k.stage, k.tier, k.bucket) : 0;
  const hw = (TILE_W * k.size) / 2;
  const hh = (TILE_H * k.size) / 2;
  const ay = h + hh + marginTop(h);
  const key = `L${k.zone}.${k.stage}.${k.tier}.${k.bucket}.${k.size}${k.abandoned ? 'a' : ''}${
    k.glow ? 'g' : ''
  }${k.season ? '.' + k.season.slice(0, 2) : ''}${getSkin().id}`;
  return sprite(
    key,
    {
      w: hw * 2 + GROWABLE_MARGIN_X * 2,
      h: ay + hh + GROWABLE_MARGIN_BOT,
      ax: hw + GROWABLE_MARGIN_X,
      ay,
    },
    (ctx) => {
      paintLot(ctx, k);
      if (k.glow) return;
      // photographic grain over the finished bake — in device pixels, so the
      // transform the cache set up for the painter is stood down first
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      grain(ctx, ctx.canvas.width, ctx.canvas.height, 0.03, k.bucket * 31 + k.stage);
      ctx.restore();
    },
    k.glow ? 1 : undefined,
  );
}

/**
 * The trees on a plot, drawn live over the baked ground so the season's own
 * sprite stands there. Positions come from the same layout the ground was
 * baked from, so a tree never lands on the driveway.
 */
export function drawYardTrees(
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
  const lay = layoutLot(zone, tier, stage, bucket, size, side, desert);
  let k = 0;
  for (const [dx, dy] of treePositions(lay, size)) {
    drawTree(
      ctx,
      geom.cx + dx,
      geom.cy + dy,
      desert ? 'palm' : k % 3 === 2 ? 'conifer' : 'broadleaf',
      12 + hash2(k, bucket, 5) * 7,
      (bucket + k) % 6,
      season,
    );
    k++;
  }
}

// ---------------------------------------------------------------------------
// Civic, utility and transit buildings
// ---------------------------------------------------------------------------

interface CivicSpec {
  h: number;
  f: number;
  /** What it is built of — a swatch id from the palette's library. */
  swatch: string;
  windows: WindowPattern;
  roof: RoofStyle;
  facade?: Facade;
  props?: PropKind[];
}

const CIVIC: Partial<Record<Zone, CivicSpec>> = {
  [Zone.FireStation]: {
    h: 19, f: 0.82, swatch: 'brick-red', windows: 'punched', roof: 'parapet',
    facade: { podium: 1 }, props: ['vent'],
  },
  [Zone.PoliceStation]: {
    h: 19, f: 0.82, swatch: 'stone-granite', windows: 'punched', roof: 'parapet',
    facade: { cornice: true, stringCourse: 1 }, props: ['acUnit'],
  },
  [Zone.Hospital]: {
    h: 26, f: 0.84, swatch: 'render-white', windows: 'ribbon', roof: 'flat',
    facade: { podium: 1, stringCourse: 2 }, props: ['acUnit', 'vent', 'helipad'],
  },
  [Zone.School]: {
    h: 14, f: 0.86, swatch: 'brick-buff', windows: 'punched', roof: 'gabled',
    facade: { cornice: true }, props: ['skylight'],
  },
  [Zone.Prison]: {
    h: 12, f: 0.88, swatch: 'concrete-board', windows: 'none', roof: 'flat',
    facade: { stringCourse: 1 }, props: ['vent'],
  },
  [Zone.BusStop]: { h: 7, f: 0.42, swatch: 'metal-aluminium', windows: 'ribbon', roof: 'flat' },
  [Zone.StreetcarStop]: { h: 8, f: 0.46, swatch: 'metal-aluminium', windows: 'ribbon', roof: 'flat' },
  [Zone.MonorailStation]: { h: 7, f: 0.48, swatch: 'concrete-precast', windows: 'ribbon', roof: 'flat' },
  [Zone.SubwayStation]: { h: 7, f: 0.46, swatch: 'concrete-painted', windows: 'none', roof: 'flat' },
  [Zone.RailTerminal]: {
    h: 18, f: 0.82, swatch: 'brick-brown', windows: 'punched', roof: 'gabled',
    facade: { pilasters: true, cornice: true },
  },
  [Zone.RecyclingCentre]: {
    h: 16, f: 0.72, swatch: 'metal-corrugated', windows: 'ribbon', roof: 'sawtooth',
    props: ['skylight', 'vent'],
  },
  [Zone.Incinerator]: {
    h: 21, f: 0.76, swatch: 'concrete-board', windows: 'ribbon', roof: 'flat',
    props: ['vent', 'tank'],
  },
  [Zone.WaterPump]: { h: 13, f: 0.6, swatch: 'render-grey', windows: 'punched', roof: 'flat' },
  [Zone.PowerPlant]: {
    h: 22, f: 0.86, swatch: 'concrete-board', windows: 'ribbon', roof: 'flat',
    props: ['tank', 'vent'],
  },
  [Zone.SolarPlant]: { h: 4, f: 0.82, swatch: 'concrete-painted', windows: 'none', roof: 'flat' },
  [Zone.HydroPlant]: {
    h: 15, f: 0.72, swatch: 'concrete-precast', windows: 'ribbon', roof: 'flat',
    props: ['vent'],
  },
  [Zone.NuclearPlant]: { h: 12, f: 0.8, swatch: 'concrete-precast', windows: 'ribbon', roof: 'flat' },
  [Zone.WindTurbine]: { h: 4, f: 0.3, swatch: 'metal-white', windows: 'none', roof: 'flat' },
};

/** Whether a roof form overhangs the wall on an eave. */
function pitched(style: RoofStyle): boolean {
  return style === 'gabled' || style === 'hipped' || style === 'mansard';
}

/** The civic table, read-only, for tests that hold the bakes to it. */
export const CIVIC_SPECS: Readonly<Partial<Record<Zone, CivicSpec>>> = CIVIC;

/** The swatch a civic building is built of, or null for anything else. */
export function civicSwatch(zone: Zone): string | null {
  return CIVIC[zone]?.swatch ?? null;
}

/** How tall a zone's mass stands, for the shadow pass. */
export function massHeight(zone: Zone, stage: Stage, tier: Tier, bucket: number): number {
  const authored = buildingBySlot(zone);
  if (authored?.visual) return authored.visual.height * getSkin().heightScale;
  if (REWARD_HEIGHT[zone] !== undefined) return REWARD_HEIGHT[zone]! * getSkin().heightScale;
  const civic = CIVIC[zone];
  if (civic) return civic.h * getSkin().heightScale;
  if (zone === Zone.Park || zone === Zone.PowerLine || zone === Zone.WaterPipe) return 0;
  if (zone === Zone.Residential || zone === Zone.Commercial || zone === Zone.Industrial) {
    if (stage === 0) return 0;
    if (zone === Zone.Industrial && normalizeTier(zone, tier) === 'ag') return 12;
    return growableHeight(zone, stage, tier, bucket);
  }
  return 0;
}

/** The footprint fraction a zone's mass occupies, for the shadow pass. */
export function massFootprint(zone: Zone, stage: Stage): number {
  const authored = buildingBySlot(zone);
  if (authored?.visual) return authored.visual.footprint;
  if (REWARD_HEIGHT[zone] !== undefined) return 0.9;
  const civic = CIVIC[zone];
  if (civic) return civic.f;
  if (zone === Zone.Residential || zone === Zone.Commercial || zone === Zone.Industrial) {
    return stage === 0 ? 0 : footprintBudget(stage);
  }
  return 0;
}

/** Civic stack geometry — one source for the painter and the ambient pass. */
export const COAL_STACKS = [[-16, 26], [-3, 32]] as const;
export const INCINERATOR_STACK = { dx: 8, h: 38 } as const;
export const NUCLEAR_TOWER = { dx: 15, dy: -2, h: 32 } as const;

/** Headroom a civic bake keeps over its roof: stacks, masts and the nuclear
 * cooling tower stand well over the mass. */
const CIVIC_MARGIN_TOP = 70;
const CIVIC_MARGIN_X = 20;

/** The skinned material a civic spec is built of. */
function civicMaterial(spec: CivicSpec): { body: Hsl; mat: Material } {
  const sw = swatch(spec.swatch);
  const skinned = getSkin().building(sw.body.h, sw.body.s, sw.body.l);
  const body: Hsl = { h: skinned[0], s: skinned[1], l: skinned[2] };
  return { body, mat: materialOf(sw, body) };
}

/**
 * Paint a civic building with its tile centre at the origin — the bake's
 * frame. Everything the old live painter did, less the no-power bolt, which
 * stays live because it is a state marker rather than architecture.
 */
function paintCivic(
  ctx: CanvasRenderingContext2D,
  spec: CivicSpec,
  zone: Zone,
  powered: boolean,
  detail: 0 | 1 | 2,
): void {
  const s = getSkin();
  const { body, mat } = civicMaterial(spec);
  const h = spec.h * s.heightScale;
  const tileQ = diamond(0, 0, TILE_W / 2, TILE_H / 2);
  const q = inset(tileQ, spec.f);
  const cx = 0;
  const cy = 0;
  contactShadow(ctx, q);
  const eff = effectiveRoofStyle(raise(q, h), spec.roof);
  const r = prism(ctx, q, h, mat, {
    seed: zone * 7 + 1,
    windows: spec.windows,
    facade: spec.facade,
    eaveShadow: pitched(eff) ? 3.5 : undefined,
  });
  roofCap(ctx, r.roof, spec.roof, body, zone, mat);
  if (detail >= 1 && spec.props?.length) {
    roofKit(ctx, r.roof, spec.props, body, zone * 3 + 5, h, wantsHatch(eff));
  }

  switch (zone) {
    case Zone.FireStation: {
      // engine bay doors and a hose tower. The doors go on whichever edge
      // faces the viewer, or a turned camera puts them round the back.
      const [a, b] = nearEdge(q);
      for (const t of [0.24, 0.58]) {
        const p1: Pt = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        const p2: Pt = [a[0] + (b[0] - a[0]) * (t + 0.2), a[1] + (b[1] - a[1]) * (t + 0.2)];
        fill(ctx, [p1, p2, [p2[0], p2[1] - 10], [p1[0], p1[1] - 10]], 'rgba(226, 226, 222, 0.9)');
        ctx.strokeStyle = 'rgba(60, 40, 36, 0.5)';
        ctx.lineWidth = 0.7;
        for (let k = 1; k < 4; k++) {
          ctx.beginPath();
          ctx.moveTo(p1[0], p1[1] - k * 2.4);
          ctx.lineTo(p2[0], p2[1] - k * 2.4);
          ctx.stroke();
        }
      }
      prism(ctx, diamond(cx + 12, cy - h - 4, 4, 2), 12, mat, { seed: 3, groundAo: false });
      break;
    }
    case Zone.PoliceStation: {
      ctx.fillStyle = powered ? '#4aa8ff' : '#5a6470';
      ctx.fillRect(cx - 6, cy - h - 9, 12, 3.5);
      ctx.fillStyle = 'rgba(240, 244, 250, 0.9)';
      ctx.fillRect(cx - 6, cy - h - 9, 12, 1);
      break;
    }
    case Zone.Hospital: {
      ctx.fillStyle = '#d8443a';
      ctx.fillRect(cx - 2, cy - h - 12, 4, 12);
      ctx.fillRect(cx - 6, cy - h - 8, 12, 4);
      break;
    }
    case Zone.School: {
      // a small yard with a court marking
      ctx.strokeStyle = 'rgba(240, 244, 250, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(cx + 16, cy + 6, 7, 3.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case Zone.Prison: {
      // perimeter wall with a watchtower on the near corner
      ctx.strokeStyle = css(lit(body, LIGHT.roof * 1.1));
      ctx.lineWidth = 2;
      const w = inset(tileQ, 0.98);
      ctx.beginPath();
      ctx.moveTo(w[0][0], w[0][1]);
      for (let i = 1; i < 4; i++) ctx.lineTo(w[i][0], w[i][1]);
      ctx.closePath();
      ctx.stroke();
      prism(ctx, diamond(cx - 22, cy + 2, 4, 2), 20, material('concrete', body), { seed: 5 });
      ctx.fillStyle = powered ? 'rgba(255, 236, 170, 0.9)' : 'rgba(110, 116, 124, 0.9)';
      ctx.fillRect(cx - 26, cy - 22, 8, 3);
      break;
    }
    case Zone.PowerPlant: {
      for (const [dx, sh] of COAL_STACKS) {
        prism(ctx, diamond(cx + dx, cy - h + 4, 4, 2), sh, material('brick', hsl(18, 16, 36)), {
          seed: 9,
          groundAo: false,
        });
        ctx.fillStyle = 'rgba(30, 26, 24, 0.8)';
        ctx.fillRect(cx + dx - 4.4, cy - h + 2 - sh, 8.8, 2.6);
      }
      // coal heap and a conveyor
      fill(
        ctx,
        [
          [cx + 8, cy + 6],
          [cx + 20, cy + 1],
          [cx + 26, cy + 6],
          [cx + 15, cy + 11],
        ],
        'hsl(24 10% 22%)',
      );
      break;
    }
    case Zone.SolarPlant: {
      const panel = hsl(218, 56, 40);
      for (let k = -1; k <= 1; k++) {
        const oy = k * 8;
        fill(
          ctx,
          [
            [cx - 18 + k * 4, cy - 4 + oy],
            [cx + 6 + k * 4, cy - 16 + oy],
            [cx + 14 + k * 4, cy - 12 + oy],
            [cx - 10 + k * 4, cy + oy],
          ],
          css(lit(panel, LIGHT.roof)),
        );
        ctx.strokeStyle = css(lit(panel, LIGHT.roof * 1.5), 0.55);
        ctx.lineWidth = 0.8;
        for (let t = 0.25; t < 1; t += 0.25) {
          ctx.beginPath();
          ctx.moveTo(cx - 18 + k * 4 + 24 * t, cy - 4 + oy - 12 * t);
          ctx.lineTo(cx - 10 + k * 4 + 24 * t, cy + oy - 12 * t);
          ctx.stroke();
        }
      }
      break;
    }
    case Zone.WindTurbine: {
      const mast = 40;
      ctx.strokeStyle = 'rgba(238, 242, 246, 0.95)';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 3);
      ctx.lineTo(cx, cy - mast);
      ctx.stroke();
      ctx.lineWidth = 1.8;
      for (const a of [Math.PI / 2, Math.PI / 2 + (2 * Math.PI) / 3, Math.PI / 2 + (4 * Math.PI) / 3]) {
        ctx.beginPath();
        ctx.moveTo(cx, cy - mast);
        ctx.quadraticCurveTo(
          cx + Math.cos(a) * 7,
          cy - mast - Math.sin(a) * 7,
          cx + Math.cos(a) * 14,
          cy - mast - Math.sin(a) * 14,
        );
        ctx.stroke();
      }
      ctx.fillStyle = '#d23b30';
      ctx.fillRect(cx - 1.6, cy - mast - 1.6, 3.2, 3.2);
      break;
    }
    case Zone.HydroPlant: {
      ctx.strokeStyle = css(lit(hsl(206, 8, 62), LIGHT.right));
      ctx.lineWidth = 4;
      for (const dx of [-6, 4]) {
        ctx.beginPath();
        ctx.moveTo(cx + dx, cy - h);
        ctx.lineTo(cx + dx + 8, cy + 4);
        ctx.stroke();
      }
      fill(
        ctx,
        [
          [cx + 2, cy + 4],
          [cx + 16, cy + 9],
          [cx + 5, cy + 12],
        ],
        'rgba(226, 244, 252, 0.85)',
      );
      break;
    }
    case Zone.NuclearPlant: {
      // the waisted cooling tower, with steam if it is running
      const tx = cx + NUCLEAR_TOWER.dx;
      const ty = cy + NUCLEAR_TOWER.dy;
      fill(
        ctx,
        [
          [tx - 9, ty],
          [tx + 9, ty],
          [tx + 6, ty - (NUCLEAR_TOWER.h - 10)],
          [tx - 6, ty - (NUCLEAR_TOWER.h - 10)],
        ],
        css(lit(hsl(40, 5, 66), LIGHT.right)),
      );
      fill(
        ctx,
        [
          [tx - 9, ty],
          [tx - 3, ty],
          [tx - 2, ty - (NUCLEAR_TOWER.h - 10)],
          [tx - 6, ty - (NUCLEAR_TOWER.h - 10)],
        ],
        css(lit(hsl(40, 5, 66), LIGHT.left * 1.1)),
      );
      fill(
        ctx,
        [
          [tx - 6, ty - (NUCLEAR_TOWER.h - 10)],
          [tx + 6, ty - (NUCLEAR_TOWER.h - 10)],
          [tx + 8, ty - NUCLEAR_TOWER.h],
          [tx - 8, ty - NUCLEAR_TOWER.h],
        ],
        css(lit(hsl(40, 5, 72), LIGHT.roof * 0.9)),
      );
      break;
    }
    case Zone.Incinerator: {
      prism(
        ctx,
        diamond(cx + INCINERATOR_STACK.dx, cy - h + 3, 4, 2),
        INCINERATOR_STACK.h,
        material('concrete', hsl(24, 8, 50)),
        { seed: 4, groundAo: false },
      );
      ctx.fillStyle = 'rgba(30, 26, 24, 0.8)';
      ctx.fillRect(cx + 3.4, cy - h - 36, 9, 2.6);
      break;
    }
    case Zone.RecyclingCentre: {
      if (detail >= 1) {
        ['#2f7fbf', '#3f9f56', '#c9a227'].forEach((c, i) => {
          const bq = diamond(cx - 14 + i * 11, cy + 7, 4.4, 2.2);
          prism(ctx, bq, 5, material('metal', hsl(i === 0 ? 208 : i === 1 ? 136 : 46, 44, 44)), {
            seed: i,
          });
          void c;
        });
      }
      break;
    }
    case Zone.WaterPump: {
      const p = hsl(200, 34, 62);
      ctx.fillStyle = css(lit(p, LIGHT.right));
      ctx.fillRect(cx - 3, cy - h - 13, 6, 13);
      ctx.fillStyle = css(lit(p, LIGHT.left * 1.1));
      ctx.fillRect(cx - 3, cy - h - 13, 2, 13);
      ctx.fillStyle = css(lit(hsl(206, 40, 34), LIGHT.roof));
      ctx.fillRect(cx - 4.4, cy - h - 15.4, 8.8, 2.6);
      break;
    }
    case Zone.BusStop:
    case Zone.StreetcarStop: {
      ctx.strokeStyle = 'rgba(206, 214, 212, 0.95)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(cx + 11, cy + 3);
      ctx.lineTo(cx + 11, cy - (zone === Zone.StreetcarStop ? 22 : 16));
      ctx.stroke();
      ctx.fillStyle = '#2fa38f';
      ctx.fillRect(cx + 11, cy - (zone === Zone.StreetcarStop ? 22 : 16), 6.5, 5);
      if (zone === Zone.StreetcarStop) {
        ctx.strokeStyle = 'rgba(206, 214, 212, 0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - 16, cy - 19);
        ctx.lineTo(cx + 16, cy - 19);
        ctx.stroke();
      }
      break;
    }
    case Zone.MonorailStation: {
      prism(ctx, diamond(cx, cy, 3, 1.5), 24, material('concrete', hsl(206, 6, 58)), { seed: 2 });
      fill(
        ctx,
        [
          [cx - 16, cy - 25],
          [cx + 16, cy - 25],
          [cx + 16, cy - 22],
          [cx - 16, cy - 22],
        ],
        css(lit(hsl(206, 6, 50), LIGHT.roof)),
      );
      ctx.fillStyle = '#eef2f4';
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(cx - 11, cy - 34, 22, 9, 3.5);
        ctx.fill();
      } else {
        ctx.fillRect(cx - 11, cy - 34, 22, 9);
      }
      ctx.fillStyle = '#3f8f8a';
      ctx.fillRect(cx - 8, cy - 32, 16, 3);
      break;
    }
    case Zone.SubwayStation: {
      fill(
        ctx,
        [
          [cx - 9, cy + 3],
          [cx + 2, cy - 2],
          [cx + 7, cy + 1],
          [cx - 4, cy + 6],
        ],
        '#181c22',
      );
      ctx.strokeStyle = 'rgba(206, 214, 212, 0.95)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(cx + 11, cy + 2);
      ctx.lineTo(cx + 11, cy - 18);
      ctx.stroke();
      ctx.fillStyle = powered ? '#2456c8' : '#3a4050';
      ctx.fillRect(cx + 6.5, cy - 26, 9.5, 8.5);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 7px sans-serif';
      ctx.fillText('M', cx + 8.5, cy - 19.5);
      break;
    }
    case Zone.RailTerminal: {
      ctx.fillStyle = '#f2efe6';
      ctx.beginPath();
      ctx.arc(cx - 2, cy - h - 6, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#3a3630';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - 2, cy - h - 6);
      ctx.lineTo(cx - 2, cy - h - 9);
      ctx.moveTo(cx - 2, cy - h - 6);
      ctx.lineTo(cx + 0.2, cy - h - 5);
      ctx.stroke();
      break;
    }
    default:
      break;
  }
}

/** The civic building's daylight sprite, baked once per zone, power state,
 * detail level and skin. */
function civicSprite(zone: Zone, spec: CivicSpec, powered: boolean, detail: 0 | 1 | 2): Sprite {
  const h = spec.h * getSkin().heightScale;
  const w = TILE_W + CIVIC_MARGIN_X * 2;
  const ht = h + TILE_H + CIVIC_MARGIN_TOP + 8;
  // detail only tells 0 from 1+ in the painter, so the key says no more —
  // or zooming in would re-bake the same picture
  return sprite(
    `V${zone}.${powered ? 1 : 0}.${detail ? 1 : 0}.${getSkin().id}`,
    { w, h: ht, ax: w / 2, ay: ht - TILE_H / 2 - 8 },
    (c) => {
      paintCivic(c, spec, zone, powered, detail);
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      grain(c, c.canvas.width, c.canvas.height, 0.03, zone * 3 + 1);
      c.restore();
    },
  );
}

/** Only the lit panes of the main mass, on transparent black, for the night
 * overlay — the growables' glow bake, for the civic set. */
function civicGlowSprite(zone: Zone, spec: CivicSpec): Sprite {
  const h = spec.h * getSkin().heightScale;
  const w = TILE_W + CIVIC_MARGIN_X * 2;
  const ht = h + TILE_H + CIVIC_MARGIN_TOP + 8;
  return sprite(
    `Vg${zone}.${getSkin().id}`,
    { w, h: ht, ax: w / 2, ay: ht - TILE_H / 2 - 8 },
    (c) => {
      const { mat } = civicMaterial(spec);
      const q = inset(diamond(0, 0, TILE_W / 2, TILE_H / 2), spec.f);
      // the same facade as the daylight bake: a podium lifts the first row
      // of windows, and the lit rows have to lift with it
      prism(c, q, h, mat, {
        seed: zone * 7 + 1,
        windows: spec.windows,
        facade: spec.facade,
        glow: true,
      });
    },
    1,
  );
}

function drawCivic(
  ctx: CanvasRenderingContext2D,
  geom: TileGeom,
  zone: Zone,
  powered: boolean,
  detail: 0 | 1 | 2,
  night: number,
): boolean {
  const spec = CIVIC[zone];
  if (!spec) return false;
  const { cx, cy } = geom;
  blit(ctx, civicSprite(zone, spec, powered, detail), cx, cy);
  if (night > 0.06 && powered && spec.windows !== 'none') {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    blit(ctx, civicGlowSprite(zone, spec), cx, cy, Math.min(0.55, night * 0.8));
    ctx.restore();
  }
  if (!powered) drawNoPowerBolt(ctx, cx, cy - spec.h * getSkin().heightScale - 14);
  return true;
}

// ---------------------------------------------------------------------------
// Ambient emitters — shared by the bake and the live smoke/steam pass
// ---------------------------------------------------------------------------

/** Every stack a building smokes or steams from, lot-local to its draw centre. */
export function stackTips(zone: Zone, stage: Stage, tier: Tier, bucket: number, size: number): StackTip[] {
  const authored = buildingBySlot(zone);
  if (authored?.visual) {
    const v = authored.visual;
    const h = v.height * getSkin().heightScale;
    const props = v.props.slice(0, MAX_BUILDING_PROPS);
    return props.flatMap((p, i) =>
      p === 'smokestack'
        ? [{ x: (i - (props.length - 1) / 2) * 10, y: -h + 2 - 20, kind: 'smoke' as const, s: 0.8 }]
        : [],
    );
  }
  if (zone === Zone.Industrial && stage >= 2) {
    const kind = normalizeTier(zone, tier);
    if (kind !== 'dirty' && kind !== 'manu') return [];
    const hw = (TILE_W * size) / 2;
    const hh = (TILE_H * size) / 2;
    const h = growableHeight(zone, stage, tier, bucket);
    return industryStacks(stage, kind, hw, hh, h).map((st, i) => ({
      x: st.x, y: st.y - st.stackH - 2, kind: 'smoke', s: i === 0 ? 1 : 0.7,
    }));
  }
  const h = massHeight(zone, stage, tier, bucket);
  if (zone === Zone.PowerPlant) {
    return COAL_STACKS.map(([dx, sh]) => ({ x: dx, y: -h + 2 - sh, kind: 'smoke' as const, s: 1 }));
  }
  if (zone === Zone.Incinerator) {
    return [{ x: INCINERATOR_STACK.dx, y: -h + 3 - INCINERATOR_STACK.h, kind: 'smoke', s: 0.8 }];
  }
  if (zone === Zone.NuclearPlant) {
    return [{ x: NUCLEAR_TOWER.dx, y: NUCLEAR_TOWER.dy - NUCLEAR_TOWER.h - 2, kind: 'steam', s: 1.3 }];
  }
  return [];
}

/** The chimney a low-rise home would vent in winter — null when its archetype
 * has none. Replays the exact placement the bake used via placeRoofProps. */
export function hearthTip(zone: Zone, stage: Stage, tier: Tier, bucket: number): StackTip | null {
  if (zone !== Zone.Residential || stage < 1 || stage > 3) return null;
  const half = (bucket + 0.5) / VARIANTS;
  const chan = channels(half);
  const arch = pickArchetype(zone, tier, stage, chan());
  if (!arch.props.includes('chimney')) return null;
  const h = growableHeight(zone, stage, tier, bucket);
  const budget = footprintBudget(stage);
  const sb = arch.boxes.find((b) => b.hf === 1);
  if (!sb) return null;
  const e = boxExtent(sb);
  const c = tileOffset(sb.ox * budget, sb.oy * budget);
  const plan = tileRect(c[0], c[1], (e.w * budget) / 2, (e.d * budget) / 2);
  const q = sb.chamfer ? chamfer(plan, sb.chamfer) : (plan as Pt[]);
  const roof = raise(q, h);
  const hit = placeRoofProps(arch.props, roof, bucket * 7 + 1).find((p) => p.kind === 'chimney');
  if (!hit) return null;
  // vent from the cap of the exact prism roofKit's chimney case bakes
  return { x: hit.x, y: hit.y - chimneyHeight(hit.k + 1, bucket * 7 + 1), kind: 'hearth', s: 0.55 };
}

// ---------------------------------------------------------------------------
// Rewards
// ---------------------------------------------------------------------------

const REWARD_HEIGHT: Partial<Record<Zone, number>> = {
  [Zone.Ballpark]: 14,
  [Zone.Arena]: 20,
  [Zone.Stadium]: 26,
  [Zone.Colosseum]: 30,
  [Zone.Library]: 20,
  [Zone.Museum]: 28,
  [Zone.Monument]: 62,
  [Zone.College]: 20,
  [Zone.University]: 27,
  [Zone.ResearchUniversity]: 34,
  [Zone.FusionPlant]: 20,
};

/** Slots the reward painter owns; everything else falls through to its own art. */
const REWARD_ZONES = new Set<Zone>(Object.keys(REWARD_HEIGHT).map(Number) as Zone[]);

/**
 * Paint a reward with its block centre at the origin — the bake's frame. The
 * geometry is measured from the footprint quad, never indexed, so the same
 * bake is right at every quarter turn.
 */
function paintReward(
  ctx: CanvasRenderingContext2D,
  zone: Zone,
  powered: boolean,
  detail: 0 | 1 | 2,
  size: number,
): void {
  const cx = 0;
  const cy = 0;
  const q = diamond(0, 0, (TILE_W * size) / 2, (TILE_H * size) / 2);
  const [hw, hh] = halfExtent(q);
  const skin = getSkin();
  const scale = skin.heightScale;
  const tone = (c: Hsl): Hsl => {
    const [h, s, l] = skin.building(c.h, c.s, c.l);
    return { h, s, l };
  };
  const disc = (f: number, lift: number, style: string) => {
    ctx.fillStyle = style;
    ctx.beginPath();
    ctx.ellipse(cx, cy - lift, hw * f, hh * f, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  contactShadow(ctx, inset(q, 0.94));

  switch (zone) {
    case Zone.Ballpark:
    case Zone.Arena:
    case Zone.Stadium:
    case Zone.Colosseum: {
      const wall = (REWARD_HEIGHT[zone] ?? 16) * scale;
      const stand = tone(hsl(32, 12, 40));
      // the bowl: an extruded ring, lit on top, in shade on the far side
      for (let k = 0; k <= wall; k += 1.5) {
        const t = k / wall;
        disc(0.93, k, css(lit(stand, LIGHT.right + (LIGHT.roof - LIGHT.right) * t * 0.9)));
      }
      disc(0.93, wall, css(lit(stand, LIGHT.roof)));
      // seating rings
      for (let r = 0.88; r > 0.66; r -= 0.055) {
        disc(r, wall + 0.6, css(lit(tone(hsl(214, 22, 40 + (0.9 - r) * 60)), LIGHT.roof), 0.9));
      }
      // the pitch, with mown stripes
      const turf = zone === Zone.Ballpark ? hsl(108, 40, 34) : hsl(112, 34, 32);
      disc(0.64, wall - 1, css(lit(turf, LIGHT.roof)));
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cx, cy - wall + 1, hw * 0.64, hh * 0.64, 0, 0, Math.PI * 2);
      ctx.clip();
      for (let k = -6; k <= 6; k += 2) {
        ctx.fillStyle = css(lit(turf, LIGHT.roof * 1.14), 0.5);
        ctx.fillRect(cx + k * hw * 0.11, cy - wall - hh, hw * 0.11, hh * 2);
      }
      ctx.restore();
      if (detail >= 1) {
        for (const [ox, oy] of [
          [-hw * 0.7, 0],
          [hw * 0.7, 0],
          [0, -hh * 0.7],
          [0, hh * 0.7],
        ]) {
          ctx.strokeStyle = '#cfd6dc';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(cx + ox, cy + oy - wall);
          ctx.lineTo(cx + ox, cy + oy - wall - 14 * scale);
          ctx.stroke();
          ctx.fillStyle = powered ? '#fdf6d0' : '#6f7378';
          ctx.fillRect(cx + ox - 4, cy + oy - wall - 17 * scale, 8, 3.4);
          if (powered) {
            ctx.fillStyle = 'rgba(255, 246, 200, 0.16)';
            ctx.beginPath();
            ctx.moveTo(cx + ox - 4, cy + oy - wall - 15 * scale);
            ctx.lineTo(cx + ox + 4, cy + oy - wall - 15 * scale);
            ctx.lineTo(cx, cy + oy - wall + 4);
            ctx.closePath();
            ctx.fill();
          }
        }
      }
      break;
    }

    case Zone.Library:
    case Zone.Museum: {
      const h = (REWARD_HEIGHT[zone] ?? 20) * scale;
      const stone = material('stone', tone(hsl(44, 12, 74)));
      // a plinth the block sits on
      prism(ctx, inset(q, 0.92), 4, material('stone', tone(hsl(44, 10, 64))), { seed: 1 });
      const bodyQ = inset(q, 0.78);
      const r = prism(ctx, raise(bodyQ, 4), h, stone, { seed: 2, windows: 'punched' });
      roofCap(ctx, r.roof, 'gabled', stone.body, 3);
      if (zone === Zone.Museum) {
        // a shallow dome on the ridge — the reference image's dome, nodded to
        const domeR = hw * 0.2;
        ctx.fillStyle = css(lit(tone(hsl(174, 26, 46)), LIGHT.roof));
        ctx.beginPath();
        ctx.ellipse(cx, cy - h - 5, domeR, domeR * 0.62, 0, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = css(lit(tone(hsl(174, 30, 58)), LIGHT.roof * 1.2));
        ctx.beginPath();
        ctx.ellipse(cx - domeR * 0.25, cy - h - 5 - domeR * 0.12, domeR * 0.45, domeR * 0.3, 0, Math.PI, 0);
        ctx.fill();
      }
      if (detail >= 1) {
        // a colonnade across the front — the edge nearest the viewer,
        // measured, so a turned camera does not put it round the back
        const cols = zone === Zone.Museum ? 7 : 5;
        const [a, b] = nearEdge(bodyQ);
        for (let k = 0; k < cols; k++) {
          const t = (k + 0.5) / cols;
          const x = a[0] + (b[0] - a[0]) * t;
          const y = a[1] + (b[1] - a[1]) * t - 4;
          ctx.fillStyle = css(lit(stone.trim, LIGHT.left * 1.1));
          ctx.fillRect(x - 1.8, y - h, 3.6, h);
          ctx.fillStyle = css(lit(stone.trim, LIGHT.roof));
          ctx.fillRect(x - 2.6, y - h - 1.6, 5.2, 1.6);
        }
      }
      break;
    }

    case Zone.Monument: {
      const stone = tone(hsl(42, 10, 78));
      prism(ctx, inset(q, 0.66), 8 * scale, material('stone', tone(hsl(40, 8, 66))), { seed: 1 });
      prism(ctx, inset(q, 0.4), 14 * scale, material('stone', tone(hsl(40, 8, 72))), { seed: 2 });
      const top = cy - 14 * scale;
      const spire = 46 * scale;
      const w = hw * 0.1;
      fill(
        ctx,
        [
          [cx - w, top],
          [cx, top + w * 0.5],
          [cx, top - spire + w * 0.2],
          [cx - w * 0.4, top - spire],
        ],
        css(lit(stone, LIGHT.left * 1.08)),
      );
      fill(
        ctx,
        [
          [cx + w, top],
          [cx, top + w * 0.5],
          [cx, top - spire + w * 0.2],
          [cx + w * 0.4, top - spire],
        ],
        css(lit(stone, LIGHT.right)),
      );
      fill(
        ctx,
        [
          [cx - w * 0.4, top - spire],
          [cx + w * 0.4, top - spire],
          [cx, top - spire - 11 * scale],
        ],
        css(lit(tone(hsl(45, 28, 70)), LIGHT.roof * 1.1)),
      );
      break;
    }

    case Zone.College:
    case Zone.University:
    case Zone.ResearchUniversity: {
      const h = (REWARD_HEIGHT[zone] ?? 20) * scale;
      disc(0.82, 0, css(lit(hsl(106, 32, 34), LIGHT.roof)));
      // paths across the lawn
      ctx.strokeStyle = css(lit(hsl(44, 14, 68), LIGHT.roof), 0.7);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx - hw * 0.7, cy);
      ctx.lineTo(cx + hw * 0.7, cy);
      ctx.moveTo(cx, cy - hh * 0.7);
      ctx.lineTo(cx, cy + hh * 0.7);
      ctx.stroke();
      const brick = material('brick', tone(hsl(20, 28, 44)));
      for (const [fx, fy] of [
        [-0.52, 0],
        [0.52, 0],
        [0, -0.52],
        [0, 0.52],
      ]) {
        const wing = inset(
          q.map(([px, py]) => [cx + fx * hw + (px - cx) * 0.34, cy + fy * hh + (py - cy) * 0.34] as Pt) as Quad,
          0.96,
        );
        const r = prism(ctx, wing, h, brick, { seed: 4, windows: 'punched' });
        roofCap(ctx, r.roof, 'gabled', brick.body, 5);
      }
      if (zone !== Zone.College) {
        const th = h + (zone === Zone.ResearchUniversity ? 34 : 20) * scale;
        const t = prism(ctx, inset(q, 0.2), th, brick, { seed: 6, windows: 'punched' });
        if (zone === Zone.ResearchUniversity) {
          ctx.fillStyle = css(lit(tone(hsl(206, 12, powered ? 78 : 48)), LIGHT.roof));
          ctx.beginPath();
          ctx.ellipse(cx, cy - th, hw * 0.17, hh * 0.3, 0, Math.PI, 0);
          ctx.fill();
          ctx.fillStyle = css(lit(tone(hsl(206, 12, powered ? 88 : 54)), LIGHT.roof * 1.2));
          ctx.beginPath();
          ctx.ellipse(cx - hw * 0.05, cy - th - hh * 0.06, hw * 0.09, hh * 0.16, 0, Math.PI, 0);
          ctx.fill();
        } else {
          parapet(ctx, t.roof, material('stone', tone(hsl(40, 12, 68))), 2.4);
        }
      }
      break;
    }

    case Zone.FusionPlant: {
      const h = 18 * scale;
      const shell = material('concrete', tone(hsl(204, 8, 48)));
      const r = prism(ctx, inset(q, 0.9), h, shell, { seed: 1, windows: 'ribbon' });
      parapet(ctx, r.roof, shell, 2.4);
      ctx.strokeStyle = powered ? 'hsl(184 92% 64%)' : 'hsl(204 12% 42%)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.ellipse(cx, cy - h - 8 * scale, hw * 0.42, hh * 0.42, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (powered) {
        ctx.strokeStyle = 'rgba(184, 246, 255, 0.45)';
        ctx.lineWidth = 12;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(230, 252, 255, 0.9)';
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
      break;
    }
  }

}

/** Headroom over a reward's tallest thing: the monument's spire, a
 * floodlight mast, the research dome. */
const REWARD_MARGIN_TOP = 80;

function rewardSprite(zone: Zone, powered: boolean, detail: 0 | 1 | 2, size: number): Sprite {
  const scale = getSkin().heightScale;
  const w = TILE_W * size + 40;
  const h = TILE_H * size + (REWARD_HEIGHT[zone] ?? 20) * scale + REWARD_MARGIN_TOP + 2;
  return sprite(
    `W${zone}.${powered ? 1 : 0}.${size}.${detail ? 1 : 0}.${getSkin().id}`,
    { w, h, ax: w / 2, ay: h - (TILE_H * size) / 2 - 8 },
    (c) => {
      paintReward(c, zone, powered, detail, size);
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      grain(c, c.canvas.width, c.canvas.height, 0.03, zone * 5 + 2);
      c.restore();
    },
  );
}

function drawReward(
  ctx: CanvasRenderingContext2D,
  geom: TileGeom,
  zone: Zone,
  powered: boolean,
  detail: 0 | 1 | 2,
  size: number,
): void {
  blit(ctx, rewardSprite(zone, powered, detail, size), geom.cx, geom.cy);
  if (!powered) drawNoPowerBolt(ctx, geom.cx, geom.cy - 30 * getSkin().heightScale);
}

// ---------------------------------------------------------------------------
// Authored (mod) buildings
// ---------------------------------------------------------------------------

/**
 * Draw a building a player authored, from its declarative spec. It goes
 * through the same massing primitives core buildings do, so an authored
 * building picks up the sun, the materials and the active skin for free.
 * Exported so the Mods panel can preview with the code the map uses.
 */
export function drawAuthoredBuilding(
  ctx: CanvasRenderingContext2D,
  geom: TileGeom,
  v: VisualDef,
  powered: boolean,
  detail: 0 | 1 | 2 = 1,
) {
  const { cx, cy } = geom;
  const skin = getSkin();
  const h = v.height * skin.heightScale;
  const skinned = skin.building(v.hue, v.sat, v.light);
  const body: Hsl = { h: skinned[0], s: skinned[1], l: skinned[2] };
  const mat = material(v.light > 60 ? 'render' : v.sat > 40 ? 'brick' : 'concrete', body);
  const q = inset(quadOf(geom), v.footprint);
  contactShadow(ctx, q);
  const r = prism(ctx, q, h, mat, { seed: v.height | 0, windows: 'punched' });
  roofCap(ctx, r.roof, v.roof as RoofStyle, body, 1);

  if (detail >= 1) {
    const props = v.props.slice(0, MAX_BUILDING_PROPS);
    props.forEach((p, i) => {
      const dx = (i - (props.length - 1) / 2) * 10;
      if (p === 'smokestack') {
        prism(ctx, diamond(cx + dx, cy - h + 2, 3.4, 1.7), 20, material('brick', hsl(16, 20, 34)), {
          seed: i,
          groundAo: false,
        });
      } else {
        roofKit(ctx, shift(r.roof, dx, 0), [p as PropKind], body, i * 3 + 1, h);
      }
    });
  }
  if (!powered) drawNoPowerBolt(ctx, cx, cy - h - 14);
}

/** A placed building whose pack isn't loaded: show a blank, not a guess. */
function drawMissingBuilding(ctx: CanvasRenderingContext2D, geom: TileGeom) {
  const q = inset(quadOf(geom), 0.6);
  contactShadow(ctx, q);
  prism(ctx, q, 12, material('concrete', hsl(0, 0, 38)), { seed: 1 });
}

/** A park: turf, a path, a rock or a hedge, and a stand of trees — baked per
 * variant and season, trees and all (a nested sprite bakes first). */
function parkSprite(bucket: number, season: Season): Sprite {
  const w = TILE_W + 24;
  const h = TILE_H + 44;
  return sprite(`P${bucket}.${season.slice(0, 2)}`, { w, h, ax: w / 2, ay: h - TILE_H / 2 - 4 }, (ctx) => {
    const q = diamond(0, 0, TILE_W / 2, TILE_H / 2);
    fill(ctx, q, css(hsl(106, 38, 36)));
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(q[0][0], q[0][1]);
    for (let i = 1; i < 4; i++) ctx.lineTo(q[i][0], q[i][1]);
    ctx.closePath();
    ctx.clip();
    ctx.strokeStyle = css(hsl(44, 16, 66), 0.75);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-34, bucket % 2 ? -6 : 6);
    ctx.quadraticCurveTo(0, bucket % 2 ? 8 : -8, 34, bucket % 2 ? -4 : 4);
    ctx.stroke();
    ctx.restore();
    drawTree(ctx, -12, -4, 'broadleaf', 18, bucket % 6, season);
    drawTree(ctx, 10, 3, bucket % 3 === 0 ? 'conifer' : 'broadleaf', 15, (bucket + 2) % 6, season);
    if (bucket % 3 === 1) drawHedge(ctx, 2, 9, 14, season);
    else drawRock(ctx, 16, -3, 3, bucket);
  });
}

function drawPark(ctx: CanvasRenderingContext2D, geom: TileGeom, bucket: number, season: Season) {
  blit(ctx, parkSprite(bucket, season), geom.cx, geom.cy);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function drawBuilding(
  ctx: CanvasRenderingContext2D,
  geom: TileGeom,
  zone: Zone,
  stage: Stage,
  tier: Tier,
  abandoned: boolean,
  powered: boolean,
  variant: number, // 0..1 stable per tile
  night = 0, // 0 day .. 1 midnight, brings the lit-window overlay up
  detail: 0 | 1 | 2 = 1, // zoom LOD
  size = 1,
  season: Season = 'summer', // what anything baked with vegetation wears
) {
  const { cx, cy } = geom;
  const bucket = variantBucket(variant);

  const authored = buildingBySlot(zone);
  if (authored?.visual) {
    drawAuthoredBuilding(ctx, geom, authored.visual, powered, detail);
    return;
  }
  if (REWARD_ZONES.has(zone)) {
    drawReward(ctx, geom, zone, powered, detail, size);
    return;
  }
  if (zone >= MOD_SLOT_BASE && !authored) {
    drawMissingBuilding(ctx, geom);
    return;
  }
  if (zone === Zone.Park) {
    drawPark(ctx, geom, bucket, season);
    return;
  }
  if (zone === Zone.PowerLine) {
    drawPole(ctx, cx, cy);
    return;
  }
  if (zone === Zone.WaterPipe) {
    fill(
      ctx,
      [
        [cx - 11, cy],
        [cx, cy - 5.5],
        [cx + 11, cy],
        [cx, cy + 5.5],
      ],
      css(lit(hsl(206, 22, 42), LIGHT.roof)),
    );
    ctx.strokeStyle = css(lit(hsl(206, 20, 56), LIGHT.roof * 1.2), 0.6);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy - 1.5);
    ctx.lineTo(cx, cy - 5.5);
    ctx.lineTo(cx + 8, cy - 1.5);
    ctx.stroke();
    return;
  }
  if (drawCivic(ctx, geom, zone, powered, detail, night)) return;

  if (stage === 0) {
    drawSurveyedLot(ctx, geom, zone);
    if (!powered) drawNoPowerBolt(ctx, cx, cy - 4);
    return;
  }

  const farm = zone === Zone.Industrial && normalizeTier(zone, tier) === 'ag' && !abandoned;
  const key: LotKey = {
    zone, stage, tier, bucket, size, abandoned, glow: false,
    season: farm ? season : undefined,
  };
  blit(ctx, lotSprite(key), cx, cy);
  if (night > 0.06 && !abandoned && powered && !farm) {
    // (a farm's glow bake is empty — nothing to blit)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    blit(ctx, lotSprite({ ...key, glow: true }), cx, cy, Math.min(0.5, night * 0.7));
    ctx.restore();
  }
  if (!powered && !abandoned) {
    drawNoPowerBolt(ctx, cx, cy - growableHeight(zone, stage, tier, bucket) - 14);
  }
}

/**
 * The daylight sprite the map would blit for a lot or a civic building —
 * for the waterfront pass, which mirrors it into the water. Null for
 * anything else (rewards, parks, stage-0 lots, mods).
 */
export function standingSpriteFor(
  zone: Zone,
  stage: Stage,
  tier: Tier,
  variant: number,
  powered: boolean,
  abandoned: boolean,
  season: Season,
): Sprite | null {
  const civic = CIVIC[zone];
  if (civic) return civicSprite(zone, civic, powered, 1);
  if (zone !== Zone.Residential && zone !== Zone.Commercial && zone !== Zone.Industrial) return null;
  if (stage === 0) return null;
  const bucket = variantBucket(variant);
  const farm = normalizeTier(zone, tier) === 'ag' && !abandoned;
  return lotSprite({
    zone, stage, tier, bucket, size: 1, abandoned, glow: false,
    season: farm ? season : undefined,
  });
}

/** The ground shadow for whatever stands on this tile. Called from the shadow
 * pass, before any building is drawn, so the shadow lands on the street. */
export function drawCastShadow(
  ctx: CanvasRenderingContext2D,
  geom: TileGeom,
  zone: Zone,
  stage: Stage,
  tier: Tier,
  variant: number,
  size = 1,
  alpha?: number,
): void {
  const h = massHeight(zone, stage, tier, variantBucket(variant));
  if (h < 4) return;
  const f = massFootprint(zone, stage);
  if (f <= 0) return;
  castShadow(ctx, inset(quadOf(geom), f), h, alpha ?? (size > 1 ? 0.3 : 0.34));
}

// ---------------------------------------------------------------------------
// Transient marks
// ---------------------------------------------------------------------------

/** Disaster debris strewn over a wrecked lot; layout seeded by variant. */
export function drawRubble(ctx: CanvasRenderingContext2D, geom: TileGeom, variant: number) {
  const bucket = variantBucket(variant);
  const s = sprite(
    `rub${bucket}`,
    { w: TILE_W + 4, h: TILE_H + 20, ax: TILE_W / 2 + 2, ay: TILE_H / 2 + 14 },
    (c) => {
      c.beginPath();
      c.moveTo(0, -TILE_H / 2);
      c.lineTo(TILE_W / 2, 0);
      c.lineTo(0, TILE_H / 2);
      c.lineTo(-TILE_W / 2, 0);
      c.closePath();
      c.fillStyle = 'rgba(64, 56, 50, 0.5)';
      c.fill();
      c.save();
      c.clip();
      for (let k = 0; k < 16; k++) {
        const u = hash2(k, 1, bucket) * 2 - 1;
        const v = hash2(k, 2, bucket) * 2 - 1;
        if (Math.abs(u) + Math.abs(v) > 1) continue;
        const px = u * (TILE_W / 2);
        const py = v * (TILE_H / 2);
        const w = 2 + hash2(k, 3, bucket) * 5;
        const tone = hsl(24 + hash2(k, 4, bucket) * 14, 8 + hash2(k, 5, bucket) * 10, 30 + hash2(k, 6, bucket) * 26);
        c.fillStyle = css(lit(tone, LIGHT.right));
        c.fillRect(px - w / 2, py - w / 4, w, w / 2);
        c.fillStyle = css(lit(tone, LIGHT.roof));
        c.fillRect(px - w / 2, py - w / 4 - 1, w, 1);
      }
      c.strokeStyle = '#463a2e';
      c.lineWidth = 1.6;
      for (let k = 0; k < 3; k++) {
        const a = hash2(k, 7, bucket) * Math.PI;
        c.beginPath();
        c.moveTo(Math.cos(a) * -11, Math.sin(a) * -5);
        c.lineTo(Math.cos(a) * 11, Math.sin(a) * 5);
        c.stroke();
      }
      c.restore();
    },
  );
  blit(ctx, s, geom.cx, geom.cy);
}

/** A dust burst over a fresh collapse. `life` is 0..1, fading. */
export function drawCollapse(ctx: CanvasRenderingContext2D, geom: TileGeom, life: number) {
  const { cx, cy } = geom;
  const rise = (1 - life) * 22;
  ctx.save();
  ctx.globalAlpha = Math.min(1, life) * 0.62;
  for (let k = 0; k < 6; k++) {
    const px = cx + (k - 2.5) * 7 + Math.sin(k * 2.1) * 3;
    const py = cy - 4 - rise - k * 2.4;
    const r = 4 + (1 - life) * 7 + k * 0.6;
    const g = ctx.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, k % 2 ? 'rgba(178, 168, 156, 0.95)' : 'rgba(146, 136, 126, 0.95)');
    g.addColorStop(1, 'rgba(140, 130, 120, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** A crashed-car marker over a blocked road. */
export function drawAccident(ctx: CanvasRenderingContext2D, geom: TileGeom, timeMs: number) {
  const { cx, cy } = geom;
  for (const dx of [-9, 9]) {
    fill(
      ctx,
      [
        [cx + dx - 3, cy + 3],
        [cx + dx + 3, cy + 3],
        [cx + dx, cy - 7],
      ],
      '#e8721f',
    );
    ctx.fillStyle = '#f4f0ea';
    ctx.fillRect(cx + dx - 2, cy - 1.5, 4, 1.5);
  }
  ctx.fillStyle = 'rgba(20, 24, 36, 0.3)';
  ctx.beginPath();
  ctx.ellipse(cx + 3, cy + 2, 9, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#a8332c';
  ctx.fillRect(cx - 6, cy - 5, 12, 6);
  ctx.fillStyle = 'rgba(180, 200, 220, 0.6)';
  ctx.fillRect(cx - 4, cy - 4, 5, 3);
  const on = Math.sin(timeMs / 140) > 0;
  for (const [dx, first] of [
    [-5, true],
    [1, false],
  ] as const) {
    const c = (on === first ? '#3aa0ff' : '#ffcf3f');
    ctx.fillStyle = c;
    ctx.fillRect(cx + dx, cy - 8.5, 4, 2.5);
    ctx.fillStyle = c.replace(')', ', 0.28)').replace('#', 'rgba(');
    ctx.beginPath();
    ctx.arc(cx + dx + 2, cy - 7, 7, 0, Math.PI * 2);
    ctx.fillStyle = on === first ? 'rgba(58, 160, 255, 0.22)' : 'rgba(255, 207, 63, 0.22)';
    ctx.fill();
  }
}

/** A brief pulsing "!" over a tile where crime just struck. */
export function drawCrimeFlash(
  ctx: CanvasRenderingContext2D,
  geom: TileGeom,
  timeMs: number,
  life: number,
) {
  const { cx, cy } = geom;
  const pulse = 0.6 + 0.4 * Math.sin(timeMs / 90);
  const y = cy - 26 - (1 - life) * 9;
  ctx.save();
  ctx.globalAlpha = Math.min(1, life * 1.5) * pulse;
  ctx.fillStyle = '#ffd23f';
  ctx.strokeStyle = 'rgba(30,20,0,0.85)';
  ctx.lineWidth = 2.4;
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'center';
  ctx.strokeText('!', cx, y);
  ctx.fillText('!', cx, y);
  ctx.textAlign = 'left';
  ctx.restore();
}

/** Flames over a burning building: a licking core, embers, and a smoke plume. */
export function drawFire(
  ctx: CanvasRenderingContext2D,
  geom: TileGeom,
  timeMs: number,
  variant: number,
) {
  const { cx, cy } = geom;
  const t = timeMs / 90 + variant * 37;
  // the ground the fire is lighting
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 34);
  glow.addColorStop(0, 'rgba(255, 168, 60, 0.55)');
  glow.addColorStop(0.5, 'rgba(255, 110, 30, 0.22)');
  glow.addColorStop(1, 'rgba(255, 90, 20, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 34, 18, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 5; k++) {
    const fx = cx + (k - 2) * 6 + Math.sin(t + k * 2.1) * 3;
    const base = cy - 1 + Math.cos(k * 1.7) * 2;
    const hgt = 15 + Math.sin(t * 1.7 + k * 1.3) * 6 + (k === 2 ? 8 : 0);
    const g = ctx.createLinearGradient(fx, base, fx, base - hgt);
    g.addColorStop(0, 'rgba(255, 96, 20, 0.85)');
    g.addColorStop(0.55, 'rgba(255, 172, 48, 0.7)');
    g.addColorStop(1, 'rgba(255, 240, 170, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(fx - 4.5, base);
    ctx.quadraticCurveTo(fx - 3 + Math.sin(t + k) * 2, base - hgt * 0.6, fx + Math.sin(t + k) * 3, base - hgt);
    ctx.quadraticCurveTo(fx + 3 + Math.sin(t + k) * 2, base - hgt * 0.6, fx + 4.5, base);
    ctx.closePath();
    ctx.fill();
  }
  // embers riding the column
  for (let k = 0; k < 7; k++) {
    const p = ((t * 0.28 + k * 0.37) % 1);
    const ex = cx + Math.sin(t * 0.6 + k * 2.3) * 9;
    const ey = cy - 4 - p * 40;
    ctx.fillStyle = `rgba(255, ${Math.round(190 - p * 90)}, 70, ${(1 - p) * 0.85})`;
    ctx.fillRect(ex, ey, 1.6, 1.6);
  }
  ctx.restore();

  // smoke, leaning with the column
  for (let k = 0; k < 4; k++) {
    const p = ((t * 0.16 + k * 0.25) % 1);
    const sx = cx + 4 + Math.sin(t * 0.3 + k) * 7 + p * 8;
    const sy = cy - 22 - p * 34;
    const r = 5 + p * 12;
    ctx.fillStyle = `rgba(58, 54, 52, ${(1 - p) * 0.35})`;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}
