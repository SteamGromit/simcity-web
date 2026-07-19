import { CityState, Zone } from '../sim/types';
import { GRID } from '../sim/types';
import { diamond } from './buildings';
import { isoToScreen } from './iso';

export type OverlayId = 'power' | 'pollution' | 'landvalue' | 'traffic';

export const OVERLAY_LABELS: Record<OverlayId, string> = {
  power: 'Power',
  pollution: 'Pollution',
  landvalue: 'Land Value',
  traffic: 'Traffic',
};

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
  }
}

/** Translucent data-view wash, SC4-style. Drawn over terrain and buildings. */
export function drawOverlay(ctx: CanvasRenderingContext2D, city: CityState, overlay: OverlayId) {
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const fill = tint(city, y * GRID + x, overlay);
      if (!fill) continue;
      const { sx, sy } = isoToScreen(x, y);
      diamond(ctx, sx, sy, fill);
    }
  }
}
