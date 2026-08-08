import { idx, neighbors4 } from '../sim/grid';
import { drivable } from '../sim/roads';
import { CityState, GRID, Zone } from '../sim/types';
import { ELEV_PX, TILE_H, TILE_W, isoToScreen, tileDepth } from './iso';

const HW = TILE_W / 2;
const HH = TILE_H / 2;
const SCAN_INTERVAL = 15; // steps between full-grid rescans

const MAX_CARS = 40;
const MAX_PEDS = 60;
const CAR_SPEED = 1.8; // tiles per second

export type VehicleKind = 'car' | 'taxi' | 'van' | 'truck' | 'bus';

const CAR_COLORS = [
  '#e8e6e0', '#b8bcc4', '#c05045', '#4a6fb0', '#e0b83a',
  '#3a3f46', '#7a4a8c', '#4a8a5a', '#a35d2a', '#8c8578',
];
const VAN_COLORS = ['#dcd9d2', '#9aa4ad', '#5b7d9e'];
const TRUCK_COLORS = ['#c7c3ba', '#8f9aa6', '#7d6b52'];
const TAXI_BODY = '#e8c227';
const BUS_BODY = '#2fa38f'; // transit teal, matches the bus-stop shelter

const KIND_SPEED: Record<VehicleKind, number> = {
  car: 1, taxi: 1.1, van: 0.95, truck: 0.8, bus: 0.75,
};

const PED_COLORS = [
  '#3a3530', '#5a4a3a', '#2f3a4a', '#4a3a4a',
  '#6e3d33', '#33523f', '#7a7469', '#42356b',
];

/** Kind weights from what the spawn road serves. Pure — unit tested. */
export function vehicleWeights(neighborZones: Zone[]): Record<VehicleKind, number> {
  const w: Record<VehicleKind, number> = { car: 4, taxi: 0.2, van: 0.4, truck: 0.3, bus: 0 };
  for (const z of neighborZones) {
    if (z === Zone.Industrial) {
      w.truck += 1.4;
      w.van += 0.4;
    } else if (z === Zone.Commercial) {
      w.taxi += 0.9;
      w.van += 0.5;
    } else if (z === Zone.BusStop) {
      w.bus += 2;
    }
  }
  return w;
}

export function pickKind(w: Record<VehicleKind, number>, r: number): VehicleKind {
  const order: VehicleKind[] = ['car', 'taxi', 'van', 'truck', 'bus'];
  const total = order.reduce((s, k) => s + w[k], 0);
  let acc = 0;
  for (const k of order) {
    acc += w[k];
    if (r * total < acc) return k;
  }
  return 'car';
}

interface Car {
  from: number; // tile index
  to: number;
  t: number; // 0..1 progress
  kind: VehicleKind;
  style: BodyStyle;
  color: string;
  laneSide: 1 | -1;
}

interface Ped {
  tile: number;
  ox: number; // offset within tile diamond, screen px
  oy: number;
  vx: number;
  vy: number;
  ttl: number; // seconds until respawn
  color: string;
  w: number; // 1–2 px
  h: number; // 2–4 px
}

/** Elevations of the last-stepped city, so actors ride their tile's height. */
let elevs: { elevation: number }[] | null = null;

function center(i: number): { sx: number; sy: number } {
  const p = isoToScreen((i % GRID) + 0.5, ((i / GRID) | 0) + 0.5);
  if (elevs) p.sy -= elevs[i].elevation * ELEV_PX;
  return p;
}

/**
 * Decorative citizens: cars wander the trafficked road network, pedestrians
 * mill about developed lots. Purely visual — reads sim state, never writes.
 */
export class Automata {
  private cars: Car[] = [];
  private peds: Ped[] = [];
  private lastTime = 0;
  private scanCountdown = 0;
  private busy: number[] = [];
  private lots: number[] = [];
  /** cars/peds bucketed by the tile they should be drawn with, rebuilt per frame */
  private carBuckets = new Map<number, Car[]>();
  private pedBuckets = new Map<number, Ped[]>();
  /** Pandemic flag from the last step; thins targets and masks the peds. */
  private pandemic = false;

  carCount(): number {
    return this.cars.length;
  }

  pedCount(): number {
    return this.peds.length;
  }

  step(city: CityState, now: number, timeScale = 1): void {
    elevs = city.tiles;
    // timeScale follows the sim speed: 0 freezes the citizens mid-stride
    const dt =
      Math.min(0.1, this.lastTime === 0 ? 0.016 : (now - this.lastTime) / 1000) * timeScale;
    this.lastTime = now;

    if (this.scanCountdown-- <= 0) {
      this.scanCountdown = SCAN_INTERVAL;
      this.busy = [];
      this.lots = [];
      for (let i = 0; i < city.tiles.length; i++) {
        const t = city.tiles[i];
        if (t.zone === Zone.Road) {
          // a planted median carries no traffic, so nothing ever drives on it
          if (t.traffic > 0 && drivable(t)) this.busy.push(i);
        } else if (
          (t.zone === Zone.Residential || t.zone === Zone.Commercial) &&
          t.stage > 0 &&
          !t.abandoned
        ) {
          this.lots.push(i);
        }
      }
    }

    this.pandemic = city.disasters.pandemicMonths > 0;
    this.stepCars(city, dt, this.busy);
    this.stepPeds(city, dt, this.lots);
    this.bucket();
  }

  private stepCars(city: CityState, dt: number, busy: number[]): void {
    // demolition check: a car whose road vanished despawns immediately
    this.cars = this.cars.filter(
      (c) => drivable(city.tiles[c.from]) && drivable(city.tiles[c.to]),
    );
    let target = Math.min(MAX_CARS, busy.length * 2);
    if (this.pandemic) target = Math.ceil(target * 0.25); // lockdown: streets go quiet
    while (this.cars.length < target && busy.length > 0) {
      const from = busy[(Math.random() * busy.length) | 0];
      if (!drivable(city.tiles[from])) break; // stale scan; wait for rescan
      const next = this.nextRoad(city, from, -1);
      if (next === -1) break;
      const nz: Zone[] = [];
      const x = from % GRID;
      const y = (from / GRID) | 0;
      for (const [nx, ny] of neighbors4(x, y)) nz.push(city.tiles[idx(nx, ny)].zone);
      const kind = pickKind(vehicleWeights(nz), Math.random());
      const color =
        kind === 'taxi' ? TAXI_BODY
        : kind === 'bus' ? BUS_BODY
        : kind === 'van' ? VAN_COLORS[(Math.random() * VAN_COLORS.length) | 0]
        : kind === 'truck' ? TRUCK_COLORS[(Math.random() * TRUCK_COLORS.length) | 0]
        : CAR_COLORS[(Math.random() * CAR_COLORS.length) | 0];
      this.cars.push({
        from,
        to: next,
        t: Math.random(),
        kind,
        style: pickBody(kind, Math.random()),
        color,
        laneSide: Math.random() < 0.5 ? 1 : -1,
      });
    }
    if (this.cars.length > target) this.cars.length = target;

    for (const car of this.cars) {
      car.t += dt * CAR_SPEED * KIND_SPEED[car.kind];
      while (car.t >= 1) {
        car.t -= 1;
        const next = this.nextRoad(city, car.to, car.from);
        if (next === -1) {
          // dead end: turn around
          const back = car.from;
          car.from = car.to;
          car.to = back;
        } else {
          car.from = car.to;
          car.to = next;
        }
      }
    }
  }

  /** Random adjacent road tile, avoiding `prev` unless it's the only option. */
  private nextRoad(city: CityState, from: number, prev: number): number {
    const x = from % GRID;
    const y = (from / GRID) | 0;
    const options: number[] = [];
    for (const [nx, ny] of neighbors4(x, y)) {
      const ni = idx(nx, ny);
      if (drivable(city.tiles[ni]) && ni !== prev) options.push(ni);
    }
    if (options.length === 0) {
      return prev !== -1 && drivable(city.tiles[prev]) ? prev : -1;
    }
    return options[(Math.random() * options.length) | 0];
  }

  private stepPeds(city: CityState, dt: number, lots: number[]): void {
    // lots can devolve (abandonment, bulldoze) between scans
    this.peds = this.peds.filter((p) => {
      const t = city.tiles[p.tile];
      return (
        (t.zone === Zone.Residential || t.zone === Zone.Commercial) && t.stage > 0 && !t.abandoned
      );
    });
    let target = Math.min(MAX_PEDS, lots.length * 2);
    if (this.pandemic) target = Math.ceil(target * 0.15);
    while (this.peds.length < target && lots.length > 0) {
      this.peds.push(this.spawnPed(lots));
    }
    if (this.peds.length > target) this.peds.length = target;

    for (let i = 0; i < this.peds.length; i++) {
      const p = this.peds[i];
      p.ttl -= dt;
      if (p.ttl <= 0 && lots.length > 0) {
        this.peds[i] = this.spawnPed(lots);
        continue;
      }
      p.ox += p.vx * dt;
      p.oy += p.vy * dt;
      // stay in the sidewalk annulus: outside the building footprint,
      // inside the tile diamond
      const d = Math.abs(p.ox) / HW + Math.abs(p.oy) / HH;
      if (d > 0.92 || d < 0.55) {
        p.vx = -p.vx;
        p.vy = -p.vy;
      }
    }
  }

  private spawnPed(lots: number[]): Ped {
    const a = Math.random() * Math.PI * 2;
    // spawn in the sidewalk annulus (see stepPeds)
    const r = 0.6 + Math.random() * 0.28;
    const pace = 0.7 + Math.random() * 0.7;
    return {
      tile: lots[(Math.random() * lots.length) | 0],
      ox: Math.cos(a) * HW * r * 0.7,
      oy: Math.sin(a) * HH * r * 0.7,
      vx: Math.cos(a) * 4 * pace,
      vy: Math.sin(a) * 2 * pace,
      ttl: 4 + Math.random() * 6,
      color: PED_COLORS[(Math.random() * PED_COLORS.length) | 0],
      w: 1 + ((Math.random() * 2) | 0),
      h: 2 + ((Math.random() * 3) | 0),
    };
  }

  private bucket(): void {
    this.carBuckets.clear();
    this.pedBuckets.clear();
    for (const car of this.cars) {
      // draw with whichever endpoint paints later (greater depth under the
      // current view angle) so the neighboring ground never overdraws the car
      const fx = car.from % GRID;
      const fy = (car.from / GRID) | 0;
      const tx = car.to % GRID;
      const ty = (car.to / GRID) | 0;
      const tile = tileDepth(fx, fy) >= tileDepth(tx, ty) ? car.from : car.to;
      let list = this.carBuckets.get(tile);
      if (!list) this.carBuckets.set(tile, (list = []));
      list.push(car);
    }
    for (const ped of this.peds) {
      let list = this.pedBuckets.get(ped.tile);
      if (!list) this.pedBuckets.set(ped.tile, (list = []));
      list.push(ped);
    }
  }

  /** Draw the automata that belong to tile i. Called inside the painter's loop. */
  drawTile(ctx: CanvasRenderingContext2D, i: number, night = 0): void {
    const cars = this.carBuckets.get(i);
    if (cars) {
      for (const car of cars) {
        const a = center(car.from);
        const b = center(car.to);
        const sx = a.sx + (b.sx - a.sx) * car.t;
        const sy = a.sy + (b.sy - a.sy) * car.t;
        const angle = Math.atan2(b.sy - a.sy, b.sx - a.sx);
        drawVehicle(ctx, sx, sy + car.laneSide * 4, angle, car.style, car.color, night);
      }
    }
    const peds = this.pedBuckets.get(i);
    if (peds) {
      for (const p of peds) {
        const c = center(p.tile);
        const x = c.sx + p.ox;
        const y = c.sy + p.oy;
        // a squashed shadow first, so a walker stands on the pavement
        ctx.fillStyle = 'rgba(20, 24, 38, 0.22)';
        ctx.fillRect(x - p.w / 2 + 0.8, y - 0.4, p.w + 0.8, 1.1);
        ctx.fillStyle = p.color;
        ctx.fillRect(x - p.w / 2, y - p.h, p.w, p.h);
        // a head about a fifth of the figure — any bigger and a crowd reads
        // as a scattering of pale dots rather than as people
        ctx.fillStyle = 'rgba(212, 178, 148, 0.95)';
        ctx.fillRect(x - p.w / 2 + 0.2, y - p.h - 0.9, Math.max(0.8, p.w - 0.4), 0.9);
        if (this.pandemic) {
          ctx.fillStyle = '#f2f5f8'; // masked up
          ctx.fillRect(x - p.w / 2 + 0.2, y - p.h - 0.4, Math.max(0.8, p.w - 0.4), 0.5);
        }
      }
    }
  }
}

/** Mix a hex body colour toward black or white; |t| in 0..1. */
function shade(hex: string, t: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const to = t < 0 ? 0 : 255;
  const k = Math.min(1, Math.abs(t));
  const mix = (c: number) => Math.round(c + (to - c) * k);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/**
 * Body styles within a kind. A street of identical sedans is as much a tell
 * as a street of identical houses, so a 'car' is a hatchback, a saloon, an
 * estate, an SUV or a coupé, and a 'truck' is a box van, a flatbed or an
 * articulated rig. Proportions follow real ones: a full-size pickup is about
 * 6m long to a hatchback's 4m, a semi with its trailer about 20m.
 */
export type BodyStyle =
  | 'hatch' | 'saloon' | 'estate' | 'suv' | 'coupe'
  | 'pickup' | 'panelVan' | 'minivan'
  | 'boxTruck' | 'flatbed' | 'semi'
  | 'bus' | 'taxi';

interface Body {
  len: number;
  wid: number;
  /** Where the cabin starts and ends along the body, 0..1 from the back. */
  cabin: [number, number];
  /** A separate, taller box behind the cabin (a van or truck body). */
  boxFrom?: number;
  boxHeight?: number;
}

const BODIES: Record<BodyStyle, Body> = {
  hatch: { len: 7.6, wid: 4.2, cabin: [0.28, 0.72] },
  saloon: { len: 9.2, wid: 4.3, cabin: [0.3, 0.66] },
  estate: { len: 9.8, wid: 4.3, cabin: [0.28, 0.78] },
  suv: { len: 9.6, wid: 4.8, cabin: [0.26, 0.78] },
  coupe: { len: 8.8, wid: 4.1, cabin: [0.34, 0.66] },
  taxi: { len: 9.2, wid: 4.3, cabin: [0.3, 0.66] },
  pickup: { len: 11.4, wid: 4.9, cabin: [0.5, 0.82] },
  panelVan: { len: 11, wid: 4.9, cabin: [0.62, 0.92], boxFrom: 0.05, boxHeight: 1 },
  minivan: { len: 10.4, wid: 4.8, cabin: [0.24, 0.84] },
  boxTruck: { len: 14, wid: 5.2, cabin: [0.7, 0.98], boxFrom: 0.02, boxHeight: 1.3 },
  flatbed: { len: 14, wid: 5.2, cabin: [0.7, 0.98] },
  semi: { len: 21, wid: 5.4, cabin: [0.78, 1], boxFrom: 0.02, boxHeight: 1.4 },
  bus: { len: 17, wid: 5.4, cabin: [0.04, 0.96] },
};

/** Which bodies each simulated kind can turn up as. */
const STYLES: Record<VehicleKind, BodyStyle[]> = {
  car: ['hatch', 'saloon', 'estate', 'suv', 'coupe', 'hatch', 'saloon'],
  taxi: ['taxi'],
  van: ['panelVan', 'minivan', 'pickup'],
  truck: ['boxTruck', 'semi', 'flatbed', 'boxTruck'],
  bus: ['bus'],
};

export function pickBody(kind: VehicleKind, r: number): BodyStyle {
  const list = STYLES[kind];
  return list[Math.min(list.length - 1, Math.floor(r * list.length))];
}

/**
 * One vehicle: a shadow on the tarmac, a body with a lit upper surface, a
 * glazed cabin, and — after dark — headlights that actually throw a beam.
 */
function drawVehicle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  style: BodyStyle,
  color: string,
  night: number,
): void {
  const b = BODIES[style];
  const L = b.len;
  const W = b.wid;
  const at = (t: number) => -L / 2 + t * L; // 0 is the tail, 1 the nose
  ctx.save();
  ctx.translate(x, y);
  // the shadow lies on the ground, so it is drawn before the body rotates in
  ctx.fillStyle = 'rgba(18, 22, 36, 0.3)';
  ctx.save();
  ctx.rotate(angle);
  ctx.fillRect(-L / 2 + 1.6, -W / 2 + 1.4, L, W);
  ctx.restore();

  ctx.rotate(angle);
  const lower = shade(color, -0.28);
  const upper = shade(color, 0.14);
  const glass = night > 0.3 ? 'rgba(40, 52, 74, 0.9)' : 'rgba(150, 178, 202, 0.78)';

  if (b.boxFrom !== undefined) {
    // a separate body behind the cab: taller, usually a different colour
    const bx = at(b.boxFrom);
    const bw = at(b.cabin[0]) - bx;
    const boxCol = style === 'semi' ? '#d8d4cc' : color;
    ctx.fillStyle = shade(boxCol, -0.22);
    ctx.fillRect(bx, -W / 2 - (b.boxHeight ?? 1), bw, W + (b.boxHeight ?? 1));
    ctx.fillStyle = shade(boxCol, 0.12);
    ctx.fillRect(bx, -W / 2 - (b.boxHeight ?? 1), bw, W * 0.45);
    ctx.fillStyle = 'rgba(20, 22, 28, 0.35)';
    ctx.fillRect(bx, -W / 2 - (b.boxHeight ?? 1), 0.8, W + (b.boxHeight ?? 1));
  } else if (style === 'flatbed') {
    ctx.fillStyle = shade('#6a6660', -0.2);
    ctx.fillRect(at(0.02), -W / 2 + 0.4, at(b.cabin[0]) - at(0.02), W - 0.8);
  }

  // the body itself
  const cabStart = style === 'semi' || style === 'boxTruck' || style === 'flatbed' || style === 'panelVan'
    ? at(b.cabin[0])
    : -L / 2;
  ctx.fillStyle = lower;
  ctx.fillRect(cabStart, -W / 2, L / 2 - cabStart, W);
  ctx.fillStyle = upper;
  ctx.fillRect(cabStart, -W / 2, L / 2 - cabStart, W * 0.44);

  // the cabin: glass between the pillars, sitting proud of the bonnet
  const c0 = at(b.cabin[0]);
  const c1 = at(b.cabin[1]);
  ctx.fillStyle = glass;
  ctx.fillRect(c0, -W / 2 + 0.6, c1 - c0, W - 1.2);
  if (style === 'bus') {
    // a window band the length of it, plus a door
    ctx.fillStyle = 'rgba(20, 24, 32, 0.35)';
    for (let t = 0.12; t < 0.95; t += 0.14) ctx.fillRect(at(t), -W / 2 + 0.6, 0.6, W - 1.2);
  } else if (style === 'estate' || style === 'suv' || style === 'minivan') {
    ctx.fillStyle = 'rgba(20, 24, 32, 0.3)';
    ctx.fillRect(at((b.cabin[0] + b.cabin[1]) / 2), -W / 2 + 0.6, 0.6, W - 1.2);
  }
  if (style === 'pickup') {
    // the open bed behind the cab
    ctx.fillStyle = shade(color, -0.4);
    ctx.fillRect(at(0.06), -W / 2 + 0.7, at(b.cabin[0]) - at(0.06), W - 1.4);
  }
  if (style === 'taxi') {
    ctx.fillStyle = '#25262a';
    ctx.fillRect(at(0.46), -W / 2 - 1.1, 2.4, 1.1);
  }
  // wheels: a dark strip along the underside sells the contact
  ctx.fillStyle = 'rgba(16, 18, 24, 0.75)';
  ctx.fillRect(-L / 2 + 1, W / 2 - 0.9, L - 2, 0.9);

  if (night > 0.25) {
    const a = Math.min(1, (night - 0.25) * 2.2);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const beam = ctx.createLinearGradient(L / 2, 0, L / 2 + 22, 0);
    beam.addColorStop(0, `rgba(255, 238, 190, ${0.4 * a})`);
    beam.addColorStop(1, 'rgba(255, 238, 190, 0)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(L / 2, -W / 2);
    ctx.lineTo(L / 2 + 22, -W * 1.4);
    ctx.lineTo(L / 2 + 22, W * 1.4);
    ctx.lineTo(L / 2, W / 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = `rgba(255, 246, 214, ${0.95 * a})`;
    ctx.fillRect(L / 2 - 0.8, -W / 2 + 0.4, 1.4, 1.2);
    ctx.fillRect(L / 2 - 0.8, W / 2 - 1.6, 1.4, 1.2);
    ctx.fillStyle = `rgba(255, 70, 50, ${0.9 * a})`;
    ctx.fillRect(-L / 2 - 0.4, -W / 2 + 0.4, 1.2, 1.1);
    ctx.fillRect(-L / 2 - 0.4, W / 2 - 1.5, 1.2, 1.1);
    ctx.restore();
  }
  ctx.restore();
}
