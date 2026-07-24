import { idx, inBounds, neighbors4, tilesWithin } from '../sim/grid';
import { mulberry32 } from '../sim/city';
import { BuildTool, CityState, GRID, MAX_ELEV, Terrain, Zone } from '../sim/types';
import { Automata } from './automata';
import {
  drawBuilding,
  drawFire,
  drawCrimeFlash,
  drawAccident,
  drawCollapse,
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
import { darknessAlpha, getDayNight, nightFactor, nightTint } from './daynight';
import { isPlant } from '../sim/energy';
import { groundShade } from './terrainshade';
import { detailLevel } from './detail';
import { drawLineVehicles } from './linevehicles';
import { PIXEL_SCALE, getRenderStyle } from './renderstyle';
import { VegTint, vegTint } from './seasonfx';
import { seasonOf } from '../sim/weather';
import { setCanopyColor } from './buildings';
import { getSkin } from './skins';
import { getWeatherFx } from './fx';

export interface ViewState {
  hover: { x: number; y: number } | null;
  hoverValid: boolean;
  overlay: OverlayId | null;
  /** Pending rectangle selection (zone/park/bulldoze drag), inclusive corners. */
  rect: { x0: number; y0: number; x1: number; y1: number } | null;
  /** Pending drag line (adjustable until released). */
  line: [number, number][] | null;
  /** Tool the pending line will build (road / power line / pipe). */
  lineTool: BuildTool | null;
  /** Coverage footprint preview while placing a service building. */
  halo: { x: number; y: number; radius: number } | null;
  /** Live transit-wizard preview: drawn path, stops, pending segment. */
  transitDraft: {
    color: string;
    path: [number, number][];
    stops: [number, number][];
    pending: [number, number][] | null;
  } | null;
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
  private mainCtx: CanvasRenderingContext2D;
  private buffer: HTMLCanvasElement | null = null;
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
  /** Hurricane state for the current frame: wind lean px and storm flag. */
  private wind = 0;
  private storm = false;
  private frameNow = 0;
  /** Accumulated sim-speed-scaled time (ms) driving line vehicles. */
  private lineClock = 0;
  /** Current frame's LOD, shared with the ground pass. */
  private detail: 0 | 1 | 2 = 1;
  /** Seasonal vegetation tint for the current frame. */
  private veg: VegTint = vegTint('summer');

  constructor(private canvas: HTMLCanvasElement, seed: number) {
    this.ctx = canvas.getContext('2d')!;
    this.mainCtx = this.ctx;
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
    // Pixel look: draw the frame on a smaller buffer, then blit it up
    // with nearest-neighbor so every mark lands on chunky pixels.
    const style = getRenderStyle();
    const ps = style === 'pixel' ? PIXEL_SCALE : 1;
    if (ps < 1) {
      const bw = Math.max(1, Math.ceil(this.canvas.width * ps));
      const bh = Math.max(1, Math.ceil(this.canvas.height * ps));
      if (!this.buffer) this.buffer = document.createElement('canvas');
      if (this.buffer.width !== bw) this.buffer.width = bw;
      if (this.buffer.height !== bh) this.buffer.height = bh;
      this.ctx = this.buffer.getContext('2d')!;
    } else {
      this.ctx = this.mainCtx;
    }
    const { ctx } = this;
    this.lastCity = city;
    setViewAngle(this.angle);
    if (this.orderDirty) this.rebuildOrder();
    const now = performance.now();
    this.night = getDayNight() ? nightFactor(now) : 0;
    // clamp the frame delta so a background tab doesn't fast-forward
    this.lineClock +=
      Math.min(100, Math.max(0, now - this.frameNow)) * AUTOMATA_SCALE[this.simSpeed];
    this.frameNow = now;
    this.storm = city.disasters.hurricaneTicks > 0;
    this.wind = this.storm ? -4 + Math.sin(now / 120) * 3 : 0;
    this.automata.step(city, now, AUTOMATA_SCALE[this.simSpeed]);
    this.disasterFx.step(city, now, AUTOMATA_SCALE[this.simSpeed]);

    const dpr = (window.devicePixelRatio || 1) * ps;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#10151c';
    ctx.fillRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
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
    const detail = detailLevel(this.camera.zoom);
    this.detail = detail;
    this.veg = vegTint(seasonOf(city.month));
    setCanopyColor(this.veg.canopy);
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
        drawBuilding(
          ctx,
          geom,
          t.zone,
          t.stage,
          t.tier,
          t.abandoned,
          t.powered,
          this.variants[i],
          this.night,
          detail,
        );
      }
      if (t.burning > 0) drawFire(ctx, geom, now, this.variants[i]);
      if (t.crimeFlash > 0) {
        drawCrimeFlash(ctx, geom, now, Math.min(1, t.crimeFlash / 90));
        t.crimeFlash -= 1; // render-only decay; not part of the sim tick
      }
      if (t.accident > 0) drawAccident(ctx, geom, now);
      if (t.collapseFlash > 0) {
        drawCollapse(ctx, geom, Math.min(1, t.collapseFlash / 90));
        t.collapseFlash -= 1; // render-only decay
      }
      this.automata.drawTile(ctx, i);
    }

    if (style === 'realistic') {
      // atmospheric depth: the far half of the frame cools and hazes
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const H = this.ctx.canvas.height;
      const haze = ctx.createLinearGradient(0, 0, 0, H * 0.55);
      haze.addColorStop(0, 'rgba(185, 200, 222, 0.16)');
      haze.addColorStop(1, 'rgba(185, 200, 222, 0)');
      ctx.fillStyle = haze;
      ctx.fillRect(0, 0, this.ctx.canvas.width, H * 0.55);
      ctx.restore();
    }

    this.drawTransitLines(city, view);

    if (view.overlay) drawOverlay(ctx, city, view.overlay);

    if (this.night > 0.02) {
      // dim ambient wash everywhere, then deep darkness that street
      // and building light punches through — settled areas glow, the
      // wilds go properly black
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = nightTint(this.night);
      ctx.fillRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
      ctx.restore();
      this.drawDarkness(city, dpr);
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
      ctx.fillRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
      ctx.restore();
    }
    // storm washes go before the cursor layers so the cursor stays readable
    this.disasterFx.drawScreen(ctx, city, now);

    const elevOf = (x: number, y: number) => city.tiles[idx(x, y)].elevation;
    if (view.halo) {
      const { x: hx, y: hy, radius } = view.halo;
      for (const [nx, ny] of tilesWithin(hx, hy, radius)) {
        const d = Math.max(Math.abs(nx - hx), Math.abs(ny - hy));
        const cov = 1 - d / (radius + 1);
        // same tint the coverage data views use for covered tiles
        fillTile(ctx, tileGeom(nx, ny, elevOf(nx, ny)), `rgba(80,220,100,${0.15 + 0.4 * cov})`);
      }
    }
    if (view.rect) {
      const { x0, y0, x1, y1 } = view.rect;
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
          fillTile(ctx, tileGeom(x, y, elevOf(x, y)), 'rgba(255,255,255,0.22)');
        }
      }
    }

    if (view.line) {
      const tint =
        view.lineTool === 'pipe' ? 'rgba(120,180,255,0.35)' : 'rgba(255,235,150,0.35)';
      for (const [x, y] of view.line) {
        fillTile(ctx, tileGeom(x, y, elevOf(x, y)), tint);
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

    if (ps < 1 && this.buffer) {
      // the whole frame lands as chunky pixels in one nearest-neighbor blit
      const m = this.mainCtx;
      m.setTransform(1, 0, 0, 1, 0, 0);
      m.imageSmoothingEnabled = false;
      m.drawImage(this.buffer, 0, 0, this.canvas.width, this.canvas.height);
    }
  }

  /** Screen-space driving rain; intensity 1 = full hurricane. */
  private drawRain(now: number, intensity: number) {
    const { ctx } = this;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = `rgba(40, 55, 80, ${0.18 * intensity})`;
    ctx.fillRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
    ctx.strokeStyle = `rgba(180, 200, 230, ${0.35 * intensity})`;
    ctx.lineWidth = 1;
    const shift = (now / 3) % 40;
    const step = intensity >= 1 ? 17 : 31;
    ctx.beginPath();
    for (let ry = 0; ry < this.ctx.canvas.height; ry += 34) {
      for (let rx = ((ry * 13) % 29) - 29; rx < this.ctx.canvas.width; rx += step) {
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
    ctx.fillRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
    ctx.fillStyle = 'rgba(250, 252, 255, 0.8)';
    const w = this.ctx.canvas.width;
    const h = this.ctx.canvas.height;
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
      const lit = midX < geom.cx ? 26 : 32; // two faces, two shades
      fillPoly(
        this.ctx,
        [c1, c2, [c2[0], c2[1] + drop], [c1[0], c1[1] + drop]],
        `hsl(28 32% ${lit}%)`,
      );
      // strata soften the raw wedge; a lip highlight catches the edge
      this.ctx.strokeStyle = 'rgba(60, 45, 30, 0.35)';
      this.ctx.lineWidth = 1;
      for (const fr of [1 / 3, 2 / 3]) {
        this.ctx.beginPath();
        this.ctx.moveTo(c1[0], c1[1] + drop * fr);
        this.ctx.lineTo(c2[0], c2[1] + drop * fr);
        this.ctx.stroke();
      }
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      this.ctx.beginPath();
      this.ctx.moveTo(c1[0], c1[1]);
      this.ctx.lineTo(c2[0], c2[1]);
      this.ctx.stroke();
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
        // curb line along every edge that borders non-road land
        this.ctx.strokeStyle = 'rgba(150, 155, 160, 0.8)';
        this.ctx.lineWidth = 1.5;
        for (let k = 0; k < 4; k++) {
          const [dx, dy] = Renderer.EDGE_DIRS[k];
          if (inBounds(x + dx, y + dy) && city.tiles[idx(x + dx, y + dy)].zone === Zone.Road) {
            continue;
          }
          const c1 = geom.corners[k];
          const c2 = geom.corners[(k + 1) % 4];
          this.ctx.beginPath();
          this.ctx.moveTo(c1[0], c1[1]);
          this.ctx.lineTo(c2[0], c2[1]);
          this.ctx.stroke();
        }
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
      if (this.storm && this.shoreline(city, x, y)) {
        // storm surge: whitecaps churning against the shore
        const pulse = 0.25 + 0.2 * Math.sin(this.frameNow / 160 + (x + y) * 1.7);
        fillTile(this.ctx, geom, `rgba(230, 240, 250, ${pulse.toFixed(3)})`);
      } else if (!this.storm) {
        if (getRenderStyle() === 'realistic' && !this.shoreline(city, x, y)) {
          // depth shading: interior water sits darker than the shallows
          fillTile(this.ctx, geom, `hsla(${209 + v * 6} 60% 22% / 0.55)`);
        }
        // calm shore: a sand strip and foam line along every land edge
        for (let k = 0; k < 4; k++) {
          const [dx, dy] = Renderer.EDGE_DIRS[k];
          if (!inBounds(x + dx, y + dy)) continue;
          if (city.tiles[idx(x + dx, y + dy)].terrain === Terrain.Water) continue;
          const c1 = geom.corners[k];
          const c2 = geom.corners[(k + 1) % 4];
          const inward = (p: [number, number]): [number, number] => [
            p[0] + (geom.cx - p[0]) * 0.22,
            p[1] + (geom.cy - p[1]) * 0.22,
          ];
          fillPoly(this.ctx, [c1, c2, inward(c2), inward(c1)], 'hsl(45 38% 62%)');
          this.ctx.strokeStyle = 'rgba(235, 244, 250, 0.5)';
          this.ctx.lineWidth = 1;
          this.ctx.beginPath();
          this.ctx.moveTo(c1[0], c1[1]);
          this.ctx.lineTo(c2[0], c2[1]);
          this.ctx.stroke();
        }
      }
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
      fillTile(this.ctx, geom, `hsl(${42 + v * 8} ${gs}% ${56 + groundShade(x, y, v)}%)`);
    } else {
      const gs = Math.min(95, (30 + v * 8) * getSkin().grassSat);
      fillTile(
        this.ctx,
        geom,
        `hsl(${96 + v * 10 + this.veg.grassHue} ${gs}% ${34 + groundShade(x, y, v) + this.veg.grassLight}%)`,
      );
    }
    if (this.storm && this.shoreline(city, x, y)) {
      // surge sloshing up onto the waterfront
      const pulse = 0.12 + 0.12 * Math.sin(this.frameNow / 200 + (x * 3 + y) * 1.3);
      fillTile(this.ctx, geom, `rgba(225, 238, 248, ${pulse.toFixed(3)})`);
    }
    if (this.detail >= 1 && t.zone === Zone.None && t.terrain === Terrain.Grass && t.elevation < 4) {
      // pixel-grass flecks: sparse darker tufts seeded by the variant
      this.ctx.fillStyle = 'rgba(18, 38, 14, 0.20)';
      for (let k = 0; k < 3; k++) {
        const fx = ((v * (13 + k * 7)) % 1) - 0.5;
        const fy = ((v * (29 + k * 11)) % 1) - 0.5;
        this.ctx.fillRect(geom.cx + fx * 38, geom.cy + fy * 18, 2, 2);
      }
    }
    if (t.terrain === Terrain.Forest) {
      const wind = this.storm ? this.wind * (0.7 + v * 0.6) : 0;
      tree(this.ctx, geom.cx - 9 + v * 6, geom.cy - 3, wind);
      tree(this.ctx, geom.cx + 5 - v * 4, geom.cy + 2 + v * 3, wind);
      tree(this.ctx, geom.cx - 2 + v * 3, geom.cy - 8 + v * 2, wind);
    }
  }

  /** Cached radial glow sprite; drawn with destination-out to punch
   * light through the darkness layer. */
  private glowSprite: HTMLCanvasElement | null = null;
  private darkLayer: HTMLCanvasElement | null = null;

  private ensureGlow(): HTMLCanvasElement {
    if (this.glowSprite) return this.glowSprite;
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    this.glowSprite = c;
    return c;
  }

  /** Radius (world px) a tile's lights throw, or 0 for darkness. */
  private lightRadius(t: CityState['tiles'][number]): number {
    if (t.zone === Zone.Road) return 24; // streetlights line every road
    if (t.zone === Zone.None) return 0;
    if (t.abandoned || !t.powered) return 0; // dark windows, dark lot
    if (
      t.zone === Zone.Residential ||
      t.zone === Zone.Commercial ||
      t.zone === Zone.Industrial
    ) {
      return t.stage > 0 ? 18 + t.stage * 5 : 0;
    }
    if (t.zone === Zone.PowerLine || t.zone === Zone.WaterPipe || t.zone === Zone.Park) return 0;
    if (isPlant(t.zone)) return 40; // plants run lit all night
    return 26; // civic buildings and stations keep their lights on
  }

  /** Deep-night darkness with light punched out of settled areas. */
  private drawDarkness(city: CityState, dpr: number) {
    const target = this.ctx.canvas;
    if (!this.darkLayer) this.darkLayer = document.createElement('canvas');
    if (this.darkLayer.width !== target.width) this.darkLayer.width = target.width;
    if (this.darkLayer.height !== target.height) this.darkLayer.height = target.height;
    const d = this.darkLayer.getContext('2d')!;
    d.setTransform(1, 0, 0, 1, 0, 0);
    d.globalCompositeOperation = 'source-over';
    d.clearRect(0, 0, this.darkLayer.width, this.darkLayer.height);
    d.fillStyle = `rgba(6, 9, 22, ${darknessAlpha(this.night).toFixed(3)})`;
    d.fillRect(0, 0, this.darkLayer.width, this.darkLayer.height);

    // same camera transform the scene used, so glows land on their tiles
    d.setTransform(
      this.camera.zoom * dpr,
      0,
      0,
      this.camera.zoom * dpr,
      -this.camera.x * this.camera.zoom * dpr,
      -this.camera.y * this.camera.zoom * dpr,
    );
    d.globalCompositeOperation = 'destination-out';
    const glow = this.ensureGlow();
    for (let i = 0; i < city.tiles.length; i++) {
      const r = this.lightRadius(city.tiles[i]);
      if (r === 0) continue;
      const x = i % GRID;
      const y = (i / GRID) | 0;
      const g = tileGeom(x, y, city.tiles[i].elevation);
      d.drawImage(glow, g.cx - r, g.cy - r, r * 2, r * 2);
    }

    const { ctx } = this;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.darkLayer, 0, 0);
    ctx.restore();
  }

  /** Stroke a tile-center polyline; segments over water go dashed. */
  private strokeSegments(
    pts: [number, number][],
    city: CityState,
    color: string,
    alpha: number,
  ) {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (let k = 0; k + 1 < pts.length; k++) {
      const [x0, y0] = pts[k];
      const [x1, y1] = pts[k + 1];
      const a = tileGeom(x0, y0, city.tiles[idx(x0, y0)].elevation);
      const b = tileGeom(x1, y1, city.tiles[idx(x1, y1)].elevation);
      const wet =
        city.tiles[idx(x0, y0)].terrain === Terrain.Water ||
        city.tiles[idx(x1, y1)].terrain === Terrain.Water;
      ctx.setLineDash(wet ? [4, 4] : []);
      ctx.beginPath();
      ctx.moveTo(a.cx, a.cy);
      ctx.lineTo(b.cx, b.cy);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  /** Finalized transit lines plus the wizard's live draft. */
  private drawTransitLines(city: CityState, view: ViewState) {
    const tSec = this.lineClock / 1000;
    for (const line of city.transitLines) {
      this.strokeSegments(line.path, city, line.color, 0.8);
      drawLineVehicles(this.ctx, city, line, tSec);
    }
    const d = view.transitDraft;
    if (!d) return;
    this.strokeSegments(d.path, city, d.color, 0.9);
    if (d.pending) this.strokeSegments(d.pending, city, d.color, 0.4);
    for (const [sx, sy] of d.stops) {
      const g = tileGeom(sx, sy, city.tiles[idx(sx, sy)].elevation);
      this.ctx.strokeStyle = '#f2f5f9';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.arc(g.cx, g.cy, 6, 0, TAU);
      this.ctx.stroke();
      this.ctx.strokeStyle = d.color;
      this.ctx.beginPath();
      this.ctx.arc(g.cx, g.cy, 4, 0, TAU);
      this.ctx.stroke();
    }
  }

  /** True when this tile sits on a land/water boundary. */
  private shoreline(city: CityState, x: number, y: number): boolean {
    const wet = city.tiles[idx(x, y)].terrain === Terrain.Water;
    for (const [nx, ny] of neighbors4(x, y)) {
      if ((city.tiles[idx(nx, ny)].terrain === Terrain.Water) !== wet) return true;
    }
    return false;
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
