/**
 * People as box models: legs, torso and head in the walker's own frame
 * (x forward, y right, z up, logical pixels at zoom 1), projected by the
 * vehicle projector so a figure faces the way it walks and takes the same
 * sun as the cars. A four-frame gait splits the legs; the frame follows the
 * distance walked so the stride matches the pace. Baked per palette, frame,
 * eighth of a turn and view quarter.
 */
import { sprite, type Sprite, type SpriteSpec } from './spritecache';
import { fillPoly, projectBoxes, shade, spriteBounds, type Box } from './vehiclemodel';

/** Tiles walked per gait frame; four frames make a stride cycle. */
export const STRIDE = 0.07;

export interface Palette {
  shirt: string;
  trousers: string;
}

export const PALETTES: Palette[] = [
  { shirt: '#c8343a', trousers: '#2b2f3a' },
  { shirt: '#e6e2d8', trousers: '#3a4a6a' },
  { shirt: '#2d6a9e', trousers: '#4a3b2c' },
  { shirt: '#e8b43a', trousers: '#2b2d33' },
  { shirt: '#3f8a5c', trousers: '#5a5a62' },
  { shirt: '#8a4ba0', trousers: '#2b2f3a' },
  { shirt: '#f0f0f2', trousers: '#1f2228' },
  { shirt: '#262a33', trousers: '#262a33' },
  { shirt: '#d9743a', trousers: '#3a4a6a' },
  { shirt: '#7fb6d8', trousers: '#4a3b2c' },
  { shirt: '#b6c45a', trousers: '#2b2d33' },
  { shirt: '#c96a8a', trousers: '#5a5a62' },
];
const SKINS = ['#e8c2a6', '#c9956b', '#9c6a44', '#5c3b25'];
const BROLLIES = ['#c8333a', '#2d5f9e', '#e0b23a', '#2b2d33'];

export interface Costume {
  umbrella: boolean;
  mask: boolean;
}

export type Frame = 0 | 1 | 2 | 3;

/** Gait frame for a distance walked, in tiles. */
export function frameFor(distance: number): Frame {
  return (Math.floor(Math.max(0, distance) / STRIDE) % 4) as Frame;
}

const b = (x: number, y: number, z: number, l: number, w: number, h: number, paint: Box['paint']): Box => ({
  x, y, z, l, w, h, paint,
});

/** The boxes of a figure: 0.86 wide and 4.7 tall, legs apart on the odd frames. */
export function figureBoxes(frame: Frame, costume: Costume): Box[] {
  const split = frame === 1 ? 0.34 : frame === 3 ? 0.24 : 0;
  const bob = split > 0 ? 0.12 : 0;
  const out: Box[] = [];
  if (split > 0) {
    out.push(b(split, -0.22, 0, 0.5, 0.42, 2.0, 'trousers'), b(-split, 0.22, 0, 0.5, 0.42, 2.0, 'trousers'));
  } else {
    out.push(b(0, 0, 0, 0.6, 0.86, 2.0, 'trousers'));
  }
  out.push(b(0, 0, 2.0 + bob, 0.7, 1.1, 1.9, 'shirt'));
  out.push(b(0, 0, 3.9 + bob, 0.7, 0.7, 0.8, 'skin'));
  if (costume.mask) out.push(b(0.3, 0, 4.0 + bob, 0.16, 0.6, 0.35, 'white'));
  if (costume.umbrella) {
    out.push(b(0.2, 0.3, 2.6, 0.12, 0.12, 2.7, 'dark'));
    out.push(b(0.2, 0.3, 5.3 + bob, 2.2, 2.2, 0.35, 'umbrella'));
  }
  return out;
}

function tone(paint: Box['paint'], palette: number): string {
  const pal = PALETTES[palette % PALETTES.length];
  switch (paint) {
    case 'shirt':
      return pal.shirt;
    case 'trousers':
      return pal.trousers;
    case 'skin':
      return SKINS[palette % SKINS.length];
    case 'umbrella':
      return BROLLIES[(palette >> 1) % BROLLIES.length];
    case 'white':
      return '#e9ebee';
    default:
      return '#1e2026';
  }
}

export function paintFigure(
  ctx: CanvasRenderingContext2D,
  palette: number,
  frame: Frame,
  heading: number,
  cosA: number,
  sinA: number,
  costume: Costume,
): void {
  const faces = projectBoxes(figureBoxes(frame, costume), heading, cosA, sinA);
  const ground = projectBoxes([b(0, 0, 0, 1.0, 1.0, 0, 'dark')], heading, cosA, sinA).find((f) => f.top);
  if (ground) {
    ctx.fillStyle = 'rgba(18, 22, 36, 0.28)';
    fillPoly(ctx, ground.pts.map(([x, y]) => [x + 0.9, y + 0.7] as [number, number]));
  }
  for (const f of faces) {
    ctx.fillStyle = shade(tone(f.paint, palette), f.light - 1);
    fillPoly(ctx, f.pts);
  }
}

const HEADINGS = 8;
const boundsCache = new Map<string, SpriteSpec>();

/** The baked figure; frame 2 shares frame 0's standing pose. */
export function figureSprite(palette: number, frame: Frame, heading: number, quarter: 0 | 1 | 2 | 3, costume: Costume): Sprite {
  const fr: Frame = frame === 2 ? 0 : frame;
  const turn = heading / (Math.PI * 2);
  const h8 = ((Math.round(turn * HEADINGS) % HEADINGS) + HEADINGS) % HEADINGS;
  const c = (costume.umbrella ? 1 : 0) + (costume.mask ? 2 : 0);
  const pose = `${fr}.${h8}.${quarter}.${c}`;
  const key = `P.${palette}.${pose}`;
  const h = (h8 / HEADINGS) * Math.PI * 2;
  const cosA = Math.cos((quarter * Math.PI) / 2);
  const sinA = Math.sin((quarter * Math.PI) / 2);
  let spec = boundsCache.get(pose);
  if (!spec) {
    spec = spriteBounds(projectBoxes(figureBoxes(fr, costume), h, cosA, sinA));
    boundsCache.set(pose, spec);
  }
  return sprite(key, spec, (ctx) => paintFigure(ctx, palette, fr, h, cosA, sinA, costume));
}
