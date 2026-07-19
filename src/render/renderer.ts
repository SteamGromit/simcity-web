import { idx, inBounds } from '../sim/grid';
import { mulberry32 } from '../sim/city';
import { CityState, GRID, MAX_ELEV, Terrain, Zone } from '../sim/types';
import { Automata } from './automata';
import { drawBuilding, drawFire, drawPole, fillPoly, fillTile, strokeTile, tree } from './buildings';
import { ELEV_PX, TileGeom, isoToScreen, screenToIso, setViewAngle, tileDepth, tileGeom } from './iso';
import { OverlayId, drawOverlay } from './overlays';
import { nightFactor, nightTint } from './daynight';

export interface ViewState {
  hover: { x: number; y: number } | null;
  hoverValid: boolean;
  overlay: OverlayId | null;
  /** Pending rectangle selection (zone/park/bulldoze drag), inclusive corners. */
  rect: { x0: number; y0: number; x1: number; y1: number } | null;
}

const TAU = Math.PI * 2;

export class Renderer {
  camera = { x: 0, y: 0, zoom: 1 };
  private angle = 0;
  private ctx: CanvasRenderingContext2D;
  private variants: Float32Array;
  private automata = new Automata();
  /** tile paint order for the current angle, ascending depth */
  private order: Uint16Array;
  private orderDirty = true;
  /** city from the latest draw; pick() needs elevations between frames */
  private lastCity: CityState | null = null;
  /** current 0..1 darkness, refreshed each draw */
  private night = 0;

  constructor(private canvas: HTMLCanvasElement, seed: number) {
    this.ctx = canvas.getContext('2d')!;
    this.variants = new Float32Array(GRID * GRID);
    this.order = new Uint16Array(GRID * GRID);
    this.reseed(seed);
    this.resize();
    setViewAngle(0);
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

  getAngle(): number {
    return this.angle;
  }

  /** Rotate the view, keeping the grid point at the screen center fixed. */
  rotateBy(delta: number) {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const wx = this.camera.x + w / 2 / this.camera.zoom;
    const wy = this.camera.y + h / 2 / this.camera.zoom;
    const g = screenToIso(wx, wy);
    this.angle = (((this.angle + delta) % TAU) + TAU) % TAU;
    setViewAngle(this.angle);
    const p = isoToScreen(g.x, g.y);
    this.camera.x = p.sx - w / 2 / this.camera.zoom;
    this.camera.y = p.sy - h / 2 / this.camera.zoom;
    this.orderDirty = true;
  }

  /** Canvas-client coordinates → tile, or null when off-map. Probes from the
   * highest elevation down so raised tiles pick correctly. */
  pick(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const wx = this.camera.x + (clientX - rect.left) / this.camera.zoom;
    const wy = this.camera.y + (clientY - rect.top) / this.camera.zoom;
    let ground: { x: number; y: number } | null = null;
    for (let e = MAX_ELEV; e >= 0; e--) {
      const f = screenToIso(wx, wy + e * ELEV_PX);
      const x = Math.floor(f.x);
      const y = Math.floor(f.y);
      if (!inBounds(x, y)) continue;
      if (e === 0) ground = { x, y };
      const elev = this.lastCity?.tiles[idx(x, y)].elevation ?? 0;
      if (elev === e) return { x, y };
    }
    return ground; // cursor on a cliff face — snap to the tile below
  }

  private rebuildOrder() {
    const depths = new Float64Array(GRID * GRID);
    for (let i = 0; i < depths.length; i++) {
      depths[i] = tileDepth(i % GRID, (i / GRID) | 0);
    }
    const indices = Array.from({ length: GRID * GRID }, (_, i) => i);
    indices.sort((a, b) => depths[a] - depths[b]);
    this.order.set(indices);
    this.orderDirty = false;
  }

  draw(city: CityState, view: ViewState) {
    const { ctx } = this;
    this.lastCity = city;
    setViewAngle(this.angle);
    if (this.orderDirty) this.rebuildOrder();
    const now = performance.now();
    this.night = nightFactor(now);
    this.automata.step(city, now);

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

    // Depth-sorted painter's order: valid at every view angle. Buildings
    // stay inside their tile footprint (see buildings.ts), so tile depth
    // alone decides occlusion.
    for (let n = 0; n < this.order.length; n++) {
      const i = this.order[n];
      const x = i % GRID;
      const y = (i / GRID) | 0;
      const t = city.tiles[i];
      const geom = tileGeom(x, y, t.elevation);
      this.drawCliffs(geom, city, x, y);
      this.drawGround(geom, city, x, y);
      if (t.zone !== Zone.None && t.zone !== Zone.Road) {
        drawBuilding(ctx, geom, t.zone, t.stage, t.abandoned, t.powered, this.variants[i], this.night);
      }
      if (t.burning > 0) drawFire(ctx, geom, now, this.variants[i]);
      this.automata.drawTile(ctx, i);
    }

    if (view.overlay) drawOverlay(ctx, city, view.overlay);

    if (this.night > 0.02) {
      // night wash in screen space; the cursor is drawn above it so it
      // stays readable after dark
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = nightTint(this.night);
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.restore();
    }

    const elevOf = (x: number, y: number) => city.tiles[idx(x, y)].elevation;
    if (view.rect) {
      const { x0, y0, x1, y1 } = view.rect;
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
          fillTile(ctx, tileGeom(x, y, elevOf(x, y)), 'rgba(255,255,255,0.22)');
        }
      }
    }

    if (view.hover) {
      strokeTile(
        ctx,
        tileGeom(view.hover.x, view.hover.y, elevOf(view.hover.x, view.hover.y)),
        view.hoverValid ? 'rgba(255,255,255,0.9)' : 'rgba(255,70,60,0.9)',
        2,
      );
    }
  }

  /** Direction across each edge of TileGeom.corners: [k] → [k+1] borders these. */
  private static EDGE_DIRS: [number, number][] = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ];

  /** Fill the vertical faces where this tile stands above a neighbor. Only
   * camera-facing edges are drawn; back faces hide behind the tile itself. */
  private drawCliffs(geom: TileGeom, city: CityState, x: number, y: number) {
    const t = city.tiles[idx(x, y)];
    if (t.elevation === 0) return;
    for (let k = 0; k < 4; k++) {
      const [dx, dy] = Renderer.EDGE_DIRS[k];
      const nElev = inBounds(x + dx, y + dy) ? city.tiles[idx(x + dx, y + dy)].elevation : 0;
      const drop = (t.elevation - nElev) * ELEV_PX;
      if (drop <= 0) continue;
      const c1 = geom.corners[k];
      const c2 = geom.corners[(k + 1) % 4];
      const midY = (c1[1] + c2[1]) / 2;
      if (midY <= geom.cy) continue; // back edge, hidden
      const midX = (c1[0] + c2[0]) / 2;
      const lit = midX < geom.cx ? 24 : 32; // two faces, two shades
      fillPoly(
        this.ctx,
        [c1, c2, [c2[0], c2[1] + drop], [c1[0], c1[1] + drop]],
        `hsl(28 32% ${lit}%)`,
      );
    }
  }

  private drawGround(geom: TileGeom, city: CityState, x: number, y: number) {
    const i = idx(x, y);
    const t = city.tiles[i];
    if (t.zone === Zone.Road) {
      if (t.terrain === Terrain.Water) {
        // bridge: water below, pylons at the front corners, then the deck
        fillTile(this.ctx, geom, `hsl(207 54% ${30 + this.variants[i] * 5}%)`);
        this.ctx.fillStyle = '#33363b';
        for (const [px, py] of geom.corners) {
          if (py > geom.cy) this.ctx.fillRect(px - 1.5, py - 2, 3, 7);
        }
        fillTile(this.ctx, geom, '#4a4e55');
      } else {
        fillTile(this.ctx, geom, '#3a3d42');
      }
      this.drawRoadLinks(geom, city, x, y);
      if (t.wire) drawPole(this.ctx, geom.cx, geom.cy);
      if (this.night > 0.3) {
        // streetlight pool
        this.ctx.fillStyle = `rgba(255, 214, 130, ${(0.22 * this.night).toFixed(3)})`;
        this.ctx.beginPath();
        this.ctx.arc(geom.cx, geom.cy, 7, 0, Math.PI * 2);
        this.ctx.fill();
      }
      return;
    }
    const v = this.variants[i];
    if (t.terrain === Terrain.Water) {
      fillTile(this.ctx, geom, `hsl(${205 + v * 8} ${52 + v * 6}% ${30 + v * 5}%)`);
      return;
    }
    fillTile(this.ctx, geom, `hsl(${96 + v * 10} ${30 + v * 8}% ${34 + v * 6}%)`);
    if (t.terrain === Terrain.Forest) {
      tree(this.ctx, geom.cx - 9 + v * 6, geom.cy - 3);
      tree(this.ctx, geom.cx + 5 - v * 4, geom.cy + 2 + v * 3);
      tree(this.ctx, geom.cx - 2 + v * 3, geom.cy - 8 + v * 2);
    }
  }

  /** Lane markings toward orthogonally-adjacent roads; a dot for dead ends. */
  private drawRoadLinks(geom: TileGeom, city: CityState, x: number, y: number) {
    const { ctx } = this;
    ctx.strokeStyle = 'rgba(220,210,140,0.7)';
    ctx.lineWidth = 1.5;
    let links = 0;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      if (!inBounds(x + dx, y + dy)) continue;
      const n = city.tiles[idx(x + dx, y + dy)];
      if (n.zone !== Zone.Road) continue;
      const own = city.tiles[idx(x, y)].elevation;
      if (Math.abs(n.elevation - own) > 1) continue; // cliff: no connection
      links++;
      // toward the shared edge, meeting the neighbor's ramp halfway up
      const edge = isoToScreen(x + 0.5 + dx / 2, y + 0.5 + dy / 2);
      const edgeY = edge.sy - ((own + n.elevation) / 2) * ELEV_PX;
      ctx.beginPath();
      ctx.moveTo(geom.cx, geom.cy);
      ctx.lineTo(edge.sx, edgeY);
      ctx.stroke();
    }
    if (links === 0) {
      ctx.fillStyle = 'rgba(220,210,140,0.7)';
      ctx.fillRect(geom.cx - 1.5, geom.cy - 1.5, 3, 3);
    }
  }
}
