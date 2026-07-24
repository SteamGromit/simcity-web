import { CityState, GRID, Terrain, Zone } from '../sim/types';
import { isoToScreen, screenToIso } from '../render/iso';

const SCALE = 2; // px per tile

const ZONE_COLORS: Record<Zone, string> = {
  [Zone.None]: '#2c4a2e',
  [Zone.Residential]: '#3f7a46',
  [Zone.Commercial]: '#3d6ea8',
  [Zone.Industrial]: '#9a8a3a',
  [Zone.Road]: '#55585e',
  [Zone.PowerPlant]: '#6b4a3f',
  [Zone.PowerLine]: '#7a7264',
  [Zone.Park]: '#4d9a50',
  [Zone.FireStation]: '#b0483c',
  [Zone.PoliceStation]: '#4a5fb0',
  [Zone.School]: '#b09a5e',
  [Zone.Hospital]: '#d8e2e6',
  [Zone.BusStop]: '#3f8f8a',
  [Zone.WaterPump]: '#3f6fb0',
  [Zone.WaterPipe]: '#5a7d9c',
  [Zone.SolarPlant]: '#6b4a3f',
  [Zone.WindTurbine]: '#6b4a3f',
  [Zone.HydroPlant]: '#6b4a3f',
  [Zone.NuclearPlant]: '#6b4a3f',
  [Zone.StreetcarStop]: '#3f8f8a',
  [Zone.MonorailStation]: '#3f8f8a',
  [Zone.SubwayStation]: '#3f8f8a',
  [Zone.RailTerminal]: '#3f8f8a',
  [Zone.Landfill]: '#6b6250',
  [Zone.Incinerator]: '#7a6f66',
  [Zone.RecyclingCentre]: '#4f8f5a',
  [Zone.Prison]: '#6d7075',
};

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

/** Grid-space overview map with a viewport outline; click to jump the camera. */
export function buildMinimap(
  root: HTMLElement,
  jump: (worldX: number, worldY: number) => void,
) {
  const el = document.createElement('canvas');
  el.id = 'minimap';
  el.className = 'panel';
  el.width = GRID * SCALE;
  el.height = GRID * SCALE;
  root.appendChild(el);
  const ctx = el.getContext('2d')!;

  const raster = document.createElement('canvas');
  raster.width = el.width;
  raster.height = el.height;
  const rctx = raster.getContext('2d')!;

  el.addEventListener('pointerdown', (e) => {
    const rect = el.getBoundingClientRect();
    const gx = ((e.clientX - rect.left) / rect.width) * GRID;
    const gy = ((e.clientY - rect.top) / rect.height) * GRID;
    const { sx, sy } = isoToScreen(gx, gy);
    jump(sx, sy);
  });

  let frame = 0;
  return {
    /** Force a raster repaint next frame (call after Load/New). */
    invalidate() {
      frame = 0;
    },
    update(city: CityState, camera: Camera, gameCanvas: HTMLCanvasElement) {
      if (frame++ % 15 === 0) {
        for (let y = 0; y < GRID; y++) {
          for (let x = 0; x < GRID; x++) {
            const t = city.tiles[y * GRID + x];
            const bare = t.zone === Zone.None && t.terrain === Terrain.Grass;
            rctx.fillStyle = t.abandoned
              ? '#4a4038'
              : t.zone === Zone.None && t.terrain === Terrain.Water
                ? '#2e5f8a'
                : t.zone === Zone.None && t.terrain === Terrain.Forest
                  ? '#1e3d24'
                  : bare && t.elevation >= 5
                    ? '#dfe5ec'
                    : bare && t.elevation === 4
                      ? '#6f665c'
                      : bare && city.biome === 'desert'
                        ? '#b3a05e'
                        : ZONE_COLORS[t.zone];
            rctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
            if (t.elevation > 0) {
              rctx.fillStyle = `rgba(255,250,230,${0.09 * t.elevation})`; // highlands
              rctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
            }
            if (t.stage >= 4) {
              rctx.fillStyle = 'rgba(255,255,255,0.35)'; // downtown glints
              rctx.fillRect(x * SCALE, y * SCALE, 1, 1);
            }
          }
        }
      }
      ctx.drawImage(raster, 0, 0);

      // viewport outline: project the game canvas corners into grid space
      const corners: [number, number][] = [
        [0, 0],
        [gameCanvas.clientWidth, 0],
        [gameCanvas.clientWidth, gameCanvas.clientHeight],
        [0, gameCanvas.clientHeight],
      ];
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      corners.forEach(([cx, cy], i) => {
        const wx = camera.x + cx / camera.zoom;
        const wy = camera.y + cy / camera.zoom;
        const g = screenToIso(wx, wy);
        const px = Math.max(0, Math.min(GRID, g.x)) * SCALE;
        const py = Math.max(0, Math.min(GRID, g.y)) * SCALE;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.stroke();
    },
  };
}
