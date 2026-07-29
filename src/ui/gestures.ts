/**
 * Two-finger gesture maths. Pure — no DOM, no pointer events.
 *
 * The game reads a pinch as one combined move: the midpoint between the
 * fingers drags the camera, and the distance between them scales it. Doing
 * both from the same pair of frames is what makes a pinch feel like grabbing
 * the map rather than like two separate controls.
 */

export interface Pt {
  x: number;
  y: number;
}

/** Midpoint between two pointers — the anchor a pinch zooms about. */
export function midpoint(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Distance between two pointers. */
export function spread(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export interface PinchFrame {
  center: Pt;
  spread: number;
}

export function pinchFrame(a: Pt, b: Pt): PinchFrame {
  return { center: midpoint(a, b), spread: spread(a, b) };
}

/**
 * How much to scale the camera between two frames of a pinch. Guarded against
 * a degenerate frame: two pointers reported at the same spot give a spread of
 * zero, and dividing by it would send the zoom to Infinity and blank the map.
 */
export function pinchZoomFactor(prev: PinchFrame, next: PinchFrame): number {
  if (prev.spread <= 0 || next.spread <= 0) return 1;
  return next.spread / prev.spread;
}

/** How far the pinch midpoint travelled between two frames, in screen pixels. */
export function pinchPan(prev: PinchFrame, next: PinchFrame): Pt {
  return { x: next.center.x - prev.center.x, y: next.center.y - prev.center.y };
}
