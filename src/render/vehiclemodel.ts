/**
 * Vehicles as small box models.
 *
 * A vehicle is a handful of boxes in its own frame — x forward, y to the
 * left, z up, in logical pixels at zoom 1 — projected into the isometric
 * view at the heading it is travelling. Each box shows its top and the two
 * sides that face the viewer, lit from the same fixed sun as the buildings,
 * so a car turning a corner shows its bonnet, then its flank, then its boot,
 * at every one of the four view quarters. The painter is pure canvas; the
 * sprite cache bakes it per sixteenth of a turn.
 */
import { projectAt, TILE_W } from './iso';
import { LIGHT } from './sun';
import { sprite, type Sprite, type SpriteSpec } from './spritecache';

export type BodyStyle =
  | 'hatch' | 'saloon' | 'estate' | 'suv' | 'coupe'
  | 'pickup' | 'panelVan' | 'minivan'
  | 'boxTruck' | 'flatbed' | 'semi'
  | 'bus' | 'taxi'
  | 'fireEngine' | 'police' | 'garbage';

export type Paint =
  | 'body' | 'glass' | 'dark' | 'cargo' | 'white' | 'red' | 'ladder'
  // figures (`figure.ts` picks these from its palettes)
  | 'shirt' | 'trousers' | 'skin' | 'umbrella';

export interface Box {
  /** Centre of the footprint and the base height, vehicle frame. */
  x: number;
  y: number;
  z: number;
  /** Extent along x (length), y (width) and z (height). */
  l: number;
  w: number;
  h: number;
  paint: Paint;
}

/** Logical pixels along a grid axis per tile: the diamond's edge length. */
export const PX_PER_TILE = Math.hypot(TILE_W / 2, TILE_W / 4);

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

/** Plan dimensions carried over from the flat art, so the fleet keeps its scale. */
export interface Body {
  len: number;
  wid: number;
  /** Where the cabin starts and ends along the body, 0..1 from the back. */
  cabin: [number, number];
  /** A separate, taller box behind the cabin (a van or truck body). */
  boxFrom?: number;
  boxHeight?: number;
}

export const BODIES: Record<BodyStyle, Body> = {
  hatch: { len: 7.6, wid: 4.2, cabin: [0.28, 0.72] },
  saloon: { len: 9.2, wid: 4.3, cabin: [0.3, 0.66] },
  estate: { len: 9.8, wid: 4.3, cabin: [0.28, 0.78] },
  suv: { len: 9.6, wid: 4.8, cabin: [0.26, 0.78] },
  coupe: { len: 8.8, wid: 4.1, cabin: [0.34, 0.66] },
  taxi: { len: 9.2, wid: 4.3, cabin: [0.3, 0.66] },
  pickup: { len: 11.4, wid: 4.9, cabin: [0.5, 0.82] },
  panelVan: { len: 11, wid: 4.9, cabin: [0.62, 0.92], boxFrom: 0.05, boxHeight: 1 },
  minivan: { len: 10.4, wid: 4.8, cabin: [0.24, 0.84] },
  boxTruck: { len: 14, wid: 5.2, cabin: [0.7, 0.98], boxFrom: 0.02, boxHeight: 1.3 },
  flatbed: { len: 14, wid: 5.2, cabin: [0.7, 0.98] },
  semi: { len: 21, wid: 5.4, cabin: [0.78, 1], boxFrom: 0.02, boxHeight: 1.4 },
  bus: { len: 17, wid: 5.4, cabin: [0.04, 0.96] },
  fireEngine: { len: 14, wid: 5.2, cabin: [0.7, 0.98], boxFrom: 0.02, boxHeight: 1.3 },
  police: { len: 9.2, wid: 4.3, cabin: [0.3, 0.66] },
  garbage: { len: 13, wid: 5.2, cabin: [0.72, 0.98], boxFrom: 0.02, boxHeight: 1.2 },
};

const box = (x: number, y: number, z: number, l: number, w: number, h: number, paint: Paint): Box => ({
  x, y, z, l, w, h, paint,
});

/** Four wheels tucked under a body of the given plan. */
function wheels(len: number, wid: number): Box[] {
  const ax = len / 2 - 1.9;
  const ay = wid / 2 - 0.3;
  return [
    box(ax, ay, 0, 1.5, 0.8, 1.0, 'dark'),
    box(ax, -ay, 0, 1.5, 0.8, 1.0, 'dark'),
    box(-ax, ay, 0, 1.5, 0.8, 1.0, 'dark'),
    box(-ax, -ay, 0, 1.5, 0.8, 1.0, 'dark'),
  ];
}

/** A passenger car: a low body with a glazed cabin on its rear two thirds. */
function car(b: Body, bodyH = 2.4, cabinH = 1.9): Box[] {
  const at = (t: number) => -b.len / 2 + t * b.len;
  const c0 = at(b.cabin[0]);
  const c1 = at(b.cabin[1]);
  return [
    ...wheels(b.len, b.wid),
    box(0, 0, 0.6, b.len, b.wid, bodyH, 'body'),
    box((c0 + c1) / 2, 0, 0.6 + bodyH, c1 - c0 - 0.6, b.wid - 1.2, cabinH, 'glass'),
  ];
}

/** A cab in front of a separate, taller cargo body. */
function truck(b: Body, cabH: number, cargoH: number, cargo: Paint, cab: Paint = 'body'): Box[] {
  const at = (t: number) => -b.len / 2 + t * b.len;
  const cab0 = at(b.cabin[0]);
  const cab1 = at(1);
  const cargo0 = at(b.boxFrom ?? 0.02);
  const cargo1 = cab0 - 0.3;
  return [
    ...wheels(b.len, b.wid),
    box((cab0 + cab1) / 2, 0, 0.6, cab1 - cab0, b.wid - 0.4, cabH, cab),
    box((cab0 + cab1) / 2 + 0.2, 0, 0.6 + cabH, (cab1 - cab0) * 0.55, b.wid - 1.4, 1.5, 'glass'),
    box((cargo0 + cargo1) / 2, 0, 0.6, cargo1 - cargo0, b.wid, cargoH, cargo),
  ];
}

function pickup(b: Body): Box[] {
  const at = (t: number) => -b.len / 2 + t * b.len;
  const c0 = at(b.cabin[0]);
  const c1 = at(b.cabin[1]);
  return [
    ...wheels(b.len, b.wid),
    box((c0 - 0.4 + b.len / 2) / 2, 0, 0.6, b.len / 2 - (c0 - 0.4), b.wid, 2.6, 'body'),
    box((c0 + c1) / 2 + 0.3, 0, 3.2, c1 - c0 - 0.4, b.wid - 1.2, 1.8, 'glass'),
    box((-b.len / 2 + c0 - 0.4) / 2, 0, 0.6, c0 - 0.4 + b.len / 2, b.wid, 1.7, 'body'),
  ];
}

function flatbed(b: Body): Box[] {
  const at = (t: number) => -b.len / 2 + t * b.len;
  const cab0 = at(b.cabin[0]);
  return [
    ...wheels(b.len, b.wid),
    box((cab0 + b.len / 2) / 2, 0, 0.6, b.len / 2 - cab0, b.wid - 0.4, 3.4, 'body'),
    box((cab0 + b.len / 2) / 2 + 0.2, 0, 4.0, (b.len / 2 - cab0) * 0.55, b.wid - 1.4, 1.5, 'glass'),
    box((-b.len / 2 + cab0 - 0.3) / 2, 0, 0.6, cab0 - 0.3 + b.len / 2, b.wid, 1.2, 'dark'),
  ];
}

function bus(b: Body): Box[] {
  return [
    ...wheels(b.len, b.wid),
    box(0, 0, 0.6, b.len, b.wid, 4.6, 'body'),
    box(0.3, 0, 2.6, b.len * 0.92, b.wid + 0.1, 1.6, 'glass'),
  ];
}

export const MODELS: Record<BodyStyle, Box[]> = {
  hatch: car(BODIES.hatch, 2.3, 2.0),
  saloon: car(BODIES.saloon),
  estate: car(BODIES.estate, 2.4, 2.0),
  suv: car(BODIES.suv, 2.9, 2.1),
  coupe: car(BODIES.coupe, 2.2, 1.6),
  taxi: [...car(BODIES.taxi), box(0.2, 0, 4.9, 2.4, 1.6, 0.9, 'dark')],
  pickup: pickup(BODIES.pickup),
  panelVan: truck(BODIES.panelVan, 3.0, 3.6, 'body'),
  minivan: car(BODIES.minivan, 2.8, 2.2),
  boxTruck: truck(BODIES.boxTruck, 3.4, 4.6, 'cargo'),
  flatbed: flatbed(BODIES.flatbed),
  semi: truck(BODIES.semi, 3.6, 5.0, 'cargo'),
  bus: bus(BODIES.bus),
  fireEngine: [
    ...truck(BODIES.fireEngine, 3.4, 4.0, 'body'),
    box(-2.4, 0, 4.6, 8.2, 1.2, 0.6, 'ladder'),
  ],
  police: [...car(BODIES.police), box(0, 0, 4.9, 1.2, 3.2, 0.7, 'dark')],
  garbage: truck(BODIES.garbage, 3.4, 4.4, 'cargo', 'white'),
};

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

export interface Face {
  /** Screen polygon, logical pixels, relative to the vehicle's ground centre. */
  pts: [number, number][];
  /** Brightness multiplier for the paint. */
  light: number;
  paint: Paint;
  /** Paint order key: the box's projected centre, farther first. */
  depth: number;
  top: boolean;
}

/** Light on a wall whose outward normal is (nx, ny) in grid units. */
export function faceLight(nx: number, ny: number, cosA: number, sinA: number): number {
  const p = projectAt(nx, ny, cosA, sinA);
  const len = Math.hypot(p.sx, p.sy) || 1;
  // an axis-aligned normal projects to sx = ±TILE_W/2 over its length; that
  // is where the buildings' two wall factors sit, and the slope between them
  const s = p.sx / len / (TILE_W / 2 / PX_PER_TILE);
  const mid = (LIGHT.left + LIGHT.right) / 2;
  const half = (LIGHT.left - LIGHT.right) / 2;
  return Math.min(LIGHT.left, Math.max(LIGHT.right, mid - half * s));
}

/**
 * Project boxes at a heading (grid radians, 0 = +x) into the view given by
 * (cosA, sinA). Boxes come back farthest first, each as its visible sides
 * followed by its top.
 */
export function projectBoxes(boxes: Box[], heading: number, cosA: number, sinA: number): Face[] {
  const ch = Math.cos(heading);
  const sh = Math.sin(heading);
  const toScreen = (lx: number, ly: number, lz: number): [number, number] => {
    const gx = (lx * ch - ly * sh) / PX_PER_TILE;
    const gy = (lx * sh + ly * ch) / PX_PER_TILE;
    const p = projectAt(gx, gy, cosA, sinA);
    return [p.sx, p.sy - lz];
  };
  const perBox = boxes.map((b, order) => {
    const x0 = b.x - b.l / 2;
    const x1 = b.x + b.l / 2;
    const y0 = b.y - b.w / 2;
    const y1 = b.y + b.w / 2;
    const z0 = b.z;
    const z1 = b.z + b.h;
    const centre = toScreen(b.x, b.y, (z0 + z1) / 2);
    const depth = centre[1];
    const faces: Face[] = [];
    // sides: local outward normals +x, −x, +y, −y
    const sides: [number, number, [number, number][]][] = [
      [1, 0, [[x1, y0], [x1, y1]]],
      [-1, 0, [[x0, y1], [x0, y0]]],
      [0, 1, [[x1, y1], [x0, y1]]],
      [0, -1, [[x0, y0], [x1, y0]]],
    ];
    for (const [nx, ny, [a, c]] of sides) {
      const gnx = nx * ch - ny * sh;
      const gny = nx * sh + ny * ch;
      if (projectAt(gnx, gny, cosA, sinA).sy <= 1e-9) continue;
      faces.push({
        pts: [toScreen(a[0], a[1], z0), toScreen(c[0], c[1], z0), toScreen(c[0], c[1], z1), toScreen(a[0], a[1], z1)],
        light: faceLight(gnx, gny, cosA, sinA),
        paint: b.paint,
        depth,
        top: false,
      });
    }
    faces.push({
      pts: [toScreen(x0, y0, z1), toScreen(x1, y0, z1), toScreen(x1, y1, z1), toScreen(x0, y1, z1)],
      light: LIGHT.roof,
      paint: b.paint,
      depth,
      top: true,
    });
    return { depth, order, faces };
  });
  perBox.sort((p, q) => p.depth - q.depth || p.order - q.order);
  const out: Face[] = [];
  for (const b of perBox) out.push(...b.faces);
  return out;
}

/** A sprite box that holds every face, with a 2 px margin; origin at the ground centre. */
export function spriteBounds(faces: Face[]): SpriteSpec {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const f of faces) {
    for (const [x, y] of f.pts) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const m = 2;
  return {
    w: Math.ceil(maxX - minX + 2 * m),
    h: Math.ceil(maxY - minY + 2 * m),
    ax: -minX + m,
    ay: -minY + m,
  };
}

// ---------------------------------------------------------------------------
// Painting
// ---------------------------------------------------------------------------

/** Mix a hex body colour toward black or white; |t| in 0..1. */
export function shade(hex: string, t: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const to = t < 0 ? 0 : 255;
  const k = Math.min(1, Math.abs(t));
  const mix = (c: number) => Math.round(c + (to - c) * k);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `rgb(${r}, ${g}, ${b})`;
}

function paintBase(paint: Paint, style: BodyStyle, color: string): string {
  switch (paint) {
    case 'body':
      return color;
    case 'glass':
      return '#8fb0c8';
    case 'dark':
      return '#1e2026';
    case 'cargo':
      return style === 'garbage' ? '#8d949c' : style === 'semi' ? '#d8d4cc' : color;
    case 'white':
      return '#e9ebee';
    case 'red':
      return '#c8282a';
    case 'ladder':
      return '#9aa0a8';
    default:
      return color;
  }
}

export function fillPoly(ctx: CanvasRenderingContext2D, pts: [number, number][]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fill();
}

/** Paint one vehicle at the context's origin, ground centre at (0, 0). */
export function paintVehicle(
  ctx: CanvasRenderingContext2D,
  style: BodyStyle,
  color: string,
  heading: number,
  cosA: number,
  sinA: number,
): void {
  const boxes = MODELS[style];
  const faces = projectBoxes(boxes, heading, cosA, sinA);
  // the shadow: the biggest footprint, flat on the ground, nudged off the body
  let big = boxes[0];
  for (const b of boxes) if (b.l * b.w > big.l * big.w) big = b;
  const ground = projectBoxes([{ ...big, z: 0, h: 0 }], heading, cosA, sinA).find((f) => f.top);
  if (ground) {
    ctx.fillStyle = 'rgba(18, 22, 36, 0.3)';
    fillPoly(ctx, ground.pts.map(([x, y]) => [x + 1.6, y + 1.4] as [number, number]));
  }
  for (const f of faces) {
    const base = paintBase(f.paint, style, color);
    ctx.fillStyle = f.paint === 'glass' && !f.top ? shade(base, -0.25) : shade(base, f.light - 1);
    fillPoly(ctx, f.pts);
    if (f.top && f.paint === 'glass') {
      // a sky glint on the roof glass
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      fillPoly(ctx, f.pts);
    }
  }
}

const HEADINGS = 16;
const boundsCache = new Map<string, SpriteSpec>();

/** The baked vehicle at the nearest sixteenth of a turn, for the view quarter. */
export function vehicleSprite(style: BodyStyle, color: string, heading: number, quarter: 0 | 1 | 2 | 3): Sprite {
  const turn = heading / (Math.PI * 2);
  const h16 = (((Math.round(turn * HEADINGS) % HEADINGS) + HEADINGS) % HEADINGS);
  const key = `V.${style}.${color}.${h16}.${quarter}`;
  const h = (h16 / HEADINGS) * Math.PI * 2;
  const cosA = Math.cos((quarter * Math.PI) / 2);
  const sinA = Math.sin((quarter * Math.PI) / 2);
  const bkey = `${style}.${h16}.${quarter}`;
  let spec = boundsCache.get(bkey);
  if (!spec) {
    spec = spriteBounds(projectBoxes(MODELS[style], h, cosA, sinA));
    boundsCache.set(bkey, spec);
  }
  return sprite(key, spec, (ctx) => paintVehicle(ctx, style, color, h, cosA, sinA));
}

// ---------------------------------------------------------------------------
// Lights (live, after the sprite)
// ---------------------------------------------------------------------------

export interface LightState {
  night: number;
  brake: boolean;
  /** −1 left, 1 right, 0 none. */
  indicator: -1 | 0 | 1;
  /** 0..1 phase of the blink clock. */
  blink: number;
  emergency: boolean;
}

/** Headlights, tail and brake lights, indicators and roof beacons. */
export function paintLights(
  ctx: CanvasRenderingContext2D,
  style: BodyStyle,
  heading: number,
  cosA: number,
  sinA: number,
  st: LightState,
): void {
  const b = BODIES[style];
  const ch = Math.cos(heading);
  const sh = Math.sin(heading);
  // screen displacement per local pixel forward and to the left
  const f = projectAt(ch / PX_PER_TILE, sh / PX_PER_TILE, cosA, sinA);
  const l = projectAt(-sh / PX_PER_TILE, ch / PX_PER_TILE, cosA, sinA);
  const at = (lx: number, ly: number, lz: number): [number, number] => [
    lx * f.sx + ly * l.sx,
    lx * f.sy + ly * l.sy - lz,
  ];
  const dot = (p: [number, number], size: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(p[0] - size / 2, p[1] - size / 2, size, size);
  };
  const L = b.len;
  const W = b.wid;
  const nightA = st.night > 0.25 ? Math.min(1, (st.night - 0.25) * 2.2) : 0;
  if (nightA > 0) {
    const fl = Math.hypot(f.sx, f.sy) || 1;
    const ux = f.sx / fl;
    const uy = f.sy / fl;
    const n0 = at(L / 2, W / 2 - 0.4, 1.4);
    const n1 = at(L / 2, -W / 2 + 0.4, 1.4);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const beam = ctx.createLinearGradient(n0[0], n0[1], n0[0] + ux * 22, n0[1] + uy * 22);
    beam.addColorStop(0, `rgba(255, 238, 190, ${0.4 * nightA})`);
    beam.addColorStop(1, 'rgba(255, 238, 190, 0)');
    ctx.fillStyle = beam;
    const spread = 0.9;
    ctx.beginPath();
    ctx.moveTo(n0[0], n0[1]);
    ctx.lineTo(n0[0] + ux * 22 + l.sx * W * spread, n0[1] + uy * 22 + l.sy * W * spread);
    ctx.lineTo(n1[0] + ux * 22 - l.sx * W * spread, n1[1] + uy * 22 - l.sy * W * spread);
    ctx.lineTo(n1[0], n1[1]);
    ctx.closePath();
    ctx.fill();
    dot(n0, 1.4, `rgba(255, 246, 214, ${0.95 * nightA})`);
    dot(n1, 1.4, `rgba(255, 246, 214, ${0.95 * nightA})`);
    ctx.restore();
  }
  const tailA = st.brake ? 0.95 : nightA * 0.85;
  if (tailA > 0) {
    const size = st.brake ? 1.8 : 1.2;
    dot(at(-L / 2, W / 2 - 0.5, 1.4), size, `rgba(255, 60, 44, ${tailA})`);
    dot(at(-L / 2, -W / 2 + 0.5, 1.4), size, `rgba(255, 60, 44, ${tailA})`);
  }
  if (st.indicator !== 0 && st.blink < 0.5) {
    const side = st.indicator === 1 ? -1 : 1; // local +y is the left
    dot(at(L / 2 - 0.3, side * (W / 2 - 0.3), 1.6), 1.3, 'rgba(255, 176, 40, 0.95)');
    dot(at(-L / 2 + 0.3, side * (W / 2 - 0.3), 1.6), 1.3, 'rgba(255, 176, 40, 0.95)');
  }
  if (st.emergency) {
    const top = style === 'fireEngine' ? 5.4 : style === 'garbage' ? 5.2 : 5.8;
    const phase = (st.blink * 4) % 1 < 0.5;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    dot(at(0.6, 1.0, top), 1.8, phase ? 'rgba(255, 40, 40, 0.95)' : 'rgba(255, 40, 40, 0.15)');
    dot(at(0.6, -1.0, top), 1.8, phase ? 'rgba(60, 110, 255, 0.15)' : 'rgba(60, 110, 255, 0.95)');
    ctx.restore();
  }
}
