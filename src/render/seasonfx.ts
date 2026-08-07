/** Seasonal vegetation looks: a Config-toggleable, render-only tint.
 * The sim's own seasonality (weather, disasters, music) is unaffected. */

import { Season } from '../sim/weather';

const KEY = 'simcity.seasons';

const store = typeof localStorage !== 'undefined' ? localStorage : null;

let on = store?.getItem(KEY) !== '0'; // default on

export function getSeasonFx(): boolean {
  return on;
}

export function setSeasonFx(v: boolean): void {
  on = v;
  store?.setItem(KEY, v ? '1' : '0');
}

export interface VegTint {
  /** grass hue/lightness deltas over the base meadow ramp */
  grassHue: number;
  grassLight: number;
  /** tree canopy color */
  canopy: string;
}

const TINTS: Record<Season, VegTint> = {
  spring: { grassHue: 8, grassLight: 3, canopy: 'hsl(110 52% 36%)' },
  summer: { grassHue: 0, grassLight: 0, canopy: 'hsl(120 45% 30%)' },
  autumn: { grassHue: -28, grassLight: -2, canopy: 'hsl(28 62% 40%)' },
  winter: { grassHue: -10, grassLight: 9, canopy: 'hsl(100 12% 42%)' },
};

/** The active tint, or summer's neutral look while the toggle is off. */
export function vegTint(season: Season): VegTint {
  return on ? TINTS[season] : TINTS.summer;
}

/** The season anything *baked* should be wearing: summer while the toggle is
 * off, so a sprite key never disagrees with the ground under it. */
export function effectiveSeason(season: Season): Season {
  return on ? season : 'summer';
}
