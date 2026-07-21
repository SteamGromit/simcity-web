import { IndustryKind, Stage, Tier, Wealth, Zone } from '../sim/types';
import { normalizeTier } from '../sim/tiers';
import { TileGeom } from './iso';
import { getSkin } from './skins';
import {
  Archetype,
  channels,
  footprintBudget,
  heightScaleFor,
  pickArchetype,
  pickFarmLayout,
  paletteFamily,
  PropKind,
  RoofStyle,
  WindowStyle,
} from './archetypes';

/** Heights (px) by zone and stage 1..7. */
const HEIGHTS: Partial<Record<Zone, number[]>> = {
  [Zone.Residential]: [0, 14, 26, 44, 60, 78, 96, 116],
  [Zone.Commercial]: [0, 16, 34, 58, 76, 96, 118, 142],
  [Zone.Industrial]: [0, 12, 22, 36, 48, 62, 78, 95],
};

/** Base wall colors [h, s, l] by tier and stage. Index 0 is unused (stage 0). */
const R_PALETTES: Record<Wealth, [number, number, number][]> = {
  1: [
    [0, 0, 0],
    [28, 22, 48], // cottage, weathered brown
    [30, 20, 44],
    [32, 18, 40],
    [34, 16, 38],
    [35, 15, 36],
    [36, 14, 34],
    [37, 13, 32],
  ],
  2: [
    [0, 0, 0],
    [95, 30, 62], // small house, pale green
    [150, 25, 55], // rowhouse teal-green
    [205, 30, 52], // apartment slate-blue
    [212, 33, 49], // mid-rise
    [218, 36, 46], // block tower
    [224, 39, 43], // high-rise
    [230, 42, 40], // residential tower
  ],
  3: [
    [0, 0, 0],
    [42, 18, 78], // villa, pale stone
    [40, 16, 76],
    [38, 14, 74],
    [200, 22, 70], // glass-and-stone mid-rise
    [202, 24, 68],
    [204, 26, 66],
    [206, 28, 64],
  ],
};

const C_PALETTES: Record<Wealth, [number, number, number][]> = {
  1: [
    [0, 0, 0],
    [18, 45, 58], // strip retail, warm awning
    [22, 42, 54],
    [26, 38, 50],
    [28, 36, 48],
    [30, 34, 46],
    [32, 32, 44],
    [34, 30, 42],
  ],
  2: [
    [0, 0, 0],
    [190, 35, 60], // shop
    [195, 45, 55], // office, glassy cyan
    [210, 40, 48], // tower
    [206, 46, 50], // glass mid-rise
    [211, 50, 46], // office slab
    [216, 53, 44], // corporate tower
    [221, 56, 42], // skyscraper
  ],
  3: [
    [0, 0, 0],
    [222, 30, 40],
    [224, 32, 36],
    [226, 34, 32], // dark glass tower
    [228, 36, 30],
    [230, 38, 28],
    [232, 40, 26],
    [234, 42, 24],
  ],
};

const I_PALETTES: Record<IndustryKind, [number, number, number][]> = {
  ag: [
    [0, 0, 0],
    [14, 48, 42], // barn red
    [14, 46, 40],
    [14, 44, 38],
    [14, 44, 38],
    [14, 44, 38],
    [14, 44, 38],
    [14, 44, 38],
  ],
  dirty: [
    [0, 0, 0],
    [35, 35, 55], // shed, ochre
    [25, 30, 48], // works, rust
    [20, 25, 42], // factory
    [18, 23, 40], // heavy works
    [15, 21, 38], // refinery block
    [12, 19, 36], // industrial complex
    [10, 17, 34], // mega-plant
  ],
  manu: [
    [0, 0, 0],
    [210, 8, 58], // mid-grey shed
    [210, 8, 54],
    [212, 9, 50],
    [212, 9, 48],
    [214, 10, 46],
    [214, 10, 44],
    [216, 11, 42],
  ],
  tech: [
    [0, 0, 0],
    [175, 22, 72], // clean white-teal
    [175, 24, 70],
    [177, 26, 68],
    [177, 28, 66],
    [179, 30, 64],
    [179, 32, 62],
    [181, 34, 60],
  ],
};

function paletteFor(zone: Zone, tier: Tier, stage: Stage): [number, number, number] {
  const t = normalizeTier(zone, tier);
  if (zone === Zone.Residential) return R_PALETTES[t as Wealth][stage];
  if (zone === Zone.Commercial) return C_PALETTES[t as Wealth][stage];
  if (zone === Zone.Industrial) return I_PALETTES[t as IndustryKind][stage];
  return [0, 0, 50];
}

function hsl(h: number, s: number, l: number): string {
  return `hsl(${h} ${s}% ${l}%)`;
}

export function fillPoly(ctx: CanvasRenderingContext2D, pts: [number, number][], fill: string) {
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

type Pt = [number, number];
const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const lerp2 = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** Shift a tile's geometry by a tile-space offset (ox, oy in tile-fraction
 * units), so sub-boxes and props rotate with the view for free. */
function shiftGeom(geom: TileGeom, ox: number, oy: number): TileGeom {
  const [c0, c1, , c3] = geom.corners;
  const dx = ox * (c1[0] - c0[0]) + oy * (c3[0] - c0[0]);
  const dy = ox * (c1[1] - c0[1]) + oy * (c3[1] - c0[1]);
  return {
    cx: geom.cx + dx,
    cy: geom.cy + dy,
    corners: geom.corners.map(([px, py]) => [px + dx, py + dy] as Pt),
  };
}

/** Point on the roof at fractional (u, v) across the footprint quad. */
function roofPt(foot: Pt[], h: number, u: number, v: number): Pt {
  const top = lerp2(foot[0], foot[1], u);
  const bot = lerp2(foot[3], foot[2], u);
  const p = lerp2(top, bot, v);
  return [p[0], p[1] - h];
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
): { faces: Face[]; foot: [number, number][] } {
  const skin = getSkin();
  [hue, sat, lit] = skin.building(hue, sat, lit);
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

  if (skin.outline > 0) {
    // cartoon ink: outline every visible face and the roof
    ctx.strokeStyle = 'rgba(25, 18, 28, 0.85)';
    ctx.lineWidth = skin.outline;
    for (const face of faces) {
      ctx.beginPath();
      ctx.moveTo(face.a[0], face.a[1]);
      ctx.lineTo(face.b[0], face.b[1]);
      ctx.lineTo(face.b[0], face.b[1] - h);
      ctx.lineTo(face.a[0], face.a[1] - h);
      ctx.closePath();
      ctx.stroke();
    }
    ctx.beginPath();
    const roof = foot.map(([px, py]) => [px, py - h] as [number, number]);
    ctx.moveTo(roof[0][0], roof[0][1]);
    for (let i = 1; i < 4; i++) ctx.lineTo(roof[i][0], roof[i][1]);
    ctx.closePath();
    ctx.stroke();
  }
  return { faces, foot };
}

function windows(
  ctx: CanvasRenderingContext2D,
  faces: Face[],
  h: number,
  litUp: boolean,
  night: number,
  style: WindowStyle,
) {
  ctx.strokeStyle = litUp
    ? `rgba(255, ${Math.round(240 - 30 * night)}, ${Math.round(160 - 60 * night)}, ${0.55 + 0.4 * night})`
    : 'rgba(20,20,30,0.45)';
  ctx.lineWidth = 1.5;
  if (style === 'columns') {
    for (const face of faces) {
      for (let t = 0.2; t <= 0.81; t += 0.15) {
        const x = face.a[0] + (face.b[0] - face.a[0]) * t;
        const y = face.a[1] + (face.b[1] - face.a[1]) * t;
        ctx.beginPath();
        ctx.moveTo(x, y - 4);
        ctx.lineTo(x, y - Math.max(5, h - 5));
        ctx.stroke();
      }
    }
    return;
  }
  if (style === 'grid') ctx.setLineDash([2.5, 2.5]);
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
  ctx.setLineDash([]);
}

/** Roof cap over the full-height mass. 'flat' is box()'s own lightened cap. */
function drawRoof(
  ctx: CanvasRenderingContext2D,
  foot: Pt[],
  h: number,
  style: RoofStyle,
  hue: number,
  sat: number,
  lit: number,
) {
  const roof = foot.map(([x, y]) => [x, y - h] as Pt);
  if (style === 'parapet') {
    ctx.strokeStyle = hsl(hue, sat, lit * 0.55);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(roof[0][0], roof[0][1]);
    for (let i = 1; i < 4; i++) ctx.lineTo(roof[i][0], roof[i][1]);
    ctx.closePath();
    ctx.stroke();
    return;
  }
  if (style === 'gabled') {
    const rh = Math.min(10, 4 + h * 0.2);
    const a = mid(roof[0], roof[3]);
    const b = mid(roof[1], roof[2]);
    // gable ends first, then the slopes over them
    fillPoly(ctx, [roof[0], roof[3], [a[0], a[1] - rh]], hsl(hue, sat, lit * 0.9));
    fillPoly(ctx, [roof[1], roof[2], [b[0], b[1] - rh]], hsl(hue, sat, lit * 0.9));
    fillPoly(ctx, [roof[0], roof[1], [b[0], b[1] - rh], [a[0], a[1] - rh]], hsl(hue, sat * 0.9, lit * 0.8));
    fillPoly(ctx, [roof[3], roof[2], [b[0], b[1] - rh], [a[0], a[1] - rh]], hsl(hue, sat * 0.9, lit * 0.62));
    return;
  }
  if (style === 'sawtooth') {
    const q = (t: number, s: number): Pt =>
      lerp2(lerp2(roof[0], roof[1], t), lerp2(roof[3], roof[2], t), s);
    for (let k = 0; k < 3; k++) {
      const t0 = k / 3;
      const t1 = (k + 1) / 3;
      const a = q(t0, 0);
      const b = q(t0, 1);
      const c = q(t1, 1);
      const d = q(t1, 0);
      fillPoly(ctx, [a, b, [b[0], b[1] - 3], [a[0], a[1] - 3]], hsl(hue, sat, lit * 0.5));
      fillPoly(ctx, [[a[0], a[1] - 3], [b[0], b[1] - 3], c, d], hsl(hue, sat, lit * 0.78));
    }
  }
}

function drawProp(ctx: CanvasRenderingContext2D, kind: PropKind, x: number, y: number) {
  switch (kind) {
    case 'waterTower':
      ctx.strokeStyle = '#5a5248';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - 3, y);
      ctx.lineTo(x - 3, y - 6);
      ctx.moveTo(x + 3, y);
      ctx.lineTo(x + 3, y - 6);
      ctx.stroke();
      ctx.fillStyle = '#8a7f6d';
      ctx.fillRect(x - 4, y - 13, 8, 7);
      fillPoly(ctx, [[x - 4, y - 13], [x + 4, y - 13], [x, y - 17]], '#6e6557');
      break;
    case 'acUnit':
      ctx.fillStyle = '#9aa0a6';
      ctx.fillRect(x - 3, y - 3, 5, 4);
      ctx.fillStyle = '#7d838a';
      ctx.fillRect(x + 3, y - 2, 3, 3);
      break;
    case 'antenna':
      ctx.strokeStyle = '#cfd2d6';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - 12);
      ctx.stroke();
      ctx.fillStyle = '#e05548';
      ctx.fillRect(x - 1, y - 13, 2, 2);
      break;
    case 'chimney':
      ctx.fillStyle = '#8a5a48';
      ctx.fillRect(x - 1.5, y - 9, 3, 9);
      ctx.fillStyle = '#6e483a';
      ctx.fillRect(x - 2, y - 10, 4, 2);
      break;
    case 'vent':
      ctx.fillStyle = '#848a90';
      ctx.fillRect(x - 3, y - 4, 6, 4);
      ctx.strokeStyle = '#5f646a';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(x - 2, y - 3);
      ctx.lineTo(x + 2, y - 3);
      ctx.moveTo(x - 2, y - 1.5);
      ctx.lineTo(x + 2, y - 1.5);
      ctx.stroke();
      break;
    case 'tank':
      ctx.fillStyle = '#b9bdb6';
      ctx.beginPath();
      ctx.arc(x, y - 4, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#8f948d';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y - 4, 4.5, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'yardTree':
      tree(ctx, x, y);
      break;
    case 'hedge':
      ctx.fillStyle = 'hsl(115 40% 26%)';
      ctx.fillRect(x - 5, y - 3, 10, 3);
      break;
    case 'awning':
      break; // drawn along the wall base in drawArchetype
  }
}

function smokestack(ctx: CanvasRenderingContext2D, cx: number, cy: number, h: number) {
  ctx.fillStyle = '#6b625c';
  ctx.fillRect(cx, cy - h - 16, 5, 16);
  ctx.fillStyle = '#544d48';
  ctx.fillRect(cx, cy - h - 16, 5, 3);
}

export function tree(ctx: CanvasRenderingContext2D, tx: number, ty: number, wind = 0) {
  ctx.fillStyle = '#5d4534';
  ctx.fillRect(tx - 1, ty, 2, 6);
  ctx.beginPath();
  // canopy whips leeward and droops slightly under hurricane wind
  ctx.arc(tx + wind, ty - 3 + Math.abs(wind) * 0.15, 5, 0, Math.PI * 2);
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

/** Farmland: tilled ground stripes and a low barn. Never a smokestack. */
function farm(ctx: CanvasRenderingContext2D, geom: TileGeom, variant: number) {
  const { cx, cy } = geom;
  const chan = channels(variant);
  const layout = pickFarmLayout(chan());
  fillTile(ctx, geom, `hsl(74 32% ${36 + Math.floor(chan() * 6)}%)`);
  ctx.strokeStyle = 'rgba(60, 48, 28, 0.35)';
  ctx.lineWidth = 1;
  for (let k = -2; k <= 2; k++) {
    ctx.beginPath();
    if (layout.furrowAngle === 0) {
      ctx.moveTo(cx - 20 + k * 3, cy + k * 5);
      ctx.lineTo(cx + 20 + k * 3, cy + k * 5 - 2);
    } else {
      ctx.moveTo(cx + k * 6 - 2, cy - 10 + k * 2);
      ctx.lineTo(cx + k * 6 + 2, cy + 10 + k * 2);
    }
    ctx.stroke();
  }
  const bg = shiftGeom(geom, layout.barnOx, layout.barnOy);
  box(ctx, bg, 0.3, 10 + chan() * 5, 14, 48, 42);
  if (layout.extra === 'silo') {
    const sg = shiftGeom(geom, -layout.barnOx, -layout.barnOy);
    ctx.fillStyle = '#c9c4b4';
    ctx.fillRect(sg.cx - 2.5, sg.cy - 16, 5, 14);
    ctx.fillStyle = '#a8a294';
    ctx.beginPath();
    ctx.arc(sg.cx, sg.cy - 16, 2.5, Math.PI, 0);
    ctx.fill();
  } else if (layout.extra === 'coop') {
    const cg = shiftGeom(geom, -layout.barnOx * 0.8, -layout.barnOy * 0.8);
    box(ctx, cg, 0.16, 5, 30, 35, 55);
  }
}

const GROUND_SPOTS: Pt[] = [[0.3, 0.3], [-0.32, 0.25], [0.28, -0.3], [-0.3, -0.3]];
const GROUND_PROPS: PropKind[] = ['tank', 'yardTree', 'hedge'];

function drawArchetype(
  ctx: CanvasRenderingContext2D,
  geom: TileGeom,
  arch: Archetype,
  stage: Stage,
  zone: Zone,
  baseH: number,
  hue: number,
  sat: number,
  lit: number,
  abandoned: boolean,
  night: number,
  chan: () => number,
): { faces: Face[]; foot: Pt[] } | null {
  const budget = footprintBudget(stage);
  // draw masses back-to-front under the current rotation
  const masses = arch.boxes
    .map((sb) => ({ sb, g: shiftGeom(geom, sb.ox * budget, sb.oy * budget) }))
    .sort((a, b) => a.g.cy - b.g.cy);
  let primary: { faces: Face[]; foot: Pt[] } | null = null;
  for (const { sb, g } of masses) {
    const r = box(ctx, g, sb.f * budget, baseH * sb.hf, hue, sat, lit);
    if (sb.hf === 1) primary = r;
  }
  if (!primary) return null;

  // decorations run through the skin exactly like walls do
  const [dh, ds, dl] = getSkin().building(hue, sat, lit);
  drawRoof(ctx, primary.foot, baseH, arch.roof, dh, ds, dl);
  if (stage >= 2 && zone !== Zone.Industrial) {
    windows(ctx, primary.faces, baseH, !abandoned, night, arch.windows);
  }

  if (abandoned) return primary; // ruins keep walls and roof, lose the trimmings
  let spot = 0;
  for (const kind of arch.props) {
    if (chan() > 0.85) continue; // most lots carry the prop; some go without
    if (kind === 'awning') {
      ctx.strokeStyle = hsl((dh + 150) % 360, 55, 55);
      ctx.lineWidth = 2.5;
      for (const face of primary.faces) {
        const a = lerp2(face.a, face.b, 0.1);
        const b = lerp2(face.a, face.b, 0.9);
        ctx.beginPath();
        ctx.moveTo(a[0], a[1] - 6);
        ctx.lineTo(b[0], b[1] - 6);
        ctx.stroke();
      }
    } else if (GROUND_PROPS.includes(kind)) {
      const [gx, gy] = GROUND_SPOTS[spot++ % GROUND_SPOTS.length];
      const g = shiftGeom(geom, gx, gy);
      drawProp(ctx, kind, g.cx, g.cy);
    } else {
      const p = roofPt(primary.foot, baseH, 0.3 + chan() * 0.4, 0.3 + chan() * 0.4);
      drawProp(ctx, kind, p[0], p[1]);
    }
  }
  return primary;
}

/** Small marks that make a lot's tier legible: §§§ roofline trim and
 * top-band spire, § worn tar cap, dirty grime band, tech glass line.
 * Expects the normalized tier; never called for abandoned lots. */
function drawTierAccents(
  ctx: CanvasRenderingContext2D,
  primary: { faces: Face[]; foot: Pt[] },
  zone: Zone,
  tier: Tier,
  stage: Stage,
  h: number,
) {
  const roofline = (color: string) => {
    const roof = primary.foot.map(([x, y]) => [x, y - h] as Pt);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(roof[0][0], roof[0][1]);
    for (let i = 1; i < 4; i++) ctx.lineTo(roof[i][0], roof[i][1]);
    ctx.closePath();
    ctx.stroke();
    return roof;
  };
  const rc = zone === Zone.Residential || zone === Zone.Commercial;
  if (rc && tier === 3 && stage >= 3) {
    const roof = roofline('rgba(255, 240, 200, 0.9)');
    if (stage >= 6) {
      const sx = (roof[0][0] + roof[2][0]) / 2;
      const sy = (roof[0][1] + roof[2][1]) / 2;
      ctx.strokeStyle = '#e8e2d2';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx, sy - 14);
      ctx.stroke();
      ctx.fillStyle = '#ffd76a';
      ctx.fillRect(sx - 1, sy - 16, 2, 2);
    }
  } else if (rc && tier === 1) {
    fillPoly(ctx, primary.foot.map(([x, y]) => [x, y - h] as Pt), 'rgba(40, 36, 30, 0.28)');
  } else if (zone === Zone.Industrial && tier === 'dirty') {
    ctx.strokeStyle = 'rgba(35, 30, 24, 0.5)';
    ctx.lineWidth = 3;
    for (const face of primary.faces) {
      ctx.beginPath();
      ctx.moveTo(face.a[0], face.a[1] - 2);
      ctx.lineTo(face.b[0], face.b[1] - 2);
      ctx.stroke();
    }
  } else if (zone === Zone.Industrial && tier === 'tech' && stage >= 5) {
    roofline('rgba(140, 230, 255, 0.85)');
  }
}

export function drawBuilding(
  ctx: CanvasRenderingContext2D,
  geom: TileGeom,
  zone: Zone,
  stage: Stage,
  tier: Tier,
  abandoned: boolean,
  powered: boolean,
  variant: number, // 0..1 stable per tile
  night = 0, // 0 day .. 1 midnight, brightens lit windows
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

  if (zone === Zone.WaterPump) {
    // squat blue pumphouse with an intake stack
    box(ctx, geom, 0.6, 12, 210, 45, 45);
    ctx.fillStyle = '#7fb3d8';
    ctx.fillRect(cx - 3, cy - 24, 6, 12);
    ctx.fillStyle = '#2d5f8a';
    ctx.fillRect(cx - 4, cy - 26, 8, 3);
    if (!powered) drawNoPowerBolt(ctx, cx, cy - 30);
    return;
  }

  if (zone === Zone.WaterPipe) {
    // buried main: a low blue-grey conduit bump
    fillPoly(
      ctx,
      [
        [cx - 10, cy],
        [cx, cy - 5],
        [cx + 10, cy],
        [cx, cy + 5],
      ],
      'hsl(207 25% 40%)',
    );
    return;
  }

  if (zone === Zone.BusStop) {
    // small teal shelter with a stop-sign post
    box(ctx, geom, 0.45, 7, 178, 40, 42);
    ctx.strokeStyle = '#cfd6d4';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx + 10, cy + 2);
    ctx.lineTo(cx + 10, cy - 14);
    ctx.stroke();
    ctx.fillStyle = '#2fa38f';
    ctx.fillRect(cx + 10, cy - 14, 6, 5);
    if (!powered) drawNoPowerBolt(ctx, cx, cy - 18);
    return;
  }

  if (
    zone === Zone.FireStation ||
    zone === Zone.PoliceStation ||
    zone === Zone.School ||
    zone === Zone.Hospital
  ) {
    const style =
      zone === Zone.FireStation
        ? { h: 18, f: 0.8, hue: 2, sat: 62, lit: 46 }
        : zone === Zone.PoliceStation
          ? { h: 18, f: 0.8, hue: 215, sat: 45, lit: 44 }
          : zone === Zone.Hospital
            ? { h: 22, f: 0.82, hue: 190, sat: 12, lit: 68 }
            : { h: 12, f: 0.85, hue: 45, sat: 42, lit: 56 };
    const { faces } = box(ctx, geom, style.f, style.h, style.hue, style.sat, style.lit);
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
    if (zone === Zone.Hospital) {
      // red cross on the roof
      ctx.fillStyle = '#d23b30';
      ctx.fillRect(cx - 1.5, cy - style.h - 9, 3, 9);
      ctx.fillRect(cx - 4.5, cy - style.h - 6, 9, 3);
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

  const kind = normalizeTier(zone, tier);

  if (zone === Zone.Industrial && kind === 'ag' && !abandoned) {
    farm(ctx, geom, variant);
    if (!powered) drawNoPowerBolt(ctx, cx, cy - 20);
    return;
  }

  const h =
    (HEIGHTS[zone]?.[stage] ?? 12) *
    heightScaleFor(zone, tier) *
    (0.92 + variant * 0.16) *
    getSkin().heightScale;
  const chan = channels(variant);
  const arch = pickArchetype(zone, tier, stage, chan());
  const [fh, fs, fl] = paletteFamily(zone, tier, chan());
  let [hue, sat, lit] = paletteFor(zone, tier, stage);
  // family shift plus a narrowed jitter (±6°, was ±12°) — families carry
  // the variety now, jitter just breaks up rows
  hue = (hue + fh + Math.floor(chan() * 12) - 6 + 360) % 360;
  sat = Math.max(0, Math.min(100, sat + fs));
  lit = Math.max(0, Math.min(100, lit + fl));

  if (abandoned) {
    sat = 6;
    lit = 32;
  }
  const primary = drawArchetype(ctx, geom, arch, stage, zone, h, hue, sat, lit, abandoned, night, chan);
  if (primary && !abandoned) drawTierAccents(ctx, primary, zone, kind, stage, h);
  // Only smoky industry gets stacks; high-tech is clean and farms have none.
  if (zone === Zone.Industrial && stage >= 2 && !abandoned && (kind === 'dirty' || kind === 'manu')) {
    smokestack(ctx, cx + 8, cy - 8, h + 8);
    if (kind === 'dirty' && stage >= 3) smokestack(ctx, cx - 2, cy - 4, h + 4);
  }

  if (abandoned) {
    // boarded-up cross over the roof
    ctx.strokeStyle = 'rgba(30,25,20,0.8)';
    ctx.lineWidth = 2;
    const r = 0.5 * footprintBudget(stage);
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

/** Disaster debris strewn over a wrecked lot; layout seeded by variant so
 * it holds still frame to frame. Drawn under the surviving building. */
export function drawRubble(ctx: CanvasRenderingContext2D, geom: TileGeom, variant: number) {
  const { cx, cy } = geom;
  fillTile(ctx, geom, 'rgba(70, 62, 55, 0.45)'); // ash-brown ground stain
  let h = 1 + variant * 976;
  const rand = () => {
    h = (h * 1103515245 + 12345) % 2147483648;
    return h / 2147483648;
  };
  for (let k = 0; k < 7; k++) {
    const px = cx + (rand() - 0.5) * 22;
    const py = cy + (rand() - 0.5) * 11;
    const w = 2 + rand() * 4;
    ctx.fillStyle = `hsl(${25 + rand() * 12} ${8 + rand() * 10}% ${35 + rand() * 25}%)`;
    ctx.fillRect(px - w / 2, py - w / 4, w, w / 2);
  }
  // splintered beams
  ctx.strokeStyle = '#4a3f33';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - 8 + variant * 4, cy + 3);
  ctx.lineTo(cx + 2 + variant * 4, cy - 2);
  ctx.moveTo(cx + 6 - variant * 3, cy + 4);
  ctx.lineTo(cx - 2 - variant * 3, cy - 1);
  ctx.stroke();
}

/** Animated flames over a burning building; flicker driven by time. */
export function drawFire(
  ctx: CanvasRenderingContext2D,
  geom: TileGeom,
  timeMs: number,
  variant: number,
) {
  const { cx, cy } = geom;
  const t = timeMs / 90 + variant * 37; // per-tile phase offset
  fillTile(ctx, geom, 'rgba(255,120,20,0.28)'); // ember glow on the ground
  for (let k = 0; k < 3; k++) {
    const fx = cx + (k - 1) * 7 + Math.sin(t + k * 2.1) * 2;
    const base = cy - 2;
    const hgt = 14 + Math.sin(t * 1.7 + k * 1.3) * 4;
    fillPoly(
      ctx,
      [
        [fx - 4, base],
        [fx + 4, base],
        [fx + Math.sin(t + k) * 2, base - hgt],
      ],
      k === 1 ? 'rgba(255,205,60,0.9)' : 'rgba(240,110,25,0.85)',
    );
  }
}
