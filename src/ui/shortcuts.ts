import { ToolId } from '../sim/types';

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
