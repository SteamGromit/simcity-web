/** The render style: how the frame is finished.
 * - pixel: reduced-res nearest-neighbor crunch (sprite art)
 * - smooth: plain full-resolution drawing
 * - realistic: full resolution plus soft shadows, wall-base ambient
 *   occlusion, water depth shading, and an atmospheric haze
 */

export type RenderStyle = 'pixel' | 'smooth' | 'realistic';

const KEY = 'simcity.renderstyle';
const LEGACY_PIXEL_KEY = 'simcity.pixel';

/** Internal resolution share while the pixel style is active. */
export const PIXEL_SCALE = 0.45;

// tests import render modules from Node, where localStorage is absent
const store = typeof localStorage !== 'undefined' ? localStorage : null;

let style: RenderStyle = (() => {
  const v = store?.getItem(KEY);
  if (v === 'pixel' || v === 'smooth' || v === 'realistic') return v;
  // migrate the v0.40 checkbox where it was set; fresh installs get
  // the realistic look
  const legacy = store?.getItem(LEGACY_PIXEL_KEY);
  if (legacy === '0') return 'smooth';
  if (legacy === '1') return 'pixel';
  return 'realistic';
})();

export function getRenderStyle(): RenderStyle {
  return style;
}

export function setRenderStyle(s: RenderStyle): void {
  style = s;
  store?.setItem(KEY, s);
}
