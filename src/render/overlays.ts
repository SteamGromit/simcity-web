import { CityState, ROAD_CAPACITY, Zone } from '../sim/types';
import { GRID } from '../sim/types';
import { demandReading } from '../sim/develop';
import { fillTile } from './buildings';
import { tileGeom } from './iso';

export type OverlayId =
  | 'power'
  | 'pollution'
  | 'landvalue'
  | 'traffic'
  | 'demand'
  | 'fire'
  | 'police'
  | 'school'
  | 'health'
  | 'garbage'
  | 'garbagecov'
  | 'crime'
  | 'water';

export const OVERLAY_LABELS: Record<OverlayId, string> = {
  power: 'Power',
  pollution: 'Pollution',
  landvalue: 'Land Value',
  traffic: 'Traffic',
  demand: 'Demand',
  fire: 'Fire Cover',
  police: 'Police Cover',
  school: 'School Cover',
  health: 'Health Cover',
  garbage: 'Garbage',
  garbagecov: 'Refuse Cover',
  crime: 'Crime',
  water: 'Water',
};

const COVERAGE_FIELD = {
  fire: 'fireCov',
  police: 'policeCov',
  school: 'schoolCov',
  health: 'healthCov',
  garbagecov: 'garbageCov',
} as const;

function tint(city: CityState, i: number, overlay: OverlayId): string | null {
  const t = city.tiles[i];
  switch (overlay) {
    case 'power':
      if (t.zone === Zone.None || t.zone === Zone.Road) return null;
      return t.powered ? 'rgba(80,220,100,0.45)' : 'rgba(230,60,50,0.5)';
    case 'water':
      if (t.zone === Zone.None || t.zone === Zone.Road) return t.pipe ? 'rgba(80,160,230,0.5)' : null;
      return t.watered ? 'rgba(80,160,230,0.45)' : 'rgba(230,60,50,0.5)';
    case 'pollution':
      if (t.pollution <= 0.02) return null;
      return `rgba(122,72,30,${Math.min(0.75, t.pollution * 0.8)})`;
    case 'landvalue': {
      const hue = 240 - 180 * t.landValue; // blue → yellow-green
      return `hsl(${hue} 70% 50% / 0.45)`;
    }
    case 'traffic': {
      if (t.zone !== Zone.Road) return null;
      // a crash flags red before any congestion colour
      if (t.accident > 0) return 'rgba(230,40,40,0.7)';
      const v = Math.min(1, t.traffic / (ROAD_CAPACITY * 2));
      return `hsl(${120 - 120 * v} 80% 45% / 0.6)`;
    }
    case 'demand': {
      const reading = demandReading(city, i % GRID, (i / GRID) | 0);
      if (!reading) return null;
      if (reading.blocked) return 'rgba(100,116,139,0.5)';
      if (reading.collapsing) return 'rgba(230,60,50,0.5)';
      if (reading.pressure > 0)
        return `rgba(80,220,100,${0.15 + Math.min(0.45, reading.pressure)})`;
      return 'rgba(255,235,150,0.25)';
    }
    case 'garbage': {
      // the heap itself: what the player actually wants to hunt down
      if (t.garbage <= 0.01) return null;
      return `rgba(96,84,42,${Math.min(0.8, 0.2 + t.garbage * 0.7)})`;
    }
    case 'crime': {
      if (t.crime <= 0.02) return null;
      // amber → red as it worsens
      return `hsl(${45 - 45 * Math.min(1, t.crime)} 85% 45% / ${Math.min(0.75, 0.2 + t.crime * 0.6)})`;
    }
    case 'garbagecov':
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
      fillTile(ctx, tileGeom(x, y, city.tiles[y * GRID + x].elevation), fill);
    }
  }
}
