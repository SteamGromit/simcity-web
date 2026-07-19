import { idx, inBounds } from '../sim/grid';
import { mulberry32 } from '../sim/city';
import { CityState, GRID, MAX_ELEV, Terrain, Zone } from '../sim/types';
import { Automata } from './automata';
import {
  drawBuilding,
  drawFire,
  drawPole,
  drawRubble,
  fillPoly,
  fillTile,
  strokeTile,
  tree,
} from './buildings';
import { ELEV_PX, TileGeom, isoToScreen, screenToIso, setViewAngle, tileDepth, tileGeom } from './iso';
import { DisasterFx } from './disasterfx';
import { OverlayId, drawOverlay } from './overlays';
import { nightFactor, nightTint } from './daynight';
import { getSkin } from './skins';
import { getWeatherFx } from './fx';

export interface ViewState {
  hover: { x: number; y: number } | null;
  hoverValid: boolean;
  overlay: OverlayId | null;
  /** Pending rectangle selection (zone/park/bulldoze drag), inclusive corners. */
  rect: { x0: number; y0: number; x1: number; y1: number } | null;
  /** Pending road line (adjustable until released). */
  line: [number, number][] | null;
}

const TAU = Math.PI * 2;

/** Automata time multiplier per sim speed (pause/normal/fast/cheetah). */
const AUTOMATA_SCALE = [0, 1, 1.8, 3] as const;

export class Renderer {
  camera = { x: 0, y: 0, zoom: 1 };
  /** Current sim speed, fed by the UI so street life keeps pace. */
  simSpeed: 0 | 1 | 2 | 3 = 1;
  private angle = 0;
  private ctx: CanvasRenderingContext2D;
  private variants: Float32Array;
  private automata = new Automata();
  private disasterFx = new DisasterFx();
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
    this.automata.step(city, now, AUTOMATA_SCALE[this.simSpeed]);
    this.disasterFx.step(city, now, AUTOMATA_SCALE[this.simSpeed]);

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
      if (t.rubble > 0) drawRubble(ctx, geom, this.variants[i]);
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

    if (city.disasters.tornado) {
      const tor = city.disasters.tornado;
      const g = tileGeom(tor.x, tor.y, city.tiles[idx(tor.x, tor.y)].elevation);
      // swirling stacked funnel
      for (let k = 0; k < 6; k++) {
        const rr = 4 + k * 3.2;
        const wob = Math.sin(now / 90 + k * 1.7) * 3;
        ctx.fillStyle = `rgba(120, 118, 125, ${0.55 - k * 0.06})`;
        ctx.beginPath();
        ctx.ellipse(g.cx + wob, g.cy - 6 - k * 7, rr, rr * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    this.disasterFx.drawWorld(ctx, city, now);

    const storm = city.disasters.hurricaneTicks > 0;
    const fx = getWeatherFx(); // hurricane rain always shows — it's a disaster cue
    if (storm || (fx && city.weather.kind === 'rain')) this.drawRain(now, storm ? 1 : 0.45);
    else if (fx && city.weather.kind === 'snow') this.drawSnow(now);
    else if (fx && city.weather.kind === 'cloudy') {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = 'rgba(120, 130, 150, 0.10)';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.restore();
    }
    // storm washes go before the cursor layers so the cursor stays readable
    this.disasterFx.drawScreen(ctx, city, now);

    const elevOf = (x: number, y: number) => city.tiles[idx(x, y)].elevation;
    if (view.rect) {
      const { x0, y0, x1, y1 } = view.rect;
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
          fillTile(ctx, tileGeom(x, y, elevOf(x, y)), 'rgba(255,255,255,0.22)');
        }
      }
    }

    if (view.line) {
      for (const [x, y] of view.line) {
        fillTile(ctx, tileGeom(x, y, elevOf(x, y)), 'rgba(255,235,150,0.35)');
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

  /** Screen-space driving rain; intensity 1 = full hurricane. */
  private drawRain(now: number, intensity: number) {
    const { ctx } = this;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = `rgba(40, 55, 80, ${0.18 * intensity})`;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.strokeStyle = `rgba(180, 200, 230, ${0.35 * intensity})`;
    ctx.lineWidth = 1;
    const shift = (now / 3) % 40;
    const step = intensity >= 1 ? 17 : 31;
    ctx.beginPath();
    for (let ry = 0; ry < this.canvas.height; ry += 34) {
      for (let rx = ((ry * 13) % 29) - 29; rx < this.canvas.width; rx += step) {
        ctx.moveTo(rx + shift, ry + ((now / 4) % 34));
        ctx.lineTo(rx + shift - 6, ry + 14 + ((now / 4) % 34));
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  /** Screen-space drifting snowfall with a faint ground whitening. */
  private drawSnow(now: number) {
    const { ctx } = this;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(235, 240, 250, 0.08)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = 'rgba(250, 252, 255, 0.8)';
    const w = this.canvas.width;
    const h = this.canvas.height;
    for (let k = 0; k < 160; k++) {
      const seed = k * 2654435761;
      const x = (seed % w) + Math.sin(now / 900 + k) * 14;
      const y = (((seed >> 8) % h) + now * (0.02 + (k % 5) * 0.006)) % h;
      ctx.fillRect(((x % w) + w) % w, y, 2, 2);
    }
    ctx.restore();
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
        fillTile(this.ctx, geom, getSkin().roadFill);
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
    if (t.elevation >= 5) {
      // snowcapped summit
      fillTile(this.ctx, geom, `hsl(210 ${14 + v * 10}% ${82 + v * 6}%)`);
    } else if (t.elevation === 4) {
      // bare rock above the treeline
      fillTile(this.ctx, geom, `hsl(28 ${10 + v * 6}% ${42 + v * 6}%)`);
    } else if (city.biome === 'desert') {
      const gs = Math.min(95, (40 + v * 8) * getSkin().grassSat);
      fillTile(this.ctx, geom, `hsl(${42 + v * 8} ${gs}% ${56 + v * 6}%)`);
    } else {
      const gs = Math.min(95, (30 + v * 8) * getSkin().grassSat);
      fillTile(this.ctx, geom, `hsl(${96 + v * 10} ${gs}% ${34 + v * 6}%)`);
    }
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
