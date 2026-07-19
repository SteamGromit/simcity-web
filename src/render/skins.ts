/** Visual skins: everything stays procedurally drawn — a skin restyles
 * palette, outlines, and proportions. Client preference, not save data. */

export type SkinId = 'classic' | 'springfield' | 'nyc';

export interface Skin {
  id: SkinId;
  label: string;
  blurb: string;
  /** Remap a building face color; inputs/outputs are HSL components. */
  building(h: number, s: number, l: number): [number, number, number];
  /** Cartoon outline width around building faces; 0 = none. */
  outline: number;
  /** Multiplier on building heights. */
  heightScale: number;
  /** Ground/road tints. */
  grassSat: number; // multiplier on grass saturation
  roadFill: string;
}

const clamp = (v: number) => Math.max(0, Math.min(100, v));

export const SKINS: Skin[] = [
  {
    id: 'classic',
    label: 'Classic',
    blurb: 'The standard look.',
    building: (h, s, l) => [h, s, l],
    outline: 0,
    heightScale: 1,
    grassSat: 1,
    roadFill: '#3a3d42',
  },
  {
    id: 'springfield',
    label: 'Springfield',
    blurb: 'Saturday-morning cartoon: bold outlines, loud colors, squat little buildings.',
    building: (h, s, l) => [h, clamp(s * 1.6 + 10), clamp(l * 1.05 + 6)],
    outline: 1.6,
    heightScale: 0.9,
    grassSat: 1.35,
    roadFill: '#4a4450',
  },
  {
    id: 'nyc',
    label: 'NYC',
    blurb: 'Brownstone and brick: muted tones, taller silhouettes, asphalt grey.',
    building: (h, s, l) => [15 + (h % 40), clamp(s * 0.55 + 8), clamp(l * 0.92)],
    outline: 0,
    heightScale: 1.2,
    grassSat: 0.7,
    roadFill: '#33353a',
  },
];

let active: Skin = SKINS[0];

export function setSkin(id: string): void {
  active = SKINS.find((s) => s.id === id) ?? SKINS[0];
}

export function getSkin(): Skin {
  return active;
}
