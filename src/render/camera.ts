/** Camera moves that every input path shares. Pure — no DOM, no canvas. */

import { clampZoom } from './iso';

export interface CameraLike {
  x: number;
  y: number;
  zoom: number;
}

/**
 * Zoom about a point on screen, keeping the world position under that point
 * fixed — so the tile under the cursor, or under the middle of a pinch, is
 * still there afterwards. `px`/`py` are canvas-relative, not page-relative.
 *
 * Every zoom in the game goes through here: the wheel, the on-screen buttons
 * and a two-finger pinch. They differ only in where the anchor comes from.
 */
export function zoomAbout(
  cam: CameraLike,
  factor: number,
  px: number,
  py: number,
  viewW: number,
  viewH: number,
): void {
  const wx = cam.x + px / cam.zoom;
  const wy = cam.y + py / cam.zoom;
  cam.zoom = clampZoom(cam.zoom * factor, viewW, viewH);
  cam.x = wx - px / cam.zoom;
  cam.y = wy - py / cam.zoom;
}
