import { corridorAt, travelDir } from '../sim/corridor';
import { idx, inBounds, neighbors4 } from '../sim/grid';
import { drivable, frontage } from '../sim/roads';
import { CityState, GRID, Zone } from '../sim/types';
import { dayBand, dayPhase, type DayBand } from './daynight';
import { figureSprite, frameFor, PALETTES } from './figure';
import { doorOf, FOOT_IN, footLeg, hasKerb, kerbPoint, midpointOf, successors, type Leg, type Option, type Pt } from './footways';
import { servedNow } from './linevehicles';
import { ELEV_PX, getViewAngle, isoToScreen, tileDepth } from './iso';
import {
  EDGE_DIR,
  edgeToward,
  headingAt,
  isTurn,
  LANE_OFF,
  opposite,
  pointAt,
  segment,
  type Edge,
  type Segment,
} from './lanegeom';
import { hash2 } from './noise';
import { blit } from './spritecache';
import { paintLights, vehicleSprite, type BodyStyle } from './vehiclemodel';

export type { BodyStyle } from './vehiclemodel';

const SCAN_INTERVAL = 15; // steps between full-grid rescans

/** Most cars on the road at once; the target below it follows the sim's traffic. */
export const MAX_CARS = 400;
/** Traffic units (summed over busy road tiles) per car on screen. */
export const CARS_PER_TRAFFIC = 25;
/** Most people out at once; the hour and the lots set the target below it. */
export const MAX_PEDS = 220;
/** People per developed lot per stage, [residential, commercial], by hour band. */
export const PED_DENSITY: Record<DayBand, [number, number]> = {
  morning: [0.4, 0.3],
  midday: [0.15, 0.6],
  evening: [0.4, 0.6],
  night: [0.05, 0.1],
};
/** The cap follows the hour too, or a big city's night is as busy as its noon. */
const PED_CAP: Record<DayBand, number> = { morning: 1, midday: 0.85, evening: 1, night: 0.25 };
/** Most people waiting at stops, city-wide, and at any one stop. */
export const QUEUE_MAX = 40;
export const QUEUE_AT_STOP = 4;
/** Mean seconds between arrivals at a served stop. */
const QUEUE_EVERY = 6;
/** Share of the people kept on a loop inside the parks. */
export const PARK_SHARE = 0.15;
/** Share of the people who step out of a door the player can see. */
export const SPAWN_IN_VIEW = 0.75;
/** Below this share of the crowd on screen, people off screen are recycled. */
export const SEEN_SHARE = 0.6;

export interface ViewClip {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Walking pace, tiles per second. */
const PACE_MIN = 0.22;
const PACE_MAX = 0.34;

/** How many people the lots justify for the hour. */
export function targetPeds(stageR: number, stageC: number, band: DayBand, pandemic: boolean): number {
  const [r, c] = PED_DENSITY[band];
  let n = Math.min(Math.round(MAX_PEDS * PED_CAP[band]), Math.round(stageR * r + stageC * c));
  if (pandemic) n = Math.ceil(n * 0.15);
  return n;
}

/** Following distance, bumper to bumper, in tiles. */
export const GAP = 0.22;
/** Acceleration and braking, tiles per second squared. */
export const ACCEL = 2.2;
export const BRAKE = 4.5;
/** A signalled crossroads cycles once every this many seconds of animation time. */
export const SIGNAL_PERIOD = 9;
/** Where along the approach tile a car waits for a light, 0..1. */
/** Seconds a stem car holds at a give-way line before it is let through. */
export const MAX_WAIT = 4;
export const STOP_AT = 0.82;
/** Free speed by road class, tiles per second: street, route, boulevard, motorway, upper deck. */
const CLASS_SPEED = [1.8, 2.4, 2.4, 3.6, 3.6];

export type VehicleKind = 'car' | 'taxi' | 'van' | 'truck' | 'bus';

const CAR_COLORS = [
  '#e8e6e0', '#b8bcc4', '#c05045', '#4a6fb0', '#e0b83a',
  '#3a3f46', '#7a4a8c', '#4a8a5a', '#a35d2a', '#8c8578',
];
const VAN_COLORS = ['#dcd9d2', '#9aa4ad', '#5b7d9e'];
const TRUCK_COLORS = ['#c7c3ba', '#8f9aa6', '#7d6b52'];
const TAXI_BODY = '#e8c227';
const BUS_BODY = '#2fa38f'; // transit teal, matches the bus-stop shelter
const FIRE_BODY = '#c8282a';
const POLICE_BODY = '#e9ebee';
const GARBAGE_BODY = '#8d949c';

const KIND_SPEED: Record<VehicleKind, number> = {
  car: 1, taxi: 1.1, van: 0.95, truck: 0.8, bus: 0.75,
};

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

export type Role = 'trip' | 'fire' | 'police' | 'garbage';

/** A planned halt on a car's path: index into `path`, how long, and why. */
interface Stop {
  at: number;
  /** Seconds to wait; a fire engine waits while the fire burns instead. */
  dwell: number;
  fireTile?: number;
}

export interface Car {
  /** Where it is: the tile, the curve across it, and how far along. */
  tile: number;
  entry: Edge;
  exit: Edge;
  seg: Segment;
  s: number;
  /** Speed in tiles per second, and whether it is braking hard enough to show. */
  v: number;
  brake: boolean;
  /** The tiles it will drive, and the index of `tile` in them. */
  path: number[];
  at: number;
  stops: Stop[];
  dwellLeft: number;
  kind: VehicleKind;
  style: BodyStyle;
  color: string;
  role: Role;
  /** Fade: 1 arriving on the road, 0 driving, −1 pulling off it. */
  alpha: number;
  fading: -1 | 0 | 1;
  /** Seconds held at a give-way line this tile; a long wait is let through. */
  waited: number;
  /** Planted by a test: never thinned to meet the traffic target. */
  pinned?: boolean;
}

// ---------------------------------------------------------------------------
// Lane discipline
// ---------------------------------------------------------------------------

/**
 * The tile ahead of a car standing on a carriageway, or −1 when it is not on
 * one or the carriageway ends here.
 *
 * This is what stops a wide road behaving like a car park. Left to the old
 * rule — pick any adjacent road at random — a car on a four-tile band spent as
 * much time drifting sideways across the carriageway as travelling along it,
 * which is exactly what a car park looks like. The lane a tile sits in fixes
 * the direction of travel, so the band carries two streams instead of a milling
 * crowd.
 */
export function laneStep(city: CityState, from: number): number {
  const x = from % GRID;
  const y = (from / GRID) | 0;
  const cor = corridorAt(city, x, y);
  if (!cor) return -1;
  const dir = travelDir(cor);
  const nx = x + (cor.axis === 0 ? dir : 0);
  const ny = y + (cor.axis === 1 ? dir : 0);
  if (!inBounds(nx, ny)) return -1;
  const ni = idx(nx, ny);
  return drivable(city.tiles[ni]) ? ni : -1;
}

/**
 * May a car step from `from` onto `to`? Everything is allowed except driving
 * head-on into a lane that runs the other way: you may merge onto a motorway
 * from the side, and change lanes within it, but you may not come up it
 * backwards.
 */
export function canEnter(city: CityState, from: number, to: number): boolean {
  const cor = corridorAt(city, to % GRID, (to / GRID) | 0);
  if (!cor) return true;
  const dx = (to % GRID) - (from % GRID);
  const dy = ((to / GRID) | 0) - ((from / GRID) | 0);
  const along = cor.axis === 0 ? dx : dy;
  if (along === 0) return true; // merging across, not driving up it
  return Math.sign(along) === travelDir(cor);
}

/**
 * Where a car at `from` goes next when it has no route. On a carriageway the
 * lane decides; on an ordinary street it is a random turn, avoiding `prev`
 * where there is a choice. `rand` is injected so the rule can be tested
 * without the dice.
 */
export function nextRoad(
  city: CityState,
  from: number,
  prev: number,
  rand: () => number = Math.random,
): number {
  const lane = laneStep(city, from);
  if (lane !== -1) return lane;

  const x = from % GRID;
  const y = (from / GRID) | 0;
  const options: number[] = [];
  for (const [nx, ny] of neighbors4(x, y)) {
    const ni = idx(nx, ny);
    if (!drivable(city.tiles[ni]) || ni === prev) continue;
    if (!canEnter(city, from, ni)) continue;
    options.push(ni);
  }
  if (options.length === 0) {
    return prev !== -1 && drivable(city.tiles[prev]) ? prev : -1;
  }
  return options[Math.min(options.length - 1, (rand() * options.length) | 0)];
}

// ---------------------------------------------------------------------------
// Routing and junctions
// ---------------------------------------------------------------------------

const parent = new Int32Array(GRID * GRID);
const stamp = new Int32Array(GRID * GRID);
let stampNow = 0;
const queue = new Int32Array(GRID * GRID);

/**
 * The tiles from `from` to `dest`, both included, by the fewest road tiles
 * that never drive against a carriageway; null when there is no way.
 */
export function routeTo(city: CityState, from: number, dest: number, maxTiles = GRID * GRID): number[] | null {
  if (from === dest) return [from];
  if (!drivable(city.tiles[from]) || !drivable(city.tiles[dest])) return null;
  stampNow++;
  let head = 0;
  let tail = 0;
  queue[tail++] = from;
  stamp[from] = stampNow;
  parent[from] = -1;
  let expanded = 0;
  while (head < tail && expanded < maxTiles) {
    const cur = queue[head++];
    expanded++;
    const x = cur % GRID;
    const y = (cur / GRID) | 0;
    for (const [nx, ny] of neighbors4(x, y)) {
      const ni = idx(nx, ny);
      if (stamp[ni] === stampNow) continue;
      if (!drivable(city.tiles[ni]) || !canEnter(city, cur, ni)) continue;
      stamp[ni] = stampNow;
      parent[ni] = cur;
      if (ni === dest) {
        const path: number[] = [];
        for (let k = dest; k !== -1; k = parent[k]) path.push(k);
        return path.reverse();
      }
      queue[tail++] = ni;
    }
  }
  return null;
}

/** Bit k set when the neighbour across edge k is drivable road. */
export function armsOf(city: CityState, i: number): number {
  const x = i % GRID;
  const y = (i / GRID) | 0;
  let mask = 0;
  for (let k = 0; k < 4; k++) {
    const nx = x + EDGE_DIR[k][0];
    const ny = y + EDGE_DIR[k][1];
    if (inBounds(nx, ny) && drivable(city.tiles[idx(nx, ny)])) mask |= 1 << k;
  }
  return mask;
}

/**
 * 4 for a signalled crossroads, 3 for a give-way T, 0 for anything else.
 * Only plain streets are controlled: a carriageway's lanes already settle
 * who goes where, and a street meeting one merges as it always did.
 */
export function junctionKind(city: CityState, i: number): 0 | 3 | 4 {
  const t = city.tiles[i];
  if (!drivable(t) || t.road !== 0) return 0;
  const x = i % GRID;
  const y = (i / GRID) | 0;
  if (corridorAt(city, x, y)) return 0;
  const mask = armsOf(city, i);
  let n = 0;
  for (let k = 0; k < 4; k++) {
    if (!(mask & (1 << k))) continue;
    const nx = x + EDGE_DIR[k][0];
    const ny = y + EDGE_DIR[k][1];
    const nt = city.tiles[idx(nx, ny)];
    if (nt.road !== 0 || corridorAt(city, nx, ny)) return 0;
    n++;
  }
  return n === 4 ? 4 : n === 3 ? 3 : 0;
}

export type Phase = 'ns' | 'ew' | 'red';

/** Which arms of a signalled crossroads are green at this moment of the animation clock. */
export function signalPhase(tile: number, clock: number): Phase {
  const x = tile % GRID;
  const y = (tile / GRID) | 0;
  const ph = (clock / SIGNAL_PERIOD + hash2(x, y, 7)) % 1;
  if (ph < 0.45) return 'ns';
  if (ph >= 0.5 && ph < 0.95) return 'ew';
  return 'red';
}

/** How many cars the sim's traffic justifies on screen. */
export function targetCars(trafficSum: number, night: number, pandemic: boolean): number {
  const base = Math.min(MAX_CARS, Math.round(trafficSum / CARS_PER_TRAFFIC));
  const scaled = base * (1 - 0.6 * Math.min(1, Math.max(0, night))) * (pandemic ? 0.25 : 1);
  return Math.round(scaled);
}

export type PedMode = 'exit' | 'walk' | 'enter' | 'park' | 'wait' | 'board';

export interface Ped {
  mode: PedMode;
  palette: number;
  /** Walking pace, tiles/s. */
  pace: number;
  /** Tiles walked: sets the gait frame and, in time, the urge to go indoors. */
  dist: number;
  alpha: number;
  /** Drawn with this tile. */
  tile: number;
  /** On the footways: the leg and the fraction of it walked. */
  leg: Leg | null;
  s: number;
  /** In a park: offset from the lot centre and velocity, tile units. */
  du: number;
  dv: number;
  vu: number;
  vv: number;
  ttl: number;
  /** Waiting at, or boarding from, this stop tile. */
  stop?: number;
}

/** Elevations of the last-stepped city, so actors ride their tile's height. */
let elevs: { elevation: number }[] | null = null;

function weightedPick(opts: Option[]): Leg {
  let sum = 0;
  for (const o of opts) sum += o.weight;
  let r = Math.random() * sum;
  for (const o of opts) {
    r -= o.weight;
    if (r <= 0) return o.leg;
  }
  return opts[opts.length - 1].leg;
}

function pick<T>(list: T[]): T {
  return list[(Math.random() * list.length) | 0];
}

const EDGE_MID: readonly [number, number][] = [
  [0.5, 0],
  [1, 0.5],
  [0.5, 1],
  [0, 0.5],
];

/**
 * Decorative citizens: cars drive the trafficked road network between the
 * lots that generate the traffic, pedestrians mill about developed lots.
 * Purely visual — reads sim state, never writes.
 */
export class Automata {
  private cars: Car[] = [];
  private peds: Ped[] = [];
  private lastTime = 0;
  /** Animation seconds: advances with the sim speed, so Pause freezes lights too. */
  private clock = 0;
  private scanCountdown = 0;
  private busy: number[] = [];
  private busyR: number[] = [];
  private busyCI: number[] = [];
  private destR: number[] = [];
  private destC: number[] = [];
  private destI: number[] = [];
  private lots: number[] = [];
  private lotsR: number[] = [];
  private lotsC: number[] = [];
  private stageR = 0;
  private stageC = 0;
  private parks: number[] = [];
  private rain = false;
  /** The tiles on screen, when the renderer says: most people step out where the player is looking. */
  private clip: ViewClip | null = null;
  /** The transit clock, seconds, as the line vehicles read it. */
  private lineSec = 0;
  /** Stop tiles with a kerb in front, where people may queue. */
  private stopKerbs = new Map<number, { tile: number; edge: Edge; at: Pt }>();
  private servedPrev = new Set<number>();
  private junction = new Uint8Array(GRID * GRID);
  private arms = new Uint8Array(GRID * GRID);
  private trafficSum = 0;
  private fireStations: number[] = [];
  private policeStations: number[] = [];
  private disposals: number[] = [];
  private fires: { road: number; tile: number }[] = [];
  private crimes: number[] = [];
  private lastDispatch: Record<Role, number> = { trip: -1e9, fire: -1e9, police: -1e9, garbage: -1e9 };
  private nextRound = new Map<number, number>();
  /** cars/peds bucketed by the tile they should be drawn with, rebuilt per frame */
  private carBuckets = new Map<number, Car[]>();
  private pedBuckets = new Map<number, Ped[]>();
  /** Per-step lane occupancy: tile*4 + exit → cars sorted by progress. */
  private occ = new Map<number, Car[]>();
  /** Pandemic flag from the last step; thins targets and masks the peds. */
  private pandemic = false;
  private night = 0;
  private zoom = 1;
  /** View constants for the frame being drawn, set once per step. */
  private quarter: 0 | 1 | 2 | 3 = 0;
  private cosA = 1;
  private sinA = 0;

  carCount(): number {
    return this.cars.length;
  }

  pedCount(): number {
    return this.peds.length;
  }

  /** Test hook: the people as they stand. */
  pedsNow(): readonly Ped[] {
    return this.peds;
  }

  /** Night 0..1 (thins the traffic) and zoom (hides what cannot be seen) from the renderer. */
  setView(night: number, zoom: number, clip: ViewClip | null = null, lineSec = 0): void {
    this.night = night;
    this.zoom = zoom;
    this.clip = clip;
    this.lineSec = lineSec;
  }

  /** Test hook: put a car on the road with a route of your choosing. */
  plant(city: CityState, path: number[], opts: Partial<Pick<Car, 'kind' | 'style' | 'color' | 'role' | 'stops' | 's' | 'v'>> = {}): Car {
    const car = this.makeCar(city, path, opts.role ?? 'trip', opts.kind ?? 'car', opts.style ?? 'saloon', opts.color ?? CAR_COLORS[0]);
    if (opts.stops) car.stops = opts.stops;
    if (opts.s !== undefined) car.s = opts.s;
    if (opts.v !== undefined) car.v = opts.v;
    car.alpha = 1;
    car.fading = 0;
    car.pinned = true;
    this.cars.push(car);
    return car;
  }

  /** Test hook: the cars as they stand. */
  carsNow(): readonly Car[] {
    return this.cars;
  }

  /** Test hook: move the animation clock. */
  setClock(seconds: number): void {
    this.clock = seconds;
  }

  step(city: CityState, now: number, timeScale = 1): void {
    elevs = city.tiles;
    // timeScale follows the sim speed: 0 freezes the citizens mid-stride
    const dt =
      Math.min(0.1, this.lastTime === 0 ? 0.016 : (now - this.lastTime) / 1000) * timeScale;
    this.lastTime = now;
    this.clock += dt;

    if (this.scanCountdown-- <= 0) {
      this.scanCountdown = SCAN_INTERVAL;
      this.scan(city);
    }

    this.pandemic = city.disasters.pandemicMonths > 0;
    this.rain = city.weather.kind === 'rain';
    this.stepCars(city, dt, now);
    this.stepPeds(city, dt, now);
    this.bucket();
    const angle = getViewAngle();
    this.quarter = (((Math.round(angle / (Math.PI / 2)) % 4) + 4) % 4) as 0 | 1 | 2 | 3;
    this.cosA = Math.cos(angle);
    this.sinA = Math.sin(angle);
  }

  private scan(city: CityState): void {
    this.busy = [];
    this.busyR = [];
    this.busyCI = [];
    this.destR = [];
    this.destC = [];
    this.destI = [];
    this.lots = [];
    this.lotsR = [];
    this.lotsC = [];
    this.stageR = 0;
    this.stageC = 0;
    this.parks = [];
    this.fireStations = [];
    this.policeStations = [];
    this.disposals = [];
    this.fires = [];
    this.crimes = [];
    this.trafficSum = 0;
    const tiles = city.tiles;
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      if (t.zone === Zone.Road) {
        this.junction[i] = junctionKind(city, i);
        this.arms[i] = armsOf(city, i);
        // a planted median carries no traffic, so nothing ever drives on it
        if (t.traffic > 0 && drivable(t)) {
          this.busy.push(i);
          this.trafficSum += t.traffic;
          let r = false;
          let ci = false;
          let dR = false;
          let dC = false;
          let dI = false;
          const x = i % GRID;
          const y = (i / GRID) | 0;
          for (const [nx, ny] of neighbors4(x, y)) {
            const n = tiles[idx(nx, ny)];
            if (n.stage === 0 || n.abandoned) continue;
            if (n.zone === Zone.Residential) r = dR = true;
            else if (n.zone === Zone.Commercial) ci = dC = true;
            else if (n.zone === Zone.Industrial) ci = dI = true;
          }
          if (r) this.busyR.push(i);
          if (ci) this.busyCI.push(i);
          if (dR) this.destR.push(i);
          if (dC) this.destC.push(i);
          if (dI) this.destI.push(i);
        }
        continue;
      }
      this.junction[i] = 0;
      if ((t.zone === Zone.Residential || t.zone === Zone.Commercial) && t.stage > 0 && !t.abandoned) {
        this.lots.push(i);
        if (t.zone === Zone.Residential) {
          this.lotsR.push(i);
          this.stageR += t.stage;
        } else {
          this.lotsC.push(i);
          this.stageC += t.stage;
        }
      } else if (t.zone === Zone.Park) {
        this.parks.push(i);
      }
      if (t.burning > 0) {
        const road = this.roadBeside(city, i);
        if (road !== -1) this.fires.push({ road, tile: i });
      } else if (t.crimeFlash > 0) {
        const road = this.roadBeside(city, i);
        if (road !== -1) this.crimes.push(road);
      }
      if (t.powered) {
        const list =
          t.zone === Zone.FireStation ? this.fireStations
          : t.zone === Zone.PoliceStation ? this.policeStations
          : t.zone === Zone.Landfill || t.zone === Zone.Incinerator || t.zone === Zone.RecyclingCentre
            ? this.disposals
            : null;
        if (list) {
          const road = this.roadBeside(city, i);
          if (road !== -1) list.push(road);
        }
      }
    }
    for (const home of this.nextRound.keys()) if (!this.disposals.includes(home)) this.nextRound.delete(home);
    this.stopKerbs.clear();
    for (const line of city.transitLines) {
      if (line.mode === Zone.SubwayStation || line.path.length < 2) continue;
      for (const [sx, sy] of line.stops) {
        const stop = idx(sx, sy);
        if (this.stopKerbs.has(stop)) continue;
        const kerb = doorOf(city, stop);
        if (kerb) this.stopKerbs.set(stop, kerb);
      }
    }
  }

  /** The road tile a vehicle stops on for lot `i`: a plain street if there is one, else any drivable neighbour. */
  private roadBeside(city: CityState, i: number): number {
    const x = i % GRID;
    const y = (i / GRID) | 0;
    let any = -1;
    for (const [nx, ny] of neighbors4(x, y)) {
      const ni = idx(nx, ny);
      if (!drivable(city.tiles[ni])) continue;
      if (city.tiles[ni].road === 0) return ni;
      if (any === -1) any = ni;
    }
    return any;
  }

  // -------------------------------------------------------------------------
  // Cars
  // -------------------------------------------------------------------------

  private makeCar(city: CityState, path: number[], role: Role, kind: VehicleKind, style: BodyStyle, color: string): Car {
    const tile = path[0];
    const exit = path.length > 1 ? edgeToward(tile, path[1]) : (1 as Edge);
    const entry = opposite(exit);
    const laneOff = corridorAt(city, tile % GRID, (tile / GRID) | 0) ? 0 : LANE_OFF;
    const seg = segment(entry, exit, laneOff);
    return {
      tile, entry, exit, seg, s: Math.random() * 0.5,
      v: CLASS_SPEED[city.tiles[tile].road] * KIND_SPEED[kind] * 0.5, brake: false,
      path, at: 0, stops: [], dwellLeft: 0,
      kind, style, color, role,
      alpha: 0, fading: 1, waited: 0,
    };
  }

  /** Origins and destinations for the hour: to work in the morning, home in the evening. */
  private tripLists(now: number): [number[], number[]] {
    const ph = dayPhase(now);
    // nowhere in particular to go (roads but no lots): drive between busy tiles
    let all = this.destR.concat(this.destC, this.destI);
    if (all.length === 0) all = this.busy;
    if (ph >= 0.6 && ph < 0.95) {
      const dests = this.destC.concat(this.destI);
      return [this.busyR.length ? this.busyR : this.busy, dests.length ? dests : all];
    }
    if (ph >= 0.15 && ph < 0.4) {
      return [this.busyCI.length ? this.busyCI : this.busy, this.destR.length ? this.destR : all];
    }
    if (ph >= 0.4 && ph < 0.6) return [this.busy, all];
    return [this.busy, this.destC.length ? this.destC : all];
  }

  private spawnTrip(city: CityState, now: number): boolean {
    const [origins, dests] = this.tripLists(now);
    if (origins.length === 0 || dests.length === 0) return false;
    for (let attempt = 0; attempt < 3; attempt++) {
      const from = pick(origins);
      const dest = pick(dests);
      if (!drivable(city.tiles[from]) || dest === from) continue;
      const path = routeTo(city, from, dest);
      if (!path || path.length < 2) continue;
      const nz: Zone[] = [];
      const x = from % GRID;
      const y = (from / GRID) | 0;
      for (const [nx, ny] of neighbors4(x, y)) nz.push(city.tiles[idx(nx, ny)].zone);
      const kind = pickKind(vehicleWeights(nz), Math.random());
      const color =
        kind === 'taxi' ? TAXI_BODY
        : kind === 'bus' ? BUS_BODY
        : kind === 'van' ? pick(VAN_COLORS)
        : kind === 'truck' ? pick(TRUCK_COLORS)
        : pick(CAR_COLORS);
      this.cars.push(this.makeCar(city, path, 'trip', kind, pickBody(kind, Math.random()), color));
      return true;
    }
    return false;
  }

  /** A route through several legs, with a stop at the end of each but the last. */
  private roundTrip(city: CityState, legs: number[]): { path: number[]; stops: Stop[] } | null {
    const path: number[] = [];
    const stops: Stop[] = [];
    for (let k = 0; k + 1 < legs.length; k++) {
      const leg = routeTo(city, legs[k], legs[k + 1]);
      if (!leg) return null;
      if (path.length) leg.shift();
      path.push(...leg);
      if (k + 2 < legs.length) stops.push({ at: path.length - 1, dwell: 0 });
    }
    return path.length > 1 ? { path, stops } : null;
  }

  private dispatch(city: CityState): void {
    const count = (role: Role) => this.cars.reduce((n, c) => n + (c.role === role ? 1 : 0), 0);
    const nearest = (stations: number[], to: number) => {
      let best = stations[0];
      let bd = Infinity;
      const tx = to % GRID;
      const ty = (to / GRID) | 0;
      for (const s of stations) {
        const d = Math.abs((s % GRID) - tx) + Math.abs(((s / GRID) | 0) - ty);
        if (d < bd) {
          bd = d;
          best = s;
        }
      }
      return best;
    };
    if (this.fires.length && this.fireStations.length && count('fire') < 4 && this.clock - this.lastDispatch.fire > 3) {
      for (const target of this.fires) {
        if (this.cars.some((c) => c.role === 'fire' && c.stops[0]?.fireTile === target.tile)) continue;
        const home = nearest(this.fireStations, target.road);
        const trip = this.roundTrip(city, [home, target.road, home]);
        if (!trip) continue; // a fire on the station's own kerb: the next one gets the engine
        const car = this.makeCar(city, trip.path, 'fire', 'truck', 'fireEngine', FIRE_BODY);
        car.stops = [{ at: trip.stops[0].at, dwell: 40, fireTile: target.tile }];
        this.cars.push(car);
        this.lastDispatch.fire = this.clock;
        break;
      }
    }
    if (this.crimes.length && this.policeStations.length && count('police') < 3 && this.clock - this.lastDispatch.police > 4) {
      for (const target of this.crimes) {
        if (this.cars.some((c) => c.role === 'police' && c.path[c.stops[0]?.at ?? -1] === target)) continue;
        const home = nearest(this.policeStations, target);
        const trip = this.roundTrip(city, [home, target, home]);
        if (!trip) continue;
        const car = this.makeCar(city, trip.path, 'police', 'car', 'police', POLICE_BODY);
        car.stops = [{ at: trip.stops[0].at, dwell: 6 }];
        this.cars.push(car);
        this.lastDispatch.police = this.clock;
        break;
      }
    }
    const kerbs = this.destR.concat(this.destC);
    if (kerbs.length) {
      for (const home of this.disposals) {
        const due = this.nextRound.get(home) ?? this.clock + Math.random() * 25;
        if (this.clock < due) {
          this.nextRound.set(home, due);
          continue;
        }
        this.nextRound.set(home, this.clock + 25);
        if (this.cars.some((c) => c.role === 'garbage' && c.path[0] === home)) continue;
        const trip = this.roundTrip(city, [home, pick(kerbs), pick(kerbs), pick(kerbs), home]);
        if (!trip) continue;
        const car = this.makeCar(city, trip.path, 'garbage', 'truck', 'garbage', GARBAGE_BODY);
        car.stops = trip.stops.map((s) => ({ ...s, dwell: 1.5 }));
        this.cars.push(car);
      }
    }
  }

  /** The car ahead in this lane, and how far ahead, or null for open road. */
  private ahead(car: Car): { dist: number; v: number } | null {
    const lane = this.occ.get(car.tile * 4 + car.exit);
    if (lane) {
      for (const other of lane) {
        if (other !== car && other.s > car.s) {
          return { dist: (other.s - car.s) * car.seg.length, v: other.v };
        }
      }
    }
    const next = car.path[car.at + 1];
    if (next === undefined) return null;
    let best: { dist: number; v: number } | null = null;
    const want = opposite(car.exit);
    for (let e = 0; e < 4; e++) {
      const list = this.occ.get(next * 4 + e);
      if (!list) continue;
      for (const other of list) {
        if (other.entry !== want) continue;
        const dist = (1 - car.s) * car.seg.length + other.s * other.seg.length;
        if (!best || dist < best.dist) best = { dist, v: other.v };
        break; // sorted by s: the first with our entry is the nearest
      }
    }
    return best;
  }

  /** Must this car hold at the stop line before the next tile? */
  private mustWait(car: Car): boolean {
    const next = car.path[car.at + 1];
    if (next === undefined) return false;
    const kind = this.junction[next];
    if (kind === 0) return false;
    // already over the line: carry on through rather than stop in the box
    if (car.s > STOP_AT + 0.08) return false;
    if (kind === 4) {
      const axis: Phase = car.exit === 0 || car.exit === 2 ? 'ns' : 'ew';
      return signalPhase(next, this.clock) !== axis;
    }
    // a T: the stem gives way to the through road
    const stem = !(this.arms[next] & (1 << car.exit));
    if (!stem) return false;
    if (car.waited > MAX_WAIT) return false; // a long wait is let through rather than lock up
    for (let e = 0; e < 4; e++) {
      if (e === opposite(car.exit)) continue; // heading onto my tile: the other lane
      const list = this.occ.get(next * 4 + e);
      if (list && list.length) return true;
    }
    return false;
  }

  private stepCars(city: CityState, dt: number, now: number): void {
    // demolition check: a car whose road vanished — anywhere ahead of it — despawns
    this.cars = this.cars.filter((c) => {
      for (let k = c.at; k < c.path.length; k++) if (!drivable(city.tiles[c.path[k]])) return false;
      return true;
    });

    if (dt <= 0) return; // paused: nothing spawns, thins, dispatches or moves

    const target = targetCars(this.trafficSum, this.night, this.pandemic);
    let trips = 0;
    for (const c of this.cars) if (c.role === 'trip' && !c.pinned) trips++;
    let spawned = 0;
    while (trips < target && spawned < 4) {
      if (!this.spawnTrip(city, now)) break;
      trips++;
      spawned++;
    }
    if (trips > target) {
      // thin from the back: the newest trips go first
      for (let i = this.cars.length - 1; i >= 0 && trips > target; i--) {
        if (this.cars[i].role === 'trip' && !this.cars[i].pinned) {
          this.cars.splice(i, 1);
          trips--;
        }
      }
    }
    this.dispatch(city);

    // lane occupancy for the following rule
    this.occ.clear();
    for (const c of this.cars) {
      const key = c.tile * 4 + c.exit;
      let list = this.occ.get(key);
      if (!list) this.occ.set(key, (list = []));
      list.push(c);
    }
    for (const list of this.occ.values()) list.sort((a, b) => a.s - b.s);

    const gone: Car[] = [];
    for (const car of this.cars) {
      // fade in from the kerb, fade out into it
      if (car.fading === 1) {
        car.alpha = Math.min(1, car.alpha + dt / 0.3);
        if (car.alpha >= 1) car.fading = 0;
      } else if (car.fading === -1) {
        car.alpha -= dt / 0.4;
        if (car.alpha <= 0) gone.push(car);
        continue;
      }
      if (car.dwellLeft > 0) {
        car.dwellLeft -= dt;
        const stop = car.stops[0];
        if (stop?.fireTile !== undefined && city.tiles[stop.fireTile].burning === 0) car.dwellLeft = 0;
        if (car.dwellLeft <= 0) car.stops.shift();
        car.v = 0;
        car.brake = false;
        continue;
      }

      const len = car.seg.length;
      const vmax = CLASS_SPEED[city.tiles[car.tile].road] * KIND_SPEED[car.kind];
      let want = vmax;
      const lead = this.ahead(car);
      if (lead) want = lead.dist <= GAP ? 0 : Math.min(want, lead.v + (lead.dist - GAP) * 2);
      const stopLimit = (frac: number) => {
        const d = (frac - car.s) * len;
        return d <= 0 ? 0 : Math.sqrt(2 * BRAKE * d);
      };
      const last = car.at === car.path.length - 1;
      const halting = car.stops.length > 0 && car.stops[0].at === car.at;
      if (last || halting) want = Math.min(want, stopLimit(0.5));
      else if (this.mustWait(car)) {
        want = Math.min(want, stopLimit(STOP_AT));
        if (car.v < 0.05) car.waited += dt;
      }

      const v0 = car.v;
      const dv = want - car.v;
      car.v = Math.max(0, car.v + Math.max(-BRAKE * dt, Math.min(ACCEL * dt, dv)));
      car.brake = dt > 0 && (v0 - car.v) / dt > 0.5;
      car.s += (car.v * dt) / len;

      if ((last || halting) && car.s >= 0.5) {
        car.s = 0.5;
        car.v = 0;
        if (last) {
          car.fading = -1;
        } else {
          car.dwellLeft = Math.max(0.01, car.stops[0].dwell);
        }
        continue;
      }
      while (car.s >= 1) {
        const next = car.path[car.at + 1];
        if (next === undefined) {
          car.s = 1;
          car.fading = -1;
          break;
        }
        const over = (car.s - 1) * len;
        car.at++;
        car.waited = 0;
        car.tile = next;
        car.entry = opposite(car.exit);
        const after = car.path[car.at + 1];
        car.exit = after !== undefined ? edgeToward(next, after) : opposite(car.entry);
        const laneOff = corridorAt(city, next % GRID, (next / GRID) | 0) ? 0 : LANE_OFF;
        car.seg = segment(car.entry, car.exit, laneOff);
        car.s = over / car.seg.length;
      }
    }
    if (gone.length) this.cars = this.cars.filter((c) => !gone.includes(c));
  }

  // -------------------------------------------------------------------------
  // Pedestrians
  // -------------------------------------------------------------------------

  private stepPeds(city: CityState, dt: number, now: number): void {
    // the ground can change under anyone: a street bulldozed or built beside, a park rezoned
    this.peds = this.peds.filter((p) => {
      if (p.mode === 'park') return city.tiles[p.tile].zone === Zone.Park;
      const leg = p.leg!;
      if (!frontage(city.tiles[leg.on])) return false;
      return leg.kind !== 'foot' || hasKerb(city, leg.ctx.tile, leg.ctx.edge);
    });
    if (dt <= 0) return; // paused: nobody spawns or moves
    // a stop no line serves any more: its queue gives up
    for (const p of this.peds) {
      if (p.mode === 'wait' && !this.stopKerbs.has(p.stop!)) this.fadeOut(p);
    }

    const band = dayBand(dayPhase(now));
    const target = targetPeds(this.stageR, this.stageC, band, this.pandemic);
    const parkTarget = Math.min(Math.round(target * PARK_SHARE), this.parks.length * 2);
    const walkTarget = target - parkTarget;
    let walkers = 0;
    let parkers = 0;
    let waiters = 0;
    for (const p of this.peds) {
      if (p.mode === 'park') parkers++;
      else if (p.mode === 'wait' || p.mode === 'board') waiters++;
      else walkers++;
    }
    // when the view has moved on, recycle people nobody can see so the new
    // street fills in seconds rather than when the old crowd happens to go in
    // — but only while there is a door in view to step out of: over water or
    // forest the crowd would churn 240 people a second for nothing visible
    const anyInView = this.clip && (this.inView(this.lotsR) || this.inView(this.lotsC));
    if (anyInView && walkers >= walkTarget) {
      let seen = 0;
      for (const p of this.peds) if (p.mode !== 'park' && p.mode !== 'wait' && this.onScreen(p.tile)) seen++;
      if (seen < walkTarget * SEEN_SHARE) {
        let drop = 2; // two a frame: the new street fills over a second or two, not in a wave
        this.peds = this.peds.filter((p) => {
          if (drop <= 0 || p.mode === 'park' || p.mode === 'wait' || p.mode === 'board' || this.onScreen(p.tile)) return true;
          drop--;
          walkers--;
          return false;
        });
      }
    }
    for (let n = 0; n < 4 && walkers < walkTarget; n++) {
      if (!this.spawnWalker(city, band)) break;
      walkers++;
    }
    while (parkers < parkTarget) {
      this.peds.push(this.spawnParker());
      parkers++;
    }
    // too many for the hour: the newest fade out where they stand. A few over
    // is not too many: passengers alighting from a bus push the count over by
    // up to three, and thinning for that faded a fresh walker for every one
    // of them — ten people a second dying young.
    const slack = Math.max(3, Math.round(walkTarget * 0.05));
    if (walkers > walkTarget + slack) {
      let over = walkers - walkTarget;
      for (let i = this.peds.length - 1; i >= 0 && over > 0; i--) {
        const p = this.peds[i];
        if (p.mode !== 'walk') continue;
        this.fadeOut(p);
        over--;
      }
    }
    this.stepQueues(city, dt, waiters);
    if (parkers > parkTarget) {
      let over = parkers - parkTarget;
      this.peds = this.peds.filter((p) => !(p.mode === 'park' && over-- > 0));
    }

    const gone: Ped[] = [];
    for (const p of this.peds) {
      if (p.mode === 'park') {
        this.stepParker(p, dt);
        continue;
      }
      const leg = p.leg!;
      const step = p.pace * dt;
      p.dist += step;
      let s = p.s + (leg.len > 1e-6 ? step / leg.len : 1);
      if (p.mode === 'exit') {
        p.alpha = Math.min(1, s);
        if (s >= 1) {
          const dir = Math.random() < 0.5 ? 1 : -1;
          p.leg = footLeg(city, leg.ctx.tile, leg.ctx.edge, dir, leg.p1);
          p.s = 0;
          p.mode = 'walk';
          p.tile = p.leg.on;
        } else {
          p.s = s;
        }
        continue;
      }
      if (p.mode === 'enter' || p.mode === 'board') {
        p.alpha = Math.max(0, 1 - s);
        if (s >= 1) gone.push(p);
        else p.s = s;
        continue;
      }
      if (p.mode === 'wait') {
        p.dist -= step; // standing still: no gait
        p.alpha = Math.min(1, p.alpha + dt / 0.4);
        continue;
      }
      if (leg.kind === 'foot') {
        const door = this.doorAhead(city, leg, p.s, s);
        if (door && Math.random() < (p.dist < 1.5 ? 0 : p.dist < 8 ? 0.08 : 0.6)) {
          p.leg = door;
          p.s = 0;
          p.mode = 'enter';
          p.tile = door.on;
          continue;
        }
      }
      let guard = 0;
      while (s >= 1 && guard++ < 4) {
        const cur = p.leg!;
        const rem = (s - 1) * cur.len;
        const next = weightedPick(successors(city, cur));
        p.leg = next;
        p.tile = next.on;
        s = next.len > 1e-6 ? rem / next.len : 1;
      }
      p.s = Math.min(s, 1);
    }
    if (gone.length) this.peds = this.peds.filter((p) => !gone.includes(p));
  }

  private onScreen(tile: number): boolean {
    const c = this.clip!;
    const x = tile % GRID;
    const y = (tile / GRID) | 0;
    return x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1;
  }

  /** The lots inside the view, if that is a real subset of the city. */
  private inView(lots: number[]): number[] | null {
    const c = this.clip;
    if (!c) return null;
    const out: number[] = [];
    for (const i of lots) {
      const x = i % GRID;
      const y = (i / GRID) | 0;
      if (x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1) out.push(i);
    }
    return out.length && out.length < lots.length ? out : null;
  }

  /** A person at a lot's door, about to step out onto the kerb. */
  private spawnWalker(city: CityState, band: DayBand): boolean {
    const [r, c] = PED_DENSITY[band];
    const wR = this.stageR * r;
    const wC = this.stageC * c;
    if (wR + wC <= 0) return false;
    let list = Math.random() * (wR + wC) < wR ? this.lotsR : this.lotsC;
    if (!list.length) list = list === this.lotsR ? this.lotsC : this.lotsR;
    if (Math.random() < SPAWN_IN_VIEW) list = this.inView(list) ?? list;
    for (let tries = 0; tries < 3 && list.length; tries++) {
      const door = doorOf(city, pick(list));
      if (!door) continue;
      const o = EDGE_DIR[door.edge];
      const inside: Pt = [door.at[0] + o[0] * (FOOT_IN + 0.05), door.at[1] + o[1] * (FOOT_IN + 0.05)];
      const leg: Leg = {
        kind: 'door', on: door.tile, p0: inside, p1: door.at, len: FOOT_IN + 0.05,
        ctx: { tile: door.tile, edge: door.edge, dir: 1 },
      };
      this.peds.push({
        mode: 'exit', palette: (Math.random() * PALETTES.length) | 0,
        pace: PACE_MIN + Math.random() * (PACE_MAX - PACE_MIN), dist: 0, alpha: 0,
        tile: door.tile, leg, s: 0, du: 0, dv: 0, vu: 0, vv: 0, ttl: 0,
      });
      return true;
    }
    return false;
  }

  /**
   * The door this foot leg passes between s0 and s1, if the lot across the
   * kerb is lived in and faces this way: a leg from the kerb to the threshold.
   */
  private doorAhead(city: CityState, leg: Leg, s0: number, s1: number): Leg | null {
    const { tile, edge } = leg.ctx;
    const m = midpointOf(tile, edge);
    const dx = leg.p1[0] - leg.p0[0];
    const dy = leg.p1[1] - leg.p0[1];
    const l2 = dx * dx + dy * dy;
    if (l2 < 1e-9) return null;
    const t = ((m[0] - leg.p0[0]) * dx + (m[1] - leg.p0[1]) * dy) / l2;
    if (!(s0 < t && t <= s1)) return null;
    const o = EDGE_DIR[edge];
    const lx = (tile % GRID) + o[0];
    const ly = ((tile / GRID) | 0) + o[1];
    if (!inBounds(lx, ly)) return null;
    const lot = idx(lx, ly);
    const lt = city.tiles[lot];
    if (!((lt.zone === Zone.Residential || lt.zone === Zone.Commercial) && lt.stage > 0 && !lt.abandoned)) return null;
    const door = doorOf(city, lot);
    if (!door || door.tile !== tile || door.edge !== edge) return null;
    const p1: Pt = [m[0] + o[0] * (FOOT_IN + 0.05), m[1] + o[1] * (FOOT_IN + 0.05)];
    return { kind: 'door', on: tile, p0: m, p1, len: FOOT_IN + 0.05, ctx: leg.ctx };
  }

  /** Fade a walker out where they stand, over a tenth of their leg. */
  private fadeOut(p: Ped): void {
    const l = p.leg!;
    const at: Pt = [l.p0[0] + (l.p1[0] - l.p0[0]) * p.s, l.p0[1] + (l.p1[1] - l.p0[1]) * p.s];
    const dx = (l.p1[0] - l.p0[0]) * 0.1;
    const dy = (l.p1[1] - l.p0[1]) * 0.1;
    p.leg = { kind: 'door', on: l.on, p0: at, p1: [at[0] + dx, at[1] + dy], len: Math.max(Math.hypot(dx, dy), 0.05), ctx: l.ctx };
    p.s = 0;
    p.mode = 'enter';
  }

  /** A person appearing at a kerb point and setting off along it. */
  private spawnAtKerb(kerb: { tile: number; edge: Edge; at: Pt }, from: Pt, mode: PedMode, stop?: number): Ped {
    const o = EDGE_DIR[kerb.edge];
    const len = Math.hypot(kerb.at[0] - from[0], kerb.at[1] - from[1]);
    const leg: Leg = {
      kind: 'door', on: kerb.tile, p0: from, p1: len > 1e-6 ? kerb.at : [kerb.at[0] - o[0] * 0.001, kerb.at[1] - o[1] * 0.001],
      len: Math.max(len, 0.001), ctx: { tile: kerb.tile, edge: kerb.edge, dir: 1 },
    };
    const p: Ped = {
      mode, palette: (Math.random() * PALETTES.length) | 0,
      pace: PACE_MIN + Math.random() * (PACE_MAX - PACE_MIN), dist: 0, alpha: 0,
      tile: kerb.tile, leg, s: 0, du: 0, dv: 0, vu: 0, vv: 0, ttl: 0, stop,
    };
    this.peds.push(p);
    return p;
  }

  /** Queues at the stops: people arrive, board when a vehicle dwells, and others alight. */
  private stepQueues(city: CityState, dt: number, waiting: number): void {
    if (!this.stopKerbs.size) return;
    const counts = new Map<number, number>();
    for (const p of this.peds) if (p.mode === 'wait') counts.set(p.stop!, (counts.get(p.stop!) ?? 0) + 1);
    for (const [stop, kerb] of this.stopKerbs) {
      const n = counts.get(stop) ?? 0;
      if (n >= QUEUE_AT_STOP || waiting >= QUEUE_MAX || Math.random() >= dt / QUEUE_EVERY) continue;
      // stand in a row along the kerb, facing the road
      const at = kerbPoint(kerb.tile, kerb.edge, 0.5 + (n - 1.5) * 0.12);
      const p = this.spawnAtKerb({ ...kerb, at }, at, 'wait', stop);
      p.alpha = 0;
      waiting++;
    }
    const served = servedNow(city, this.lineSec);
    for (const stop of served) {
      if (this.servedPrev.has(stop)) continue;
      const kerb = this.stopKerbs.get(stop);
      if (!kerb) continue;
      const o = EDGE_DIR[kerb.edge];
      // the queue boards: a few steps toward the door, then gone
      for (const p of this.peds) {
        if (p.mode !== 'wait' || p.stop !== stop) continue;
        const l = p.leg!;
        p.leg = { kind: 'door', on: l.on, p0: l.p0, p1: [l.p0[0] - o[0] * 0.25, l.p0[1] - o[1] * 0.25], len: 0.25, ctx: l.ctx };
        p.s = 0;
        p.mode = 'board';
      }
      // and some alight and walk off
      const off = (Math.random() * 4) | 0;
      for (let k = 0; k < off; k++) {
        // step down clear of the queue, which stands between 0.32 and 0.68
        const at = kerbPoint(kerb.tile, kerb.edge, k % 2 ? 0.2 : 0.8);
        const from: Pt = [at[0] - o[0] * 0.2, at[1] - o[1] * 0.2];
        const p = this.spawnAtKerb({ ...kerb, at }, from, 'exit');
        p.dist = 2; // free to go indoors soon
      }
    }
    this.servedPrev = served;
  }

  /** Someone on a loop round a park, inside the lot's ring of paths. */
  private spawnParker(): Ped {
    const a = Math.random() * Math.PI * 2;
    const r = 0.3 + Math.random() * 0.14;
    const p: Ped = {
      mode: 'park', palette: (Math.random() * PALETTES.length) | 0,
      pace: PACE_MIN + Math.random() * (PACE_MAX - PACE_MIN) * 0.6, dist: 0, alpha: 1,
      tile: pick(this.parks), leg: null, s: 0,
      du: Math.cos(a) * r, dv: Math.sin(a) * r, vu: 0, vv: 0, ttl: 0,
    };
    this.aimParker(p);
    return p;
  }

  private aimParker(p: Ped): void {
    const a = Math.random() * Math.PI * 2;
    p.vu = Math.cos(a) * p.pace;
    p.vv = Math.sin(a) * p.pace;
    p.ttl = 3 + Math.random() * 5;
  }

  private stepParker(p: Ped, dt: number): void {
    p.ttl -= dt;
    if (p.ttl <= 0) this.aimParker(p);
    p.du += p.vu * dt;
    p.dv += p.vv * dt;
    p.dist += p.pace * dt;
    // stay on the ring of paths: outside the lawn, inside the lot
    const d = Math.max(Math.abs(p.du), Math.abs(p.dv));
    if (d > 0.46 || d < 0.27) {
      p.vu = -p.vu;
      p.vv = -p.vv;
      p.du = Math.max(-0.46, Math.min(0.46, p.du));
      p.dv = Math.max(-0.46, Math.min(0.46, p.dv));
    }
  }

  // -------------------------------------------------------------------------
  // Drawing
  // -------------------------------------------------------------------------

  private bucket(): void {
    this.carBuckets.clear();
    this.pedBuckets.clear();
    for (const car of this.cars) {
      // draw with whichever of this tile and the next paints later (greater
      // depth under the current view angle) so the neighbouring ground never
      // overdraws the car as it crosses the edge
      const next = car.path[car.at + 1] ?? car.tile;
      const fx = car.tile % GRID;
      const fy = (car.tile / GRID) | 0;
      const tx = next % GRID;
      const ty = (next / GRID) | 0;
      const tile = tileDepth(fx, fy) >= tileDepth(tx, ty) ? car.tile : next;
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
    const night = this.night;
    const { quarter, cosA, sinA } = this;
    const blink = (this.clock / 0.8) % 1;

    // a signal post is a few pixels tall: below this zoom it is a speck
    if (this.junction[i] === 4 && this.zoom >= 1.4) this.drawSignals(ctx, i);

    const cars = this.carBuckets.get(i);
    if (cars) {
      for (const car of cars) {
        const [lx, ly] = pointAt(car.seg, car.s);
        const x = car.tile % GRID;
        const y = (car.tile / GRID) | 0;
        const p = isoToScreen(x + lx, y + ly);
        if (elevs) p.sy -= elevs[car.tile].elevation * ELEV_PX;
        const heading = headingAt(car.seg, car.s);
        const faded = car.alpha < 1;
        if (faded) {
          ctx.save();
          ctx.globalAlpha *= Math.max(0, car.alpha);
        }
        blit(ctx, vehicleSprite(car.style, car.color, heading, quarter), p.sx, p.sy);
        let indicator = isTurn(car.entry, car.exit);
        if (indicator === 0 && car.s > 0.5) {
          const after = car.path[car.at + 2];
          const next = car.path[car.at + 1];
          if (next !== undefined && after !== undefined) {
            indicator = isTurn(opposite(car.exit), edgeToward(next, after));
          }
        }
        const emergency =
          (car.role === 'fire' || car.role === 'police') && car.stops.length > 0;
        if (night > 0.25 || car.brake || indicator !== 0 || emergency) {
          ctx.save();
          ctx.translate(p.sx, p.sy);
          paintLights(ctx, car.style, heading, cosA, sinA, {
            night, brake: car.brake, indicator, blink, emergency,
          });
          ctx.restore();
        }
        if (faded) ctx.restore();
      }
    }

    const peds = this.pedBuckets.get(i);
    if (peds) {
      const x = i % GRID;
      const y = (i / GRID) | 0;
      const elev = elevs ? elevs[i].elevation * ELEV_PX : 0;
      const costume = { umbrella: this.rain, mask: this.pandemic };
      for (const p of peds) {
        let wx: number;
        let wy: number;
        let heading: number;
        if (p.mode === 'park') {
          wx = x + 0.5 + p.du;
          wy = y + 0.5 + p.dv;
          heading = Math.atan2(p.vv, p.vu);
        } else {
          const l = p.leg!;
          wx = l.p0[0] + (l.p1[0] - l.p0[0]) * p.s;
          wy = l.p0[1] + (l.p1[1] - l.p0[1]) * p.s;
          heading = Math.atan2(l.p1[1] - l.p0[1], l.p1[0] - l.p0[0]);
        }
        const sp = isoToScreen(wx, wy);
        // the gait is invisible below this zoom: hold the pose and spare the bakes
        const frame = this.zoom >= 1.5 && (p.mode === 'walk' || p.mode === 'park' || p.mode === 'board') ? frameFor(p.dist) : 0;
        blit(ctx, figureSprite(p.palette, frame, heading, quarter, costume), sp.sx, sp.sy - elev, p.alpha);
      }
    }
  }

  /** A signal post at the kerb of each approach, its lamp in the live colour. */
  private drawSignals(ctx: CanvasRenderingContext2D, i: number): void {
    const phase = signalPhase(i, this.clock);
    const x = i % GRID;
    const y = (i / GRID) | 0;
    const elev = elevs ? elevs[i].elevation * ELEV_PX : 0;
    for (let k = 0; k < 4; k++) {
      if (!(this.arms[i] & (1 << k))) continue;
      // the post stands on the right-hand kerb of the car arriving across edge k
      const d = EDGE_DIR[opposite(k as Edge)];
      const r = [-d[1], d[0]];
      const px = x + EDGE_MID[k][0] + r[0] * 0.42 - d[0] * 0.04;
      const py = y + EDGE_MID[k][1] + r[1] * 0.42 - d[1] * 0.04;
      const p = isoToScreen(px, py);
      p.sy -= elev;
      const green = phase === (k === 0 || k === 2 ? 'ns' : 'ew');
      ctx.fillStyle = '#2a2c30';
      ctx.fillRect(p.sx - 0.5, p.sy - 6, 1, 6);
      ctx.fillStyle = '#3a3c40';
      ctx.fillRect(p.sx - 1.1, p.sy - 8.4, 2.2, 3);
      ctx.fillStyle = green ? '#4ee07a' : '#ff4a3c';
      ctx.fillRect(p.sx - 0.7, p.sy - (green ? 6.6 : 8.0), 1.4, 1.2);
    }
  }
}
