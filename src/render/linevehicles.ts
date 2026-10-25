/** Transit vehicles shuttling a line's path. Position math is pure and
 * tested; drawing is a handful of tinted rects per mode. */

import { idx } from '../sim/grid';
import { CityState, Zone } from '../sim/types';
import type { TransitLine } from '../sim/transitlines';
import { TileGeom, tileGeom } from './iso';
import { blit } from './spritecache';
import { vehicleSprite, type BodyStyle } from './vehiclemodel';

export interface Progress {
  /** Index of the path segment the vehicle is on (0 .. pathLen−2). */
  seg: number;
  /** Fraction along that segment, 0..1. */
  frac: number;
  /** +1 outbound, −1 returning — flips the sprite. */
  dir: 1 | -1;
}

/** Ping-pong along a path of `pathLen` tiles at `speed` tiles/sec. */
export function vehicleProgress(
  pathLen: number,
  tSec: number,
  speed: number,
  offset: number,
): Progress {
  const steps = pathLen - 1;
  const cycle = 2 * steps;
  const s = (((tSec * speed + offset) % cycle) + cycle) % cycle;
  if (s <= steps) {
    const seg = Math.min(steps - 1, Math.floor(s));
    return { seg, frac: s - seg, dir: 1 };
  }
  const back = cycle - s; // distance from the origin, walking home
  const seg = Math.min(steps - 1, Math.floor(back));
  return { seg, frac: back - seg, dir: -1 };
}

/** Seconds a vehicle holds at each stop. */
export const DWELL = 1.6;
/** Tiles between the cars of a train. */
export const CAR_GAP = 0.55;

export interface DwellProgress extends Progress {
  /** Distance from the path's origin, in tiles (0 .. pathLen−1). */
  dist: number;
  dwelling: boolean;
  /** Path index of the stop being served, or −1. */
  at: number;
}

/**
 * Distance along the path after `s` distance-units of a half cycle, with a
 * hold of `hold` units at each of `stops` (ascending distances from the
 * start of this half). Returns the distance and the stop held at, if any.
 */
function walkHalf(s: number, stops: number[], hold: number, steps: number): [number, number] {
  let cur = 0;
  let rem = s;
  for (const st of stops) {
    if (rem <= st - cur) return [cur + rem, -1];
    rem -= st - cur;
    cur = st;
    if (rem <= hold) return [cur, st];
    rem -= hold;
  }
  return [Math.min(steps, cur + rem), -1];
}

/**
 * `vehicleProgress` with a dwell: the vehicle holds `dwell` seconds at each
 * stop index on the way out and again on the way back, so a line's cycle
 * grows by 2 × stops × dwell seconds.
 */
export function vehicleProgressWithDwell(
  pathLen: number,
  stopIdx: number[],
  tSec: number,
  speed: number,
  offset: number,
  dwell = DWELL,
): DwellProgress {
  const steps = pathLen - 1;
  const hold = dwell * speed; // dwell in distance units, so one clock serves both
  const out = [...new Set(stopIdx)].filter((i) => i >= 0 && i <= steps).sort((p, q) => p - q);
  const half = steps + out.length * hold;
  const cycle = 2 * half;
  const s = (((tSec * speed + offset) % cycle) + cycle) % cycle;
  let dist: number;
  let at: number;
  let dir: 1 | -1;
  if (s <= half) {
    [dist, at] = walkHalf(s, out, hold, steps);
    dir = 1;
  } else {
    const back = out.map((i) => steps - i).reverse();
    const [fromEnd, atBack] = walkHalf(s - half, back, hold, steps);
    dist = steps - fromEnd;
    at = atBack < 0 ? -1 : steps - atBack;
    dir = -1;
  }
  const seg = Math.min(steps - 1, Math.max(0, Math.floor(dist)));
  return { seg, frac: dist - seg, dir, dist, dwelling: at >= 0, at };
}

/** Path indices of a line's stops: the path tile each stop sits on or beside. */
export function stopIndices(line: TransitLine): number[] {
  const out: number[] = [];
  for (const [sx, sy] of line.stops) {
    let best = -1;
    for (let i = 0; i < line.path.length; i++) {
      const [px, py] = line.path[i];
      const d = Math.abs(px - sx) + Math.abs(py - sy);
      if (d === 0) {
        best = i;
        break;
      }
      if (d === 1 && best < 0) best = i;
    }
    if (best >= 0 && !out.includes(best)) out.push(best);
  }
  return out;
}

/** Distances along the path of a train's cars, the lead car first. */
export function trainCars(dist: number, dir: 1 | -1, steps: number, cars = 3): number[] {
  // the lead car stops short of the near terminus so the train stays a train
  const room = CAR_GAP * (cars - 1);
  const lead = dir === 1 ? Math.max(dist, Math.min(room, steps)) : Math.min(dist, Math.max(steps - room, 0));
  const out: number[] = [];
  for (let k = 0; k < cars; k++) out.push(Math.max(0, Math.min(steps, lead - dir * CAR_GAP * k)));
  return out;
}

/** Seconds (× speed) one full out-and-back takes, dwells included. */
export function lineCycle(pathLen: number, idxs: number[], speed: number): number {
  return 2 * (pathLen - 1 + idxs.length * DWELL * speed);
}

/** The stop tiles a vehicle is dwelling at this instant, across every line. */
export function servedNow(city: CityState, tSec: number): Set<number> {
  const served = new Set<number>();
  for (const line of city.transitLines) {
    if (line.path.length < 2 || line.mode === Zone.SubwayStation) continue;
    const idxs = stopIndices(line);
    if (!idxs.length) continue;
    const speed = SPEED[line.mode] ?? 1.6;
    const n = vehicleCount(line.path.length);
    const cycle = lineCycle(line.path.length, idxs, speed);
    for (let k = 0; k < n; k++) {
      const p = vehicleProgressWithDwell(line.path.length, idxs, tSec, speed, (k * cycle) / n);
      if (!p.dwelling) continue;
      for (let j = 0; j < line.stops.length; j++) {
        if (idxs[j] === p.at) served.add(idx(line.stops[j][0], line.stops[j][1]));
      }
    }
  }
  return served;
}

/** Vehicles a line runs: one per ~10 path tiles, capped at 3. */
export function vehicleCount(pathLen: number): number {
  return Math.max(1, Math.min(3, Math.floor(pathLen / 10)));
}

const SPEED: Partial<Record<Zone, number>> = {
  [Zone.BusStop]: 1.6,
  [Zone.StreetcarStop]: 2.0,
  [Zone.MonorailStation]: 3.0,
  [Zone.RailTerminal]: 3.5,
};

function centerAt(city: CityState, p: [number, number]): TileGeom {
  return tileGeom(p[0], p[1], city.tiles[idx(p[0], p[1])].elevation);
}

const STYLE: Partial<Record<Zone, BodyStyle>> = {
  [Zone.BusStop]: 'bus',
  [Zone.StreetcarStop]: 'streetcar',
  [Zone.MonorailStation]: 'monorail',
  [Zone.RailTerminal]: 'railcar',
};

/** Screen point and grid heading `dist` tiles along the path, facing `dir`. */
function alongPath(city: CityState, path: [number, number][], dist: number, dir: 1 | -1) {
  const steps = path.length - 1;
  const seg = Math.min(steps - 1, Math.max(0, Math.floor(dist)));
  const frac = dist - seg;
  const a = centerAt(city, path[seg]);
  const b = centerAt(city, path[seg + 1]);
  const dx = path[seg + 1][0] - path[seg][0];
  const dy = path[seg + 1][1] - path[seg][1];
  return {
    x: a.cx + (b.cx - a.cx) * frac,
    y: a.cy + (b.cy - a.cy) * frac,
    heading: Math.atan2(dy * dir, dx * dir),
  };
}

/** Draw one line's vehicles at time `tSec` (already sim-speed scaled). */
export function drawLineVehicles(
  ctx: CanvasRenderingContext2D,
  city: CityState,
  line: TransitLine,
  tSec: number,
  quarter: 0 | 1 | 2 | 3 = 0,
) {
  if (line.path.length < 2) return;
  if (line.mode === Zone.SubwayStation) {
    // underground: the stops pulse softly in the line's color instead
    const pulse = 0.1 + 0.15 * (0.5 + 0.5 * Math.sin(tSec * 2));
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.fillStyle = line.color;
    for (const s of line.stops) {
      const g = centerAt(city, s);
      ctx.beginPath();
      ctx.arc(g.cx, g.cy, 9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }
  const speed = SPEED[line.mode] ?? 1.6;
  const idxs = stopIndices(line);
  const steps = line.path.length - 1;
  const cycle = lineCycle(line.path.length, idxs, speed);
  const n = vehicleCount(line.path.length);
  const style = STYLE[line.mode] ?? 'bus';
  const lift = line.mode === Zone.MonorailStation ? 14 : 0;
  for (let k = 0; k < n; k++) {
    const prog = vehicleProgressWithDwell(line.path.length, idxs, tSec, speed, (k * cycle) / n);
    const cars = line.mode === Zone.RailTerminal ? trainCars(prog.dist, prog.dir, steps) : [prog.dist];
    // the trailing cars first, so the lead car paints over them when they overlap
    for (let c = cars.length - 1; c >= 0; c--) {
      const p = alongPath(city, line.path, cars[c], prog.dir);
      blit(ctx, vehicleSprite(style, line.color, p.heading, quarter), p.x, p.y - lift);
    }
  }
}
