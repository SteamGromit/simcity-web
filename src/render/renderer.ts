import { idx, inBounds } from '../sim/grid';
import { mulberry32 } from '../sim/city';
import { CityState, GRID, Zone } from '../sim/types';
import { Automata } from './automata';
import { drawBuilding, drawPole, diamond } from './buildings';
import { TILE_H, TILE_W, isoToScreen, screenToIso } from './iso';
import { OverlayId, drawOverlay } from './overlays';

export interface ViewState {
  hover: { x: number; y: number } | null;
  hoverValid: boolean;
  overlay: OverlayId | null;
  /** Pending rectangle selection (zone/park/bulldoze drag), inclusive corners. */
  rect: { x0: number; y0: number; x1: number; y1: number } | null;
}

const HW = TILE_W / 2;
const HH = TILE_H / 2;

export class Renderer {
  camera = { x: 0, y: 0, zoom: 1 };
  private ctx: CanvasRenderingContext2D;
  private variants: Float32Array;
  private automata = new Automata();

  constructor(private canvas: HTMLCanvasElement, seed: number) {
    this.ctx = canvas.getContext('2d')!;
    this.variants = new Float32Array(GRID * GRID);
    this.reseed(seed);
    this.resize();
    // start centered on the middle of the map
    const mid = isoToScreen(GRID / 2, GRID / 2);
    this.camera.x = mid.sx - this.canvas.clientWidth / 2;
    this.camera.y = mid.sy - this.canvas.clientHeight / 2;
  }

  /** Re-derive per-tile visual variation; call when a different city loads. */
  reseed(seed: number) {
    const rand = mulberry32(seed);
    for (let i = 0; i < this.variants.length; i++) this.variants[i] = rand();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = this.canvas.clientWidth * dpr;
    this.canvas.height = this.canvas.clientHeight * dpr;
  }

  /** Canvas-client coordinates → tile, or null when off-map. */
  pick(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const wx = this.camera.x + (clientX - rect.left) / this.camera.zoom;
    const wy = this.camera.y + (clientY - rect.top) / this.camera.zoom;
    const f = screenToIso(wx, wy);
    const x = Math.floor(f.x);
    const y = Math.floor(f.y);
    return inBounds(x, y) ? { x, y } : null;
  }

  draw(city: CityState, view: ViewState) {
    const { ctx } = this;
    this.automata.step(city, performance.now());
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#10151c';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(
      this.camera.zoom * dpr,
      0,
      0,
      this.camera.zoom * dpr,
      -this.camera.x * this.camera.zoom * dpr,
      -this.camera.y * this.camera.zoom * dpr,
    );

    // Row-major is a valid painter's order: every occluder of a tile has
    // both coordinates ≥ the tile's, so it is always drawn later. This
    // holds only while each building's pixels stay within ±TILE_W/2 of its
    // tile center — multi-tile or overhanging buildings need a real
    // depth sort.
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const i = idx(x, y);
        const t = city.tiles[i];
        const { sx, sy } = isoToScreen(x, y);
        this.drawGround(sx, sy, city, x, y);
        if (t.zone !== Zone.None && t.zone !== Zone.Road) {
          drawBuilding(ctx, sx, sy, t.zone, t.stage, t.abandoned, t.powered, this.variants[i]);
        }
        this.automata.drawTile(ctx, i);
      }
    }

    if (view.overlay) drawOverlay(ctx, city, view.overlay);

    if (view.rect) {
      const { x0, y0, x1, y1 } = view.rect;
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
          const { sx, sy } = isoToScreen(x, y);
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + HW, sy + HH);
          ctx.lineTo(sx, sy + TILE_H);
          ctx.lineTo(sx - HW, sy + HH);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    if (view.hover) {
      const { sx, sy } = isoToScreen(view.hover.x, view.hover.y);
      ctx.strokeStyle = view.hoverValid ? 'rgba(255,255,255,0.9)' : 'rgba(255,70,60,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + HW, sy + HH);
      ctx.lineTo(sx, sy + TILE_H);
      ctx.lineTo(sx - HW, sy + HH);
      ctx.closePath();
      ctx.stroke();
    }
  }

  private drawGround(sx: number, sy: number, city: CityState, x: number, y: number) {
    const i = idx(x, y);
    const t = city.tiles[i];
    if (t.zone === Zone.Road) {
      diamond(this.ctx, sx, sy, '#3a3d42');
      this.drawRoadLinks(sx, sy, city, x, y);
      if (t.wire) drawPole(this.ctx, sx, sy);
      return;
    }
    const v = this.variants[i];
    diamond(this.ctx, sx, sy, `hsl(${96 + v * 10} ${30 + v * 8}% ${34 + v * 6}%)`);
  }

  /** Lane markings toward orthogonally-adjacent roads; a dot for dead ends. */
  private drawRoadLinks(sx: number, sy: number, city: CityState, x: number, y: number) {
    const { ctx } = this;
    const cx = sx;
    const cy = sy + HH;
    ctx.strokeStyle = 'rgba(220,210,140,0.7)';
    ctx.lineWidth = 1.5;
    let links = 0;
    const dirs: [number, number, number, number][] = [
      [1, 0, HW / 2, HH / 2], // +x → screen right-down
      [-1, 0, -HW / 2, -HH / 2],
      [0, 1, -HW / 2, HH / 2], // +y → screen left-down
      [0, -1, HW / 2, -HH / 2],
    ];
    for (const [dx, dy, ex, ey] of dirs) {
      if (!inBounds(x + dx, y + dy)) continue;
      if (city.tiles[idx(x + dx, y + dy)].zone !== Zone.Road) continue;
      links++;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + ex, cy + ey);
      ctx.stroke();
    }
    if (links === 0) {
      ctx.fillStyle = 'rgba(220,210,140,0.7)';
      ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
    }
  }
}
