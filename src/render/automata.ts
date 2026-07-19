import { idx, neighbors4 } from '../sim/grid';
import { CityState, GRID, Zone } from '../sim/types';
import { TILE_H, isoToScreen } from './iso';

const MAX_CARS = 40;
const MAX_PEDS = 60;
const CAR_SPEED = 1.8; // tiles per second
const CAR_COLORS = ['#e8e6e0', '#b8bcc4', '#c05045', '#4a6fb0', '#e0b83a', '#3a3f46'];
const PED_COLORS = ['#3a3530', '#5a4a3a', '#2f3a4a', '#4a3a4a'];

interface Car {
  from: number; // tile index
  to: number;
  t: number; // 0..1 progress
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

function center(i: number): { sx: number; sy: number } {
  const { sx, sy } = isoToScreen(i % GRID, (i / GRID) | 0);
  return { sx, sy: sy + TILE_H / 2 };
}

/**
 * Decorative citizens: cars wander the trafficked road network, pedestrians
 * mill about developed lots. Purely visual — reads sim state, never writes.
 */
export class Automata {
  private cars: Car[] = [];
  private peds: Ped[] = [];
  private lastTime = 0;
  /** cars/peds bucketed by the tile they should be drawn with, rebuilt per frame */
  private carBuckets = new Map<number, Car[]>();
  private pedBuckets = new Map<number, Ped[]>();

  step(city: CityState, now: number): void {
    const dt = Math.min(0.1, this.lastTime === 0 ? 0.016 : (now - this.lastTime) / 1000);
    this.lastTime = now;

    const roads: number[] = [];
    const busy: number[] = [];
    const lots: number[] = [];
    for (let i = 0; i < city.tiles.length; i++) {
      const t = city.tiles[i];
      if (t.zone === Zone.Road) {
        roads.push(i);
        if (t.traffic > 0) busy.push(i);
      } else if (
        (t.zone === Zone.Residential || t.zone === Zone.Commercial) &&
        t.stage > 0 &&
        !t.abandoned
      ) {
        lots.push(i);
      }
    }

    this.stepCars(city, dt, busy);
    this.stepPeds(dt, lots);
    this.bucket();
  }

  private stepCars(city: CityState, dt: number, busy: number[]): void {
    const target = Math.min(MAX_CARS, busy.length * 2);
    while (this.cars.length < target) {
      const from = busy[(Math.random() * busy.length) | 0];
      const next = this.nextRoad(city, from, -1);
      if (next === -1) break;
      this.cars.push({
        from,
        to: next,
        t: Math.random(),
        color: CAR_COLORS[(Math.random() * CAR_COLORS.length) | 0],
        laneSide: Math.random() < 0.5 ? 1 : -1,
      });
    }
    if (this.cars.length > target) this.cars.length = target;

    for (const car of this.cars) {
      car.t += dt * CAR_SPEED;
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

  private stepPeds(dt: number, lots: number[]): void {
    const target = Math.min(MAX_PEDS, lots.length * 2);
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
      // stay inside the tile diamond (|ox|/HW + |oy|/HH ≤ ~0.8)
      if (Math.abs(p.ox) / 32 + Math.abs(p.oy) / 16 > 0.8) {
        p.vx = -p.vx;
        p.vy = -p.vy;
      }
    }
  }

  private spawnPed(lots: number[]): Ped {
    const a = Math.random() * Math.PI * 2;
    return {
      tile: lots[(Math.random() * lots.length) | 0],
      ox: (Math.random() - 0.5) * 24,
      oy: (Math.random() - 0.5) * 10,
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
      const tile = car.t < 0.5 ? car.from : car.to;
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
        ctx.fillStyle = car.color;
        ctx.fillRect(-4, -2, 8, 4);
        ctx.fillStyle = 'rgba(20,25,35,0.55)';
        ctx.fillRect(-1.5, -1.5, 3.5, 3);
        ctx.restore();
      }
    }
    const peds = this.pedBuckets.get(i);
    if (peds) {
      for (const p of peds) {
        const c = center(p.tile);
        ctx.fillStyle = p.color;
        ctx.fillRect(c.sx + p.ox - 1, c.sy + p.oy - 2, 2, 3);
      }
    }
  }
}
