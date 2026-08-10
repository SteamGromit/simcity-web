/**
 * Ambient motion: chimney smoke, cooling-tower steam, winter hearth wisps,
 * tower beacons, flags and fountains. Everything is a pure function of the
 * ambient clock — no particle state — drawn in the standing pass right after
 * each building's baked blit, so a tower in front correctly occludes a plume
 * behind it. Emitter positions come from the same geometry the bake used
 * (stackTips / hearthTip), so smoke rises from exactly where the stack was
 * painted at every camera quarter.
 */

import { Stage, Tier, Zone } from '../sim/types';
import {
  StackTip, hearthTip, massHeight, quadOf, stackTips, variantBucket,
} from './buildings';
import { TileGeom } from './iso';
import { halfExtent } from './massing';
import { hash2 } from './noise';

export interface AmbientEnv {
  /** ms; sim-speed-scaled with a slow paused drift (renderer owns it). */
  clock: number;
  /** Hurricane lean, ≈ -5..0 screen px; 0 in calm air. */
  wind: number;
  night: number;
  detail: 0 | 1 | 2;
  winter: boolean;
}

const PLUME: Record<StackTip['kind'], {
  tint: string; rise: number; period: number; puffs: number; r0: number; r1: number; alpha: number;
}> = {
  smoke:  { tint: '82, 74, 66',    rise: 46, period: 5200, puffs: 5, r0: 2.2, r1: 8.5, alpha: 0.34 },
  steam:  { tint: '244, 246, 248', rise: 54, period: 6800, puffs: 5, r0: 3.4, r1: 12,  alpha: 0.4 },
  hearth: { tint: '208, 205, 200', rise: 26, period: 7000, puffs: 3, r0: 1.1, r1: 3.6, alpha: 0.26 },
};

export function drawPlume(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  tip: StackTip,
  pollution: number,
  env: AmbientEnv,
): void {
  const spec = PLUME[tip.kind];
  const puffs = env.detail === 0 ? 2 : spec.puffs;
  const alpha =
    spec.alpha *
    (tip.kind === 'smoke' ? 0.55 + pollution * 0.45 : 1) *
    (1 - env.night * 0.45);
  if (alpha <= 0.02) return;
  const seed = Math.abs(Math.round(tip.x * 7 + tip.y * 13));
  const lean = 3 + env.wind * 8; // slight ambient drift; lies down in a storm
  for (let k = 0; k < puffs; k++) {
    const p = (env.clock / spec.period + k / puffs + hash2(k, 1, seed) * 0.13) % 1;
    const wob = Math.sin(env.clock / 900 + k * 2.1 + seed) * 1.6;
    const px = cx + tip.x + wob * p + lean * p;
    const py = cy + tip.y - p * spec.rise * tip.s;
    const r = (spec.r0 + p * (spec.r1 - spec.r0)) * tip.s;
    ctx.fillStyle = `rgba(${spec.tint}, ${((1 - p) * alpha).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Red anti-collision blink at a tower crown; phase keeps a skyline unsynced. */
export function drawBeacon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  h: number,
  phase: number,
  env: AmbientEnv,
): void {
  const on = (env.clock / 1400 + phase) % 1 < 0.12;
  if (!on) return;
  const y = cy - h - 6;
  const a = 0.45 + env.night * 0.55;
  ctx.fillStyle = `rgba(255, 64, 48, ${a.toFixed(3)})`;
  ctx.fillRect(cx - 1, y - 1, 2, 2);
  if (env.night > 0.1) {
    ctx.fillStyle = `rgba(255, 64, 48, ${(0.18 * env.night).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(cx, y, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A pole and a three-frame rippling flag. (x, y) is the pole base. */
export function drawFlag(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  poleH: number,
  hue: number,
  env: AmbientEnv,
): void {
  const wave = Math.floor(env.clock / 260) % 3 - 1; // -1, 0, 1
  ctx.strokeStyle = 'rgba(226, 230, 236, 0.9)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - poleH);
  ctx.stroke();
  const top = y - poleH;
  ctx.fillStyle = `hsl(${hue} 58% 52%)`;
  ctx.beginPath();
  ctx.moveTo(x, top);
  ctx.quadraticCurveTo(x + 4, top - 0.5 + wave, x + 8, top + 0.5 + wave * 1.4);
  ctx.lineTo(x + 8, top + 3.5 + wave * 1.4);
  ctx.quadraticCurveTo(x + 4, top + 3 + wave, x, top + 4);
  ctx.closePath();
  ctx.fill();
}

/** A small basin with looping jets, for park tiles at close zoom. */
export function drawFountain(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  env: AmbientEnv,
): void {
  ctx.fillStyle = 'rgba(174, 186, 196, 0.9)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, 6, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(96, 160, 208, 0.85)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, 4.6, 2.2, 0, 0, Math.PI * 2);
  ctx.fill();
  for (let k = 0; k < 5; k++) {
    const p = (env.clock / 1100 + k / 5) % 1;
    const dx = (k - 2) * 1.4 * p;
    const py = cy - 7 * Math.sin(Math.PI * p);
    ctx.fillStyle = `rgba(226, 242, 252, ${((1 - p) * 0.8).toFixed(3)})`;
    ctx.fillRect(cx + dx - 0.5, py - 0.7, 1, 1.4);
  }
}

/** Flag anchors per zone: pole base offset from the draw centre (dy from
 * ground at centre height h means y = cy + dy). School's static flag is
 * removed from drawCivic in favor of this. */
const FLAGS: Partial<Record<Zone, { dx: number; dyFromRoof: number; poleH: number; hue: number }>> = {
  [Zone.School]: { dx: -16, dyFromRoof: 2, poleH: 18, hue: 8 },
  [Zone.Ballpark]: { dx: 0, dyFromRoof: 0, poleH: 16, hue: 214 },
  [Zone.Arena]: { dx: 0, dyFromRoof: 0, poleH: 16, hue: 262 },
  [Zone.Stadium]: { dx: 0, dyFromRoof: 0, poleH: 18, hue: 148 },
  [Zone.Colosseum]: { dx: 0, dyFromRoof: 0, poleH: 18, hue: 40 },
};

export function drawAmbient(
  ctx: CanvasRenderingContext2D,
  geom: TileGeom,
  zone: Zone,
  stage: Stage,
  tier: Tier,
  variant: number,
  size: number,
  powered: boolean,
  abandoned: boolean,
  pollution: number,
  env: AmbientEnv,
): void {
  if (abandoned || !powered) return;
  const bucket = variantBucket(variant);
  const { cx, cy } = geom;

  for (const tip of stackTips(zone, stage, tier, bucket, size)) {
    drawPlume(ctx, cx, cy, tip, pollution, env);
  }
  if (env.detail === 0) return; // far zoom: industry/civic plumes only

  if (env.winter) {
    const hearth = hearthTip(zone, stage, tier, bucket);
    if (hearth) drawPlume(ctx, cx, cy, hearth, 0, env);
  }
  if (
    (zone === Zone.Residential || zone === Zone.Commercial) &&
    stage >= 6 &&
    hash2(bucket, 7, 131) > 0.5
  ) {
    drawBeacon(ctx, cx, cy, massHeight(zone, stage, tier, bucket), hash2(bucket, 3, 77), env);
  }
  const flag = FLAGS[zone];
  if (flag) {
    const h = massHeight(zone, stage, tier, bucket);
    const [hw] = halfExtent(quadOf(geom));
    const atRim = zone !== Zone.School;
    const x = atRim ? cx + hw * 0.55 : cx + flag.dx;
    const y = atRim ? cy - h : cy - h + flag.dyFromRoof;
    drawFlag(ctx, x, y, flag.poleH, flag.hue, env);
  }
  if (zone === Zone.Park && bucket % 3 === 2) drawFountain(ctx, cx, cy, env);
}
