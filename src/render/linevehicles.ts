/** Transit vehicles shuttling a line's path. Position math is pure and
 * tested; drawing is a handful of tinted rects per mode. */

import { idx } from '../sim/grid';
import { CityState, Zone } from '../sim/types';
import type { TransitLine } from '../sim/transitlines';
import { TileGeom, tileGeom } from './iso';

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

/** Draw one line's vehicles at time `tSec` (already sim-speed scaled). */
export function drawLineVehicles(
  ctx: CanvasRenderingContext2D,
  city: CityState,
  line: TransitLine,
  tSec: number,
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
  const cycle = 2 * (line.path.length - 1);
  const n = vehicleCount(line.path.length);
  for (let k = 0; k < n; k++) {
    const prog = vehicleProgress(line.path.length, tSec, speed, (k * cycle) / n);
    const a = centerAt(city, line.path[prog.seg]);
    const b = centerAt(city, line.path[prog.seg + 1]);
    const x = a.cx + (b.cx - a.cx) * prog.frac;
    const y = a.cy + (b.cy - a.cy) * prog.frac;
    const lift = line.mode === Zone.MonorailStation ? 14 : 2;
    drawSprite(ctx, line, x, y - lift);
  }
}

function drawSprite(ctx: CanvasRenderingContext2D, line: TransitLine, x: number, y: number) {
  switch (line.mode) {
    case Zone.StreetcarStop:
      ctx.fillStyle = line.color;
      ctx.fillRect(x - 7, y - 5, 14, 5);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillRect(x - 5, y - 4, 10, 1.5);
      ctx.strokeStyle = '#cfd6d4';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y - 5);
      ctx.lineTo(x + 3, y - 10);
      ctx.stroke();
      break;
    case Zone.MonorailStation:
      ctx.fillStyle = '#eef1f3';
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(x - 8, y - 5, 16, 6, 3);
        ctx.fill();
      } else {
        ctx.fillRect(x - 8, y - 5, 16, 6);
      }
      ctx.fillStyle = line.color;
      ctx.fillRect(x - 6, y - 2, 12, 1.6);
      break;
    case Zone.RailTerminal:
      ctx.fillStyle = '#2c3036';
      ctx.fillRect(x - 9, y - 5, 8, 5);
      ctx.fillStyle = line.color;
      ctx.fillRect(x + 0.5, y - 5, 8, 5);
      ctx.fillStyle = '#ffd76a';
      ctx.fillRect(x - 8.5, y - 4, 1.5, 1.5);
      break;
    default: // bus
      ctx.fillStyle = '#2fa38f';
      ctx.fillRect(x - 6, y - 5, 12, 5);
      ctx.fillStyle = '#e8edf0';
      ctx.fillRect(x - 6, y - 6, 12, 1.5);
      break;
  }
}
