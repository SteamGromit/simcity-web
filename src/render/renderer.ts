import { idx, inBounds, neighbors4 } from '../sim/grid';
import { mulberry32 } from '../sim/city';
import { BuildTool, CityState, GRID, MAX_ELEV, Terrain, Zone } from '../sim/types';
import { Automata } from './automata';
import { AmbientEnv, drawAmbient } from './ambientfx';
import {
  drawBuilding,
  drawCastShadow,
  drawYardTrees,
  standingSpriteFor,
  variantBucket,
  drawFire,
  drawCrimeFlash,
  drawAccident,
  drawCollapse,
  drawPole,
  drawRubble,
  fillTile,
  setRenderSeason,
  strokeTile,
} from './buildings';
import {
  ELEV_PX,
  TileGeom,
  blockGeom,
  deepestOfBlock,
  isoToScreen,
  screenToIso,
  setViewAngle,
  tileDepth,
  tileGeom,
} from './iso';
import { anchorOf, distanceToBlock, sizeOfSlot, tilesAroundBlock } from '../sim/footprint';
import { DisasterFx } from './disasterfx';
import { OverlayId, drawOverlay } from './overlays';
import { darknessAlpha, getDayNight, nightFactor, nightTint } from './daynight';
import { isPlant } from '../sim/energy';
import { detailLevel } from './detail';
import { drawLineVehicles } from './linevehicles';
import { PIXEL_SCALE, getRenderStyle } from './renderstyle';
import { VegTint, effectiveSeason, vegTint } from './seasonfx';
import { Season, seasonOf } from '../sim/weather';
import { getSkin } from './skins';
import {
  drawBridge,
  drawRoad,
  drawStreetFurniture,
  medianTone,
  roadMask,
  rotateMask,
  screenCorridor,
} from './roadart';
import { getWeatherFx } from './fx';
import { GroundKind, groundTone, paintCliff, paintGround, paintShore, paintWater } from './ground';
import { paintBloom, paintGrade, paintHaze, paintSky, paintVignette } from './grade';
import { paintTiltShift, tiltShiftActive } from './tiltshift';
import { css, hsl, lit, mix } from './palette';
import { LIGHT } from './sun';
import { drawTree, drawUndergrowth } from './scenery';
import { hash2 } from './noise';
import { blit, sprite } from './spritecache';
import { ShadowLayer } from './shadows';
import { drawLotGround, roadSidesFor, roadStampOf } from './lots';
import { ShorelineLot, drawReflection, shorelineLots } from './reflections';

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
  /** Coverage footprint preview while placing a building with an area effect;
   * `blight` is the (smaller) radius over which it also spoils the area, and
   * `size` the block of ground the building itself would claim. */
  halo: { x: number; y: number; radius: number; blight?: number; size?: number } | null;
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

/** Direction across each edge of TileGeom.corners: [k] → [k+1] borders these. */
const EDGE_DIRS: [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

export class Renderer {
  camera = { x: 0, y: 0, zoom: 1 };
  /** Current sim speed, fed by the UI so street life keeps pace. */
  simSpeed: 0 | 1 | 2 | 3 = 1;
  private ctx: CanvasRenderingContext2D;
  private mainCtx: CanvasRenderingContext2D;
  private buffer: HTMLCanvasElement | null = null;
  private variants: Float32Array;
  /** Distance-from-shore for every water tile, rebuilt when the coast moves. */
  private depth: Float32Array;
  private depthStamp = -1;
  private automata = new Automata();
  private disasterFx = new DisasterFx();
  private shadows = new ShadowLayer();
  /** tile paint order, ascending depth; rebuilt on each quarter turn */
  private order: Uint16Array;
  /** Quarter turns of the camera, 0..3. Only multiples of 90° are offered:
   * the tile-shaped sprites — ground texture, road markings — are baked for
   * an axis-aligned diamond, and any other angle is a different quad. */
  private quarter: 0 | 1 | 2 | 3 = 0;
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
  /** Sim-speed-scaled ambient-motion clock (ms). Keeps a slow drift while
   * paused: smoke is ambience, not simulation, and a paused city still
   * breathes. */
  private ambientClock = 0;
  /** Current frame's LOD, shared with the ground pass. */
  private detail: 0 | 1 | 2 = 1;
  /** Seasonal vegetation tint for the current frame. */
  private veg: VegTint = vegTint('summer');
  /** The season anything baked this frame should wear. */
  private season: Season = 'summer';
  /** Which screen side each lot's street is on (0..3, −1 none), so its plot
   * can face it. Rebuilt when the road network or the camera quarter moves. */
  private roadSide = new Int8Array(GRID * GRID);
  private roadStamp = -1;
  private roadQuarter = -1;
  /** Inclusive tile bounds visible this frame, so off-screen work is skipped. */
  private clip = { x0: 0, y0: 0, x1: GRID - 1, y1: GRID - 1 };
  /** Milliseconds each pass took last frame. Read by the `__simcity.profile`
   * debug hook; the cost of filling it is four `performance.now()` calls. */
  readonly timings: Record<string, number> = {};

  constructor(private canvas: HTMLCanvasElement, seed: number) {
    this.ctx = canvas.getContext('2d')!;
    this.mainCtx = this.ctx;
    this.variants = new Float32Array(GRID * GRID);
    this.depth = new Float32Array(GRID * GRID);
    this.order = new Uint16Array(GRID * GRID);
    this.reseed(seed);
    this.resize();
    setViewAngle(0);
    this.buildOrder();
    const mid = isoToScreen(GRID / 2, GRID / 2);
    this.camera.x = mid.sx - this.canvas.clientWidth / 2;
    this.camera.y = mid.sy - this.canvas.clientHeight / 2;
  }

  /** The camera's current quarter turn, 0..3. */
  getQuarter(): 0 | 1 | 2 | 3 {
    return this.quarter;
  }

  /**
   * Turn the view a quarter, keeping the grid point at the middle of the
   * screen where it was.
   *
   * Only quarter turns are on offer, and that is what keeps the whole baked
   * pipeline intact: a tile still projects to the same diamond, so the ground
   * and road sprites are reused as-is; the sun stays fixed to the screen, so
   * every building sprite is still lit correctly and none of them need
   * re-baking. Rotating is free — it costs one re-sort of the paint order.
   */
  rotateQuarter(delta: 1 | -1): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const wx = this.camera.x + w / 2 / this.camera.zoom;
    const wy = this.camera.y + h / 2 / this.camera.zoom;
    const g = screenToIso(wx, wy);
    this.quarter = (((this.quarter + delta) % 4) + 4) % 4 as 0 | 1 | 2 | 3;
    setViewAngle((this.quarter * Math.PI) / 2);
    const p = isoToScreen(g.x, g.y);
    this.camera.x = p.sx - w / 2 / this.camera.zoom;
    this.camera.y = p.sy - h / 2 / this.camera.zoom;
    this.buildOrder();
  }

  /** Re-derive per-tile visual variation; call when a different city loads. */
  reseed(seed: number) {
    const rand = mulberry32(seed);
    for (let i = 0; i < this.variants.length; i++) this.variants[i] = rand();
    this.depthStamp = -1;
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = this.canvas.clientWidth * dpr;
    this.canvas.height = this.canvas.clientHeight * dpr;
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

  /** Painter's order for the current quarter turn: back to front by depth. */
  private buildOrder() {
    const depths = new Float64Array(GRID * GRID);
    for (let i = 0; i < depths.length; i++) depths[i] = tileDepth(i % GRID, (i / GRID) | 0);
    const indices = Array.from({ length: GRID * GRID }, (_, i) => i);
    indices.sort((a, b) => depths[a] - depths[b]);
    this.order.set(indices);
  }

  /** Tile bounds the viewport can possibly touch, with a generous margin for
   * tall towers whose tops poke into view from below the screen. */
  private computeClip() {
    const w = this.canvas.clientWidth / this.camera.zoom;
    const h = this.canvas.clientHeight / this.camera.zoom;
    const pad = 6;
    let x0 = GRID;
    let y0 = GRID;
    let x1 = -1;
    let y1 = -1;
    // the four screen corners, pushed out to cover elevation and building height
    for (const [sx, sy] of [
      [this.camera.x, this.camera.y - 260],
      [this.camera.x + w, this.camera.y - 260],
      [this.camera.x + w, this.camera.y + h + 60],
      [this.camera.x, this.camera.y + h + 60],
    ]) {
      const g = screenToIso(sx, sy);
      x0 = Math.min(x0, Math.floor(g.x));
      x1 = Math.max(x1, Math.ceil(g.x));
      y0 = Math.min(y0, Math.floor(g.y));
      y1 = Math.max(y1, Math.ceil(g.y));
    }
    this.clip = {
      x0: Math.max(0, x0 - pad),
      y0: Math.max(0, y0 - pad),
      x1: Math.min(GRID - 1, x1 + pad),
      y1: Math.min(GRID - 1, y1 + pad),
    };
  }

  private visible(x: number, y: number): boolean {
    const c = this.clip;
    return x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1;
  }

  /** Breadth-first distance from the shore for every water tile, so open water
   * can read deeper than a bay. Rebuilt only when the coastline changes. */
  private ensureDepth(city: CityState) {
    let stamp = 0;
    for (let i = 0; i < city.tiles.length; i += 37) {
      if (city.tiles[i].terrain === Terrain.Water) stamp = (stamp * 31 + i) | 0;
    }
    if (stamp === this.depthStamp) return;
    this.depthStamp = stamp;
    const q: number[] = [];
    this.depth.fill(0);
    for (let i = 0; i < city.tiles.length; i++) {
      if (city.tiles[i].terrain !== Terrain.Water) continue;
      const x = i % GRID;
      const y = (i / GRID) | 0;
      let edge = false;
      for (const [nx, ny] of neighbors4(x, y)) {
        if (city.tiles[idx(nx, ny)].terrain !== Terrain.Water) edge = true;
      }
      if (x === 0 || y === 0 || x === GRID - 1 || y === GRID - 1) edge = edge || false;
      if (edge) {
        this.depth[i] = 1;
        q.push(i);
      }
    }
    for (let head = 0; head < q.length; head++) {
      const i = q[head];
      const x = i % GRID;
      const y = (i / GRID) | 0;
      for (const [nx, ny] of neighbors4(x, y)) {
        const n = idx(nx, ny);
        if (city.tiles[n].terrain !== Terrain.Water || this.depth[n] > 0) continue;
        this.depth[n] = this.depth[i] + 1;
        q.push(n);
      }
    }
  }

  draw(city: CityState, view: ViewState) {
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
    setViewAngle((this.quarter * Math.PI) / 2);
    const now = performance.now();
    this.night = getDayNight() ? nightFactor(now) : 0;
    this.lineClock +=
      Math.min(100, Math.max(0, now - this.frameNow)) * AUTOMATA_SCALE[this.simSpeed];
    this.ambientClock +=
      Math.min(100, Math.max(0, now - this.frameNow)) *
      (0.35 + 0.65 * AUTOMATA_SCALE[this.simSpeed]);
    this.frameNow = now;
    this.storm = city.disasters.hurricaneTicks > 0;
    this.wind = this.storm ? -5 + Math.sin(now / 120) * 3.5 : 0;
    this.automata.step(city, now, AUTOMATA_SCALE[this.simSpeed]);
    this.disasterFx.step(city, now, AUTOMATA_SCALE[this.simSpeed]);
    this.ensureDepth(city);
    this.ensureRoadSides(city);
    this.computeClip();

    const W = this.ctx.canvas.width;
    const H = this.ctx.canvas.height;
    const dpr = (window.devicePixelRatio || 1) * ps;

    // --- sky ------------------------------------------------------------
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    paintSky(ctx, W, H, this.night);

    const camera = () =>
      ctx.setTransform(
        this.camera.zoom * dpr,
        0,
        0,
        this.camera.zoom * dpr,
        -this.camera.x * this.camera.zoom * dpr,
        -this.camera.y * this.camera.zoom * dpr,
      );
    camera();

    const detail = detailLevel(this.camera.zoom);
    this.detail = detail;
    const season = seasonOf(city.month);
    const ambient: AmbientEnv = {
      clock: this.ambientClock,
      wind: this.wind,
      night: this.night,
      detail,
      winter: season === 'winter',
    };
    this.veg = vegTint(season);
    this.season = effectiveSeason(season);
    setRenderSeason(season);

    const mark = (name: string, from: number) => {
      this.timings[name] = performance.now() - from;
    };
    let t0 = performance.now();

    // --- pass 1: ground -------------------------------------------------
    // Terrain, cliffs and roads for every visible tile, in painter's order.
    for (let n = 0; n < this.order.length; n++) {
      const i = this.order[n];
      const x = i % GRID;
      const y = (i / GRID) | 0;
      if (!this.visible(x, y)) continue;
      const t = city.tiles[i];
      const geom = tileGeom(x, y, t.elevation);
      this.drawCliffs(geom, city, x, y);
      this.drawGround(geom, city, x, y, now);
    }

    // --- the waterfront, mirrored ---------------------------------------
    // After the water is painted and before the shadows, so a shadow can
    // still lie across the reflection the way it lies across the ground.
    if (detail >= 1) {
      this.ensureShoreline(city);
      for (const { i, water } of this.shoreLots) {
        const x = i % GRID;
        const y = (i / GRID) | 0;
        if (!this.visible(x, y)) continue;
        const t = city.tiles[i];
        const s = standingSpriteFor(
          t.zone, t.stage, t.tier, this.variants[i], t.powered, t.abandoned, this.season,
        );
        if (!s) continue;
        drawReflection(
          ctx,
          tileGeom(x, y, t.elevation),
          s,
          water.map((w) => tileGeom(w % GRID, (w / GRID) | 0, city.tiles[w].elevation)),
        );
      }
    }

    mark('ground', t0);
    t0 = performance.now();

    // --- pass 2: cast shadows -------------------------------------------
    // Their own pass because a tower's shadow falls toward the camera, onto
    // tiles that are painted *after* it. Drawn onto the finished ground, so
    // it lands on the street rather than being overdrawn by it.
    if (detail >= 1) {
      // all of them into one half-res layer, laid back over the ground once,
      // blurred into a penumbra and multiplied so they darken the texture
      const sctx = this.shadows.begin(ctx, W, H, this.camera, dpr);
      for (let n = 0; n < this.order.length; n++) {
        const i = this.order[n];
        const x = i % GRID;
        const y = (i / GRID) | 0;
        if (!this.visible(x, y)) continue;
        const t = city.tiles[i];
        if (t.zone === Zone.None || t.zone === Zone.Road) continue;
        const size = sizeOfSlot(t.zone);
        const g = size > 1 ? this.blockDrawGeom(city, i, size) : tileGeom(x, y, t.elevation);
        if (!g) continue;
        drawCastShadow(sctx, g, t.zone, t.stage, t.tier, this.variants[i], size, 1);
      }
      this.shadows.end(ctx, this.camera.zoom);
      camera();
    }

    mark('shadows', t0);
    t0 = performance.now();

    // --- pass 3: everything that stands up ------------------------------
    for (let n = 0; n < this.order.length; n++) {
      const i = this.order[n];
      const x = i % GRID;
      const y = (i / GRID) | 0;
      if (!this.visible(x, y)) continue;
      const t = city.tiles[i];
      const geom = tileGeom(x, y, t.elevation);
      if (t.rubble > 0) drawRubble(ctx, geom, this.variants[i]);
      this.drawScenery(geom, city, x, y);
      if (t.zone === Zone.Road && !t.median && t.terrain !== Terrain.Water) {
        drawStreetFurniture(
          ctx,
          geom,
          rotateMask(roadMask(city, x, y), this.quarter),
          i,
          detail,
          this.night,
          now,
          screenCorridor(city, x, y, this.quarter),
        );
      }
      if (t.zone !== Zone.None && t.zone !== Zone.Road) {
        const size = sizeOfSlot(t.zone);
        const drawGeom = size > 1 ? this.blockDrawGeom(city, i, size) : geom;
        if (drawGeom) {
          drawBuilding(
            ctx,
            drawGeom,
            t.zone,
            t.stage,
            t.tier,
            t.abandoned,
            t.powered,
            this.variants[i],
            this.night,
            detail,
            size,
            this.season,
          );
          drawAmbient(
            ctx, drawGeom, t.zone, t.stage, t.tier, this.variants[i], size,
            t.powered, t.abandoned, t.pollution, ambient,
          );
          if (detail >= 1 && size === 1 && t.stage > 0 && t.stage <= 3 && this.isGrowable(t.zone)) {
            drawYardTrees(
              ctx, drawGeom, t.zone, t.tier, t.stage, variantBucket(this.variants[i]), 1,
              this.roadSide[i], city.biome === 'desert', this.season,
            );
          }
        }
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
      this.automata.drawTile(ctx, i, this.night);
    }

    mark('scene', t0);
    t0 = performance.now();

    this.drawTransitLines(city, view);

    // --- pass 4: atmosphere ---------------------------------------------
    if (style !== 'smooth') {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      paintHaze(ctx, W, H, this.camera.zoom, this.night);
      camera();
    }

    if (view.overlay) drawOverlay(ctx, city, view.overlay);

    if (this.night > 0.02) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = nightTint(this.night);
      ctx.fillRect(0, 0, W, H);
      this.drawDarkness(city, dpr);
      camera();
    }

    if (city.disasters.tornado) this.drawTornado(city, now);
    this.disasterFx.drawWorld(ctx, city, now);

    const storm = city.disasters.hurricaneTicks > 0;
    const fx = getWeatherFx(); // hurricane rain always shows — it's a disaster cue
    if (storm || (fx && city.weather.kind === 'rain')) this.drawRain(now, storm ? 1 : 0.45);
    else if (fx && city.weather.kind === 'snow') this.drawSnow(now);
    else if (fx && city.weather.kind === 'cloudy') {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = 'rgba(120, 130, 150, 0.10)';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    this.disasterFx.drawScreen(ctx, city, now);

    // --- pass 5: finishing ----------------------------------------------
    if (style === 'realistic') {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      paintBloom(ctx, W, H, 0.03 + this.night * 0.15);
      paintGrade(ctx, W, H, this.night);
      paintVignette(ctx, W, H);
      camera();
    }

    if (tiltShiftActive(this.night)) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      paintTiltShift(ctx, W, H);
      camera();
    }

    mark('finish', t0);

    // --- pass 6: cursor layers, which must stay unfiltered ---------------
    this.drawCursors(city, view);

    if (ps < 1 && this.buffer) {
      const m = this.mainCtx;
      m.setTransform(1, 0, 0, 1, 0, 0);
      m.imageSmoothingEnabled = false;
      m.drawImage(this.buffer, 0, 0, this.canvas.width, this.canvas.height);
    }
  }

  /** Halo, rect, line and hover previews — drawn last so nothing washes them. */
  private drawCursors(city: CityState, view: ViewState) {
    const { ctx } = this;
    const elevOf = (x: number, y: number) => city.tiles[idx(x, y)].elevation;
    if (view.halo) {
      const { x: hx, y: hy, radius, blight, size } = view.halo;
      // Survey pink, not the data views' green: this is *proposed* work, and a
      // coverage view left on underneath must stay readable through it.
      const box = { ax: hx, ay: hy, size: size ?? 1 };
      if (radius > 0) {
        for (const [nx, ny] of tilesAroundBlock(box, radius)) {
          const d = distanceToBlock(box, nx, ny);
          const cov = 1 - d / (radius + 1);
          fillTile(ctx, tileGeom(nx, ny, elevOf(nx, ny)), `rgba(255,79,163,${0.12 + 0.3 * cov})`);
          if (d === radius) {
            strokeTile(ctx, tileGeom(nx, ny, elevOf(nx, ny)), 'rgba(255,79,163,0.55)', 1);
          }
        }
      }
      if (blight && blight > 0) {
        for (const [nx, ny] of tilesAroundBlock(box, blight)) {
          if (distanceToBlock(box, nx, ny) !== blight) continue;
          strokeTile(ctx, tileGeom(nx, ny, elevOf(nx, ny)), 'rgba(242,145,31,0.85)', 1.5);
        }
      }
      if (size && size > 1) {
        for (let dy = 0; dy < size; dy++) {
          for (let dx = 0; dx < size; dx++) {
            if (!inBounds(hx + dx, hy + dy)) continue;
            fillTile(
              ctx,
              tileGeom(hx + dx, hy + dy, elevOf(hx + dx, hy + dy)),
              'rgba(255,255,255,0.16)',
            );
          }
        }
        strokeTile(
          ctx,
          blockGeom(hx, hy, size, elevOf(hx, hy)),
          view.hoverValid ? 'rgba(255,255,255,0.95)' : 'rgba(255,70,60,0.95)',
          2,
        );
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
      const tint = view.lineTool === 'pipe' ? 'rgba(120,180,255,0.35)' : 'rgba(255,235,150,0.35)';
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
  }

  /** A twisting funnel: stacked ellipses with a rotating banding on the wall. */
  private drawTornado(city: CityState, now: number) {
    const { ctx } = this;
    const tor = city.disasters.tornado!;
    const g = tileGeom(tor.x, tor.y, city.tiles[idx(tor.x, tor.y)].elevation);
    const H = 96;
    ctx.save();
    for (let k = 0; k < 22; k++) {
      const t = k / 21;
      const r = 5 + t * t * 26;
      const wob = Math.sin(now / 90 + t * 5) * (5 + t * 9);
      const y = g.cy - 4 - t * H;
      ctx.fillStyle = `rgba(${112 + t * 26}, ${110 + t * 24}, ${118 + t * 22}, ${0.5 - t * 0.2})`;
      ctx.beginPath();
      ctx.ellipse(g.cx + wob, y, r, r * 0.42, 0, 0, TAU);
      ctx.fill();
      // a lighter band spiralling up the funnel
      ctx.strokeStyle = `rgba(206, 202, 208, ${0.2 - t * 0.11})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(g.cx + wob, y, r * 0.86, r * 0.36, 0, (now / 260 + t * 3) % TAU, ((now / 260 + t * 3) % TAU) + 2.4);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Screen-space driving rain; intensity 1 = full hurricane. */
  private drawRain(now: number, intensity: number) {
    const { ctx } = this;
    const W = this.ctx.canvas.width;
    const H = this.ctx.canvas.height;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = `rgba(40, 55, 80, ${0.18 * intensity})`;
    ctx.fillRect(0, 0, W, H);
    // two layers at different speeds read as depth rather than wallpaper
    for (const [speed, alpha, len, step] of [
      [2.2, 0.22, 10, 44],
      [4.0, 0.34, 17, 26],
    ] as const) {
      ctx.strokeStyle = `rgba(186, 206, 234, ${alpha * intensity})`;
      ctx.lineWidth = 1;
      const shift = ((now / 3) * speed) % 60;
      ctx.beginPath();
      for (let ry = -40; ry < H; ry += 34) {
        for (let rx = ((ry * 13) % 29) - 40; rx < W; rx += step * (intensity >= 1 ? 0.6 : 1)) {
          const yy = ry + ((now / 4) * speed) % 40;
          ctx.moveTo(rx + shift, yy);
          ctx.lineTo(rx + shift - len * 0.45, yy + len);
        }
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Screen-space drifting snowfall with a faint ground whitening. */
  private drawSnow(now: number) {
    const { ctx } = this;
    const w = this.ctx.canvas.width;
    const h = this.ctx.canvas.height;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(235, 240, 250, 0.08)';
    ctx.fillRect(0, 0, w, h);
    for (let layer = 0; layer < 2; layer++) {
      const size = layer ? 3 : 2;
      ctx.fillStyle = `rgba(250, 252, 255, ${layer ? 0.9 : 0.55})`;
      for (let k = 0; k < (layer ? 70 : 130); k++) {
        const seed = (k * 2654435761 + layer * 7919) >>> 0;
        const x = (seed % w) + Math.sin(now / 900 + k) * (14 + layer * 10);
        const y = (((seed >> 8) % h) + now * (0.02 + (k % 5) * 0.006) * (1 + layer)) % h;
        ctx.fillRect(((x % w) + w) % w, y, size, size);
      }
    }
    ctx.restore();
  }

  /** Fill the vertical faces where this tile stands above a neighbor. */
  private drawCliffs(geom: TileGeom, city: CityState, x: number, y: number) {
    const t = city.tiles[idx(x, y)];
    if (t.elevation === 0) return;
    const grass = groundTone(this.groundKind(city, x, y), x, y, this.veg, getSkin().grassSat);
    for (let k = 0; k < 4; k++) {
      const [dx, dy] = EDGE_DIRS[k];
      const nElev = inBounds(x + dx, y + dy) ? city.tiles[idx(x + dx, y + dy)].elevation : 0;
      const drop = (t.elevation - nElev) * ELEV_PX;
      if (drop <= 0) continue;
      const c1 = geom.corners[k];
      const c2 = geom.corners[(k + 1) % 4];
      if ((c1[1] + c2[1]) / 2 <= geom.cy) continue; // back edge, hidden
      // which face catches the sun is decided by where the edge sits on
      // screen, not by which grid direction it is — so it survives a turn
      const screenLeft = (c1[0] + c2[0]) / 2 < geom.cx;
      paintCliff(this.ctx, c1, c2, drop, screenLeft, grass, idx(x, y));
    }
  }

  private groundKind(city: CityState, x: number, y: number): GroundKind {
    const t = city.tiles[idx(x, y)];
    if (t.elevation >= 5) return 'snow';
    if (t.elevation === 4) return 'rock';
    return city.biome === 'desert' ? 'desert' : 'meadow';
  }

  /** Per-tile ground colours, rebuilt only when the season, skin or biome
   * moves. Deriving them per frame cost more than drawing them. */
  private toneCache: string[] = [];
  private toneKey = '';

  private groundStyle(city: CityState, x: number, y: number, kind: GroundKind): string {
    const key = `${this.veg.grassHue}|${this.veg.grassLight}|${getSkin().id}|${city.biome}`;
    if (key !== this.toneKey) {
      this.toneKey = key;
      this.toneCache = [];
    }
    const i = idx(x, y);
    const hit = this.toneCache[i];
    if (hit) return hit;
    return (this.toneCache[i] = css(
      groundTone(kind, x, y, this.veg, getSkin().grassSat),
    ));
  }

  private drawGround(geom: TileGeom, city: CityState, x: number, y: number, now: number) {
    const i = idx(x, y);
    const t = city.tiles[i];
    const { ctx } = this;

    if (t.zone === Zone.Road) {
      const mask = rotateMask(roadMask(city, x, y), this.quarter);
      const cor = screenCorridor(city, x, y, this.quarter);
      if (t.terrain === Terrain.Water) {
        paintWater(ctx, geom, x, y, Math.min(1, (this.depth[i] - 1) / 9), now, this.detail);
        drawBridge(ctx, geom, t.road, mask, i, cor);
      } else if (t.median) {
        const tone = medianTone(this.veg);
        fillTile(ctx, geom, css(lit(tone, LIGHT.roof)));
        strokeTile(ctx, geom, css(hsl(210, 8, 62), 0.8), 1.5);
        if (this.detail >= 1) {
          drawTree(
            ctx,
            geom.cx,
            geom.cy + 2,
            'broadleaf',
            14,
            i % 6,
            'summer',
            this.storm ? this.wind : 0,
          );
        }
        if (t.wire) drawPole(ctx, geom.cx, geom.cy);
        return;
      } else {
        drawRoad(ctx, geom, t.road, mask, i, cor);
      }
      if (t.wire) drawPole(ctx, geom.cx, geom.cy);
      if (this.night > 0.3) {
        const r = 12;
        ctx.fillStyle = `rgba(255, 196, 110, ${(0.14 * this.night).toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse(geom.cx, geom.cy, r, r * 0.5, 0, 0, TAU);
        ctx.fill();
      }
      return;
    }

    if (t.terrain === Terrain.Water) {
      const depth = Math.min(1, (this.depth[i] - 1) / 9);
      paintWater(ctx, geom, x, y, depth, now, this.detail);
      if (this.storm) {
        const pulse = 0.2 + 0.2 * Math.sin(this.frameNow / 160 + (x + y) * 1.7);
        fillTile(ctx, geom, `rgba(226, 238, 250, ${pulse.toFixed(3)})`);
      }
      if (this.depth[i] === 1) {
        for (let k = 0; k < 4; k++) {
          const [dx, dy] = EDGE_DIRS[k];
          if (!inBounds(x + dx, y + dy)) continue;
          if (city.tiles[idx(x + dx, y + dy)].terrain === Terrain.Water) continue;
          paintShore(ctx, geom, k, now, this.storm ? 1 : 0);
        }
      }
      return;
    }

    const kind = this.groundKind(city, x, y);
    const tone = this.groundStyle(city, x, y, kind);
    const developed =
      t.stage > 0 &&
      (t.zone === Zone.Residential || t.zone === Zone.Commercial || t.zone === Zone.Industrial);
    // A built lot's apron covers the turf, so its texture would never be seen
    paintGround(ctx, geom, kind, tone, i, developed ? 0 : this.detail);
    if (this.detail >= 1 && developed) {
      drawLotGround(
        ctx, geom, t.zone, t.tier, t.stage, variantBucket(this.variants[i]), 1,
        this.roadSide[i], city.biome === 'desert', this.season,
      );
    }
    if (this.storm && this.shoreline(city, x, y)) {
      const pulse = 0.1 + 0.1 * Math.sin(this.frameNow / 200 + (x * 3 + y) * 1.3);
      fillTile(ctx, geom, `rgba(225, 238, 248, ${pulse.toFixed(3)})`);
    }
  }

  /** Trees and boulders — drawn in the standing pass so they occlude properly. */
  private drawScenery(geom: TileGeom, city: CityState, x: number, y: number) {
    const i = idx(x, y);
    const t = city.tiles[i];
    if (t.terrain !== Terrain.Forest || t.zone !== Zone.None) return;
    if (this.detail === 0) {
      // far out, a wood reads better as one dark mass than as many dots
      fillTile(this.ctx, geom, css(mix(hsl(126, 32, 24), hsl(96, 20, 30), 0.4), 0.62));
      return;
    }
    const wind = this.storm ? this.wind * (0.7 + this.variants[i] * 0.6) : 0;
    const desert = city.biome === 'desert';
    if (!desert) drawUndergrowth(this.ctx, geom.cx, geom.cy + 4, i, seasonOf(city.month));
    const n = 4 + (hash2(x, y, 3) > 0.55 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const u = hash2(x * 7 + k, y * 3, 11) * 1.7 - 0.85;
      const v = hash2(x * 5, y * 11 + k, 17) * 1.7 - 0.85;
      if (Math.abs(u) + Math.abs(v) > 1) continue;
      const r = hash2(x + k, y, 29);
      const kindPick = desert ? 'palm' : r > 0.72 ? 'conifer' : r > 0.06 ? 'broadleaf' : 'dead';
      drawTree(
        this.ctx,
        geom.cx + u * 26,
        geom.cy + v * 13,
        kindPick,
        14 + hash2(x, y + k, 41) * 12,
        (i + k) % 6,
        seasonOf(city.month),
        wind,
      );
    }
    if (hash2(x, y, 77) > 0.9) drawRockAt(this.ctx, geom.cx + 14, geom.cy + 5, i);
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
    // a softer edge than the old two-stop cone, so a lit street fades into
    // the dark instead of stopping at a rim
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.7)');
    grad.addColorStop(0.75, 'rgba(255,255,255,0.25)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    this.glowSprite = c;
    return c;
  }

  /** Radius (world px) a tile's lights throw, or 0 for darkness.
   *
   * Kept tight on purpose. The pools used to be wide enough that a dense
   * downtown punched every hole into every other and the darkness layer had
   * nothing left to do; the lit windows carry the brightness now, and these
   * only need to say "someone lives on this street". */
  private lightRadius(t: CityState['tiles'][number]): number {
    if (t.zone === Zone.Road) return t.median ? 0 : 15;
    if (t.zone === Zone.None) return 0;
    if (t.abandoned || !t.powered) return 0;
    if (
      t.zone === Zone.Residential ||
      t.zone === Zone.Commercial ||
      t.zone === Zone.Industrial
    ) {
      return t.stage > 0 ? 9 + t.stage * 2.4 : 0;
    }
    if (t.zone === Zone.PowerLine || t.zone === Zone.WaterPipe || t.zone === Zone.Park) return 0;
    if (isPlant(t.zone)) return 28;
    return 16;
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
      const x = i % GRID;
      const y = (i / GRID) | 0;
      if (!this.visible(x, y)) continue;
      const r = this.lightRadius(city.tiles[i]);
      if (r === 0) continue;
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

  private isGrowable(zone: Zone): boolean {
    return zone === Zone.Residential || zone === Zone.Commercial || zone === Zone.Industrial;
  }

  /** Which screen side every lot's street is on. Cheap enough to redo whenever
   * a road tile appears or vanishes, or the camera turns a quarter. */
  private ensureRoadSides(city: CityState) {
    // every tile, every time the roads move: a lot zoned after its street was
    // laid must already know which way to face
    const stamp = roadStampOf(city);
    if (stamp === this.roadStamp && this.quarter === this.roadQuarter) return;
    this.roadStamp = stamp;
    this.roadQuarter = this.quarter;
    roadSidesFor(city, this.quarter, this.roadSide);
  }

  /** The lots whose near side stands on water, kept while the coast, the
   * built-up set and the quarter stand still. */
  private shoreLots: ShorelineLot[] = [];
  private shoreStamp = -1;
  private shoreQuarter = -1;
  private ensureShoreline(city: CityState) {
    let stamp = this.depthStamp;
    for (let i = 0; i < city.tiles.length; i += 7) {
      if (city.tiles[i].stage > 0) stamp = (stamp * 31 + i) | 0;
    }
    if (stamp === this.shoreStamp && this.quarter === this.shoreQuarter) return;
    this.shoreStamp = stamp;
    this.shoreQuarter = this.quarter;
    this.shoreLots = shorelineLots(city, this.quarter);
  }

  /** True when this tile sits on a land/water boundary. */
  private shoreline(city: CityState, x: number, y: number): boolean {
    const wet = city.tiles[idx(x, y)].terrain === Terrain.Water;
    for (const [nx, ny] of neighbors4(x, y)) {
      if ((city.tiles[idx(nx, ny)].terrain === Terrain.Water) !== wet) return true;
    }
    return false;
  }

  /**
   * The geometry a multi-tile building draws into when the painter's loop
   * reaches tile `i`, or null when this is not the tile that should draw it.
   */
  private blockDrawGeom(city: CityState, i: number, size: number): TileGeom | null {
    const a = anchorOf(city.tiles[i], i);
    const ax = a % GRID;
    const ay = (a / GRID) | 0;
    const offset = deepestOfBlock(ax, ay, size);
    const drawAt = idx(ax + (offset % size), ay + ((offset / size) | 0));
    if (drawAt !== i) return null;
    return blockGeom(ax, ay, size, city.tiles[a].elevation);
  }
}

/** A boulder, kept out of the class so the scenery pass stays readable. */
function drawRockAt(ctx: CanvasRenderingContext2D, x: number, y: number, seed: number) {
  const s = sprite(`bldr${seed % 5}`, { w: 20, h: 16, ax: 10, ay: 11 }, (c) => {
    c.fillStyle = 'rgba(26, 32, 46, 0.24)';
    c.beginPath();
    c.ellipse(2, 0, 7, 3, 0, 0, TAU);
    c.fill();
    const body = hsl(28, 10, 44);
    c.fillStyle = css(lit(body, LIGHT.right));
    c.beginPath();
    c.ellipse(0, -2.6, 6, 4, 0, 0, TAU);
    c.fill();
    c.fillStyle = css(lit(body, LIGHT.roof));
    c.beginPath();
    c.ellipse(-1.4, -4.4, 4, 2.4, 0, 0, TAU);
    c.fill();
  });
  blit(ctx, s, x, y);
}
