import { Density, ToolId } from '../sim/types';
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
export const LINE_TOOLS: Set<ToolId> = new Set<ToolId>(['road', 'line', 'pipe']);

/** Tools that drag out a filled rectangle rather than painting tile by tile. */
export const RECT_TOOLS: Set<ToolId> = new Set<ToolId>([
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
