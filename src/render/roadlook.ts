/**
 * How each class of road is painted. Pure functions over the class number so
 * the look stays testable and the renderer keeps only the drawing.
 *
 * The skin still owns the asphalt colour (`roadFill`); a highway is that same
 * asphalt, freshly laid and darker, so a restyled city restyles its motorways
 * with everything else.
 */

import { getSkin } from './skins';
import type { RoadClass } from '../sim/roads';

/** Mix a `#rrggbb` toward black (t < 0) or white (t > 0); |t| in 0..1.
 * Anything that isn't a six-digit hex passes through untouched. */
export function shadeHex(hex: string, t: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const to = t < 0 ? 0 : 255;
  const k = Math.min(1, Math.abs(t));
  const mix = (c: number) => Math.round(c + (to - c) * k);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Surface colour for a road tile of this class. */
export function roadSurface(cls: RoadClass): string {
  const base = getSkin().roadFill;
  // streets, routes and boulevards share the city's ordinary asphalt;
  // the motorway ladder is a blacker, newer pour
  return cls >= 3 ? shadeHex(base, -0.25) : base;
}

export interface RoadPaint {
  color: string;
  width: number;
}

/** Lane-marking paint: yellow centre lines on streets, white on motorways. */
export function roadPaint(cls: RoadClass): RoadPaint {
  if (cls >= 3) return { color: 'rgba(238,242,248,0.88)', width: 2.4 };
  if (cls >= 1) return { color: 'rgba(232,220,150,0.85)', width: 2 };
  return { color: 'rgba(220,210,140,0.7)', width: 1.5 };
}
