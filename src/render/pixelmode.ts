/** Pixel-look preference: the scene renders at a reduced internal
 * resolution and upscales with nearest-neighbor, turning the whole
 * procedural drawing into chunky sprite art. */

const KEY = 'simcity.pixel';

/** Internal resolution as a share of device pixels while pixelated. */
export const PIXEL_SCALE = 0.45;

let pixel = localStorage.getItem(KEY) !== '0'; // default on

export function getPixelMode(): boolean {
  return pixel;
}

export function setPixelMode(on: boolean): void {
  pixel = on;
  localStorage.setItem(KEY, on ? '1' : '0');
}
