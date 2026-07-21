/** Rendering level of detail from camera zoom. Pure — no canvas. */

/**
 * 0 — far (whole-map views): masses, roofs, shadows, stacks only.
 * 1 — mid: today's detail plus doors and storefront bands.
 * 2 — close: adds window mullions, signage, door frames.
 */
export function detailLevel(zoom: number): 0 | 1 | 2 {
  if (zoom < 0.45) return 0;
  if (zoom < 1.1) return 1;
  return 2;
}
