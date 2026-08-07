/** Visual skins: everything stays procedurally drawn — a skin restyles
 * palette, outlines, and proportions. Client preference, not save data.
 *
 * Skins are content: the shipped three come from the core pack, and a mod
 * can add more. The declarative HSL transform is compiled back into the
 * function shape the renderer already consumes, so nothing downstream moves.
 */

import { allSkins } from '../content/registry';
import type { SkinDef } from '../content/types';
import { clearSprites } from './spritecache';

export type SkinId = string;

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

/** Turn a declarative definition into the function-shaped Skin the renderer wants. */
export function compileSkin(def: SkinDef): Skin {
  const { hue, sat, light } = def;
  return {
    id: def.id,
    label: def.label,
    blurb: def.blurb,
    building: (h, s, l) => [
      hue.mode === 'wrap' ? hue.base + (h % hue.span) : h,
      clamp(s * (sat.mul ?? 1) + (sat.add ?? 0)),
      clamp(l * (light.mul ?? 1) + (light.add ?? 0)),
    ],
    outline: def.outline,
    heightScale: def.heightScale,
    grassSat: def.grassSat,
    roadFill: def.roadFill,
  };
}

/** Every registered skin, compiled. Derived per call: content loads at runtime. */
export function skins(): Skin[] {
  return allSkins().map(compileSkin);
}

const FALLBACK: Skin = compileSkin({
  id: 'classic',
  label: 'Classic',
  blurb: 'The standard look.',
  hue: { mode: 'identity' },
  sat: {},
  light: {},
  outline: 0,
  heightScale: 1,
  grassSat: 1,
  roadFill: '#3a3d42',
});

let active: Skin = FALLBACK;

export function setSkin(id: string): void {
  const next = skins().find((s) => s.id === id) ?? skins()[0] ?? FALLBACK;
  if (next.id !== active.id) clearSprites(); // every baked building is restyled
  active = next;
}

export function getSkin(): Skin {
  return active;
}
