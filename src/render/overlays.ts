import { CityState, Zone } from '../sim/types';
import { GRID } from '../sim/types';
import { fillTile } from './buildings';
import { tileGeom } from './iso';

export type OverlayId =
  | 'power'
  | 'pollution'
  | 'landvalue'
  | 'traffic'
  | 'fire'
  | 'police'
  | 'school'
  | 'health';

export const OVERLAY_LABELS: Record<OverlayId, string> = {
  power: 'Power',
  pollution: 'Pollution',
  landvalue: 'Land Value',
  traffic: 'Traffic',
  fire: 'Fire Cover',
  police: 'Police Cover',
  school: 'School Cover',
  health: 'Health Cover',
};

const COVERAGE_FIELD = {
  fire: 'fireCov',
  police: 'policeCov',
  school: 'schoolCov',
  health: 'healthCov',
} as const;

function tint(city: CityState, i: number, overlay: OverlayId): string | null {
  const t = city.tiles[i];
  switch (overlay) {
    case 'power':
      if (t.zone === Zone.None || t.zone === Zone.Road) return null;
      return t.powered ? 'rgba(80,220,100,0.45)' : 'rgba(230,60,50,0.5)';
    case 'pollution':
      if (t.pollution <= 0.02) return null;
      return `rgba(122,72,30,${Math.min(0.75, t.pollution * 0.8)})`;
    case 'landvalue': {
      const hue = 240 - 180 * t.landValue; // blue → yellow-green
      return `hsl(${hue} 70% 50% / 0.45)`;
    }
    case 'traffic': {
      if (t.zone !== Zone.Road) return null;
      const v = Math.min(1, t.traffic / 20);
      return `hsl(${120 - 120 * v} 80% 45% / 0.6)`;
    }
    case 'fire':
    case 'police':
    case 'school':
    case 'health': {
      const cov = t[COVERAGE_FIELD[overlay]];
      const developable =
        t.zone === Zone.Residential || t.zone === Zone.Commercial || t.zone === Zone.Industrial;
      if (cov > 0) return `rgba(80,220,100,${0.15 + 0.4 * cov})`;
      if (developable && t.stage > 0 && !t.abandoned) return 'rgba(230,60,50,0.5)';
      return null;
    }
  }
}

/** Translucent data-view wash, SC4-style. Drawn over terrain and buildings. */
export function drawOverlay(ctx: CanvasRenderingContext2D, city: CityState, overlay: OverlayId) {
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const fill = tint(city, y * GRID + x, overlay);
      if (!fill) continue;
      fillTile(ctx, tileGeom(x, y), fill);
    }
  }
}
