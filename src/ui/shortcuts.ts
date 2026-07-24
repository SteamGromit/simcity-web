import { BuildTool, Density, SERVICE_RADII, ToolId, mapScaled } from '../sim/types';
import { OverlayId } from '../render/overlays';

/** Keys already claimed by camera/help/sound bindings — never map tools here. */
export const RESERVED_KEYS = new Set(['q', 'e', 'm', 'h', '?', ' ', 'escape']);

/** Bare-key tool shortcuts (lowercase). Shown on the toolbar buttons. */
export const TOOL_KEYS: Record<string, ToolId | 'query'> = {
  i: 'query',
  b: 'bulldoze',
  r: 'road',
  '1': 'zoneR',
  '2': 'zoneC',
  '3': 'zoneI',
  p: 'plant',
  l: 'line',
  k: 'park',
  f: 'fire',
  v: 'police',
  s: 'school',
  d: 'hospital',
  u: 'bus',
  w: 'pump',
  x: 'pipe',
};

/** Reverse lookup: tool id → its display key, for button labels. */
export const KEY_OF: Partial<Record<ToolId | 'query', string>> = Object.fromEntries(
  Object.entries(TOOL_KEYS).map(([k, tool]) => [tool, k.toUpperCase()]),
);

/** Shift+key overlay toggles. Bare keys stay tools; Shift means a view. */
export const OVERLAY_KEYS: Record<string, OverlayId> = {
  p: 'power',
  o: 'pollution',
  l: 'landvalue',
  t: 'traffic',
  d: 'demand', // growth pressure; hospital keeps bare D, views are shifted
  f: 'fire',
  v: 'police', // matches the V police-station tool key
  s: 'school',
  h: 'health',
  w: 'water',
};

/** Reverse lookup: overlay id → its display key, for button labels. */
export const OVERLAY_KEY_OF: Partial<Record<OverlayId, string>> = Object.fromEntries(
  Object.entries(OVERLAY_KEYS).map(([k, id]) => [id, `⇧${k.toUpperCase()}`]),
);

/** Tools that drag out an adjustable 4-connected line (press, aim, release). */
export const LINE_TOOLS: Set<BuildTool> = new Set<BuildTool>(['road', 'line', 'pipe']);

/** Tools that drag out a filled rectangle rather than painting tile by tile. */
export const RECT_TOOLS: Set<BuildTool> = new Set<BuildTool>([
  'zoneR',
  'zoneC',
  'zoneI',
  'park',
  'bulldoze',
  'terraWater',
  'terraForest',
  'terraGrass',
  'terraRaise',
  'terraLower',
]);

/**
 * Service tools that preview their coverage footprint while placing.
 * Values come from SERVICE_RADII (hospital covers via the health field).
 *
 * The transit ladder's radii are computed with the same mapScaled formula
 * the registry's core content uses (src/content/packs/core.ts) rather than
 * read from the registry itself: this module is imported (and HALO_RADII
 * built) before any city has called ensureCoreContent, so a registry lookup
 * here would race the content bootstrap.
 */
export const HALO_RADII: Partial<Record<BuildTool, number>> = {
  fire: SERVICE_RADII.fire,
  police: SERVICE_RADII.police,
  school: SERVICE_RADII.school,
  hospital: SERVICE_RADII.health,
  bus: SERVICE_RADII.bus,
  streetcar: mapScaled(6.5),
  monorail: mapScaled(8.5),
  subway: mapScaled(10.5),
  rail: mapScaled(13),
};

/**
 * True when a keydown's target is a form control that owns keystrokes
 * (focused slider, text field, dropdown) — global game keys must not fire.
 * Duck-typed on tagName so it works without a DOM (tests run in node).
 */
export function isFormControl(target: unknown): boolean {
  const tag = (target as { tagName?: unknown } | null)?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/** Revive a persisted zone density; junk clamps to Low. */
export function clampDensity(raw: unknown): Density {
  if (raw === '2' || raw === 2) return 2;
  if (raw === '3' || raw === 3) return 3;
  return 1;
}
