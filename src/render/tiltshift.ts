/**
 * The miniature finish. The composed frame is copied at half resolution,
 * blurred and lightly saturated, then laid back over itself through a
 * vertical mask that spares a central focus band — the tilt-shift trick that
 * makes a real scene read as a model. One buffer, one filtered draw; the same
 * silent no-op guard as bloom where canvas filters don't exist.
 */

import { getRenderStyle } from './renderstyle';

const KEY = 'simcity.tiltshift';
const store = typeof localStorage !== 'undefined' ? localStorage : null;

/** null = never touched: follow the render style (on in realistic). */
let pref: boolean | null = (() => {
  const v = store?.getItem(KEY);
  return v == null ? null : v === '1';
})();

export function getTiltShift(): boolean {
  return pref ?? getRenderStyle() === 'realistic';
}

/** Whether the finish runs this frame: on by preference, and only while it
 * is light — after dark the blur turned the lit windows into mush. */
export function tiltShiftActive(night: number): boolean {
  return getTiltShift() && night < 0.5;
}

export function setTiltShift(on: boolean): void {
  pref = on;
  store?.setItem(KEY, on ? '1' : '0');
}

/** Mask geometry: blur full above topEnd·h fading to none, none again until
 * botStart·h, rising to botAlpha at the bottom edge. */
export const TILT_BANDS = { topEnd: 0.34, botStart: 0.78, botAlpha: 0.85 } as const;

let buf: HTMLCanvasElement | null = null;

export function paintTiltShift(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  if (w < 8 || h < 8) return;
  const bw = Math.max(4, Math.floor(w / 2));
  const bh = Math.max(4, Math.floor(h / 2));
  if (!buf) buf = document.createElement('canvas');
  if (buf.width !== bw) buf.width = bw;
  if (buf.height !== bh) buf.height = bh;
  const b = buf.getContext('2d');
  if (!b || typeof b.filter !== 'string') return;
  b.setTransform(1, 0, 0, 1, 0, 0);
  b.globalCompositeOperation = 'source-over';
  b.clearRect(0, 0, bw, bh);
  b.filter = `blur(${Math.max(1.2, bh / 260)}px) saturate(1.16)`;
  b.drawImage(ctx.canvas, 0, 0, bw, bh);
  b.filter = 'none';
  // carve the focus band out of the blurred copy
  b.globalCompositeOperation = 'destination-in';
  const g = b.createLinearGradient(0, 0, 0, bh);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(TILT_BANDS.topEnd, 'rgba(0,0,0,0)');
  g.addColorStop(TILT_BANDS.botStart, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${TILT_BANDS.botAlpha})`);
  b.fillStyle = g;
  b.fillRect(0, 0, bw, bh);
  b.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(buf, 0, 0, w, h);
  ctx.restore();
}
