import { idx, neighbors4 } from '../sim/grid';
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

const PED_COLORS = ['#3a3530', '#5a4a3a', '#2f3a4a', '#4a3a4a'];

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
          if (t.traffic > 0) this.busy.push(i);
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
      (c) => city.tiles[c.from].zone === Zone.Road && city.tiles[c.to].zone === Zone.Road,
    );
    let target = Math.min(MAX_CARS, busy.length * 2);
    if (this.pandemic) target = Math.ceil(target * 0.25); // lockdown: streets go quiet
    while (this.cars.length < target && busy.length > 0) {
      const from = busy[(Math.random() * busy.length) | 0];
      if (city.tiles[from].zone !== Zone.Road) break; // stale scan; wait for rescan
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
      if (city.tiles[ni].zone === Zone.Road && ni !== prev) options.push(ni);
    }
    if (options.length === 0) {
      return prev !== -1 && city.tiles[prev].zone === Zone.Road ? prev : -1;
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
    return {
      tile: lots[(Math.random() * lots.length) | 0],
      ox: Math.cos(a) * HW * r * 0.7,
      oy: Math.sin(a) * HH * r * 0.7,
      vx: Math.cos(a) * 4,
      vy: Math.sin(a) * 2,
      ttl: 4 + Math.random() * 6,
      color: PED_COLORS[(Math.random() * PED_COLORS.length) | 0],
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
  drawTile(ctx: CanvasRenderingContext2D, i: number): void {
    const cars = this.carBuckets.get(i);
    if (cars) {
      for (const car of cars) {
        const a = center(car.from);
        const b = center(car.to);
        const sx = a.sx + (b.sx - a.sx) * car.t;
        const sy = a.sy + (b.sy - a.sy) * car.t;
        const angle = Math.atan2(b.sy - a.sy, b.sx - a.sx);
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(angle);
        ctx.translate(0, car.laneSide * 4);
        switch (car.kind) {
          case 'truck':
            ctx.fillStyle = '#3d434b';
            ctx.fillRect(-6, -2, 4, 4); // cab
            ctx.fillStyle = car.color;
            ctx.fillRect(-1, -2.5, 7, 5); // trailer
            break;
          case 'bus':
            ctx.fillStyle = car.color;
            ctx.fillRect(-7, -2.5, 14, 5);
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.fillRect(-6, -1.5, 12, 1.5); // window band
            break;
          case 'van':
            ctx.fillStyle = car.color;
            ctx.fillRect(-4.5, -2.5, 9, 5);
            ctx.fillStyle = 'rgba(20,25,35,0.55)';
            ctx.fillRect(-3.5, -1.5, 3, 3);
            break;
          case 'taxi':
            ctx.fillStyle = car.color;
            ctx.fillRect(-4, -2, 8, 4);
            ctx.fillStyle = 'rgba(20,25,35,0.55)';
            ctx.fillRect(-1.5, -1.5, 3.5, 3);
            ctx.fillStyle = '#2b2b2b';
            ctx.fillRect(-0.5, -2.7, 2, 1); // roof sign
            break;
          default:
            ctx.fillStyle = car.color;
            ctx.fillRect(-4, -2, 8, 4);
            ctx.fillStyle = 'rgba(20,25,35,0.55)';
            ctx.fillRect(-1.5, -1.5, 3.5, 3);
        }
        ctx.restore();
      }
    }
    const peds = this.pedBuckets.get(i);
    if (peds) {
      for (const p of peds) {
        const c = center(p.tile);
        ctx.fillStyle = p.color;
        ctx.fillRect(c.sx + p.ox - 1, c.sy + p.oy - 2, 2, 3);
        if (this.pandemic) {
          ctx.fillStyle = '#f2f5f8'; // masked up
          ctx.fillRect(c.sx + p.ox - 1, c.sy + p.oy - 2, 2, 1);
        }
      }
    }
  }
}
