/**
 * Road classes: the street ladder.
 *
 * A road tile is still a road tile — one `Zone.Road`, one slot, one save
 * format. What changes with the class is how *wide* the corridor is, how much
 * traffic each of its tiles swallows, and what it costs. Drawing a class-2
 * boulevard stamps a three-tile band rather than a one-tile line; the middle
 * strip is a planted median, which is a road tile that carries no traffic at
 * all (see `Tile.median`).
 *
 * Prices and upkeep are multipliers on the plain street's, which lives in the
 * content registry as `core:road` — so a mod that retunes the price of a road
 * retunes the whole ladder with it, instead of the ladder freezing whatever
 * core happened to charge that day.
 */

import { Zone, type BuildTool } from './types';

/** 0 street · 1 route · 2 boulevard · 3 highway · 4 highway II. */
export type RoadClass = 0 | 1 | 2 | 3 | 4;

export interface RoadClassDef {
  cls: RoadClass;
  /** Toolbar tool that lays it. */
  tool: string;
  label: string;
  /** Tiles the band occupies across the direction of travel. */
  width: number;
  /** Per-tile build cost, ×`core:road`'s. */
  costMult: number;
  /** Per-tile monthly upkeep, ×`core:road`'s. */
  upkeepMult: number;
  /** Traffic one tile of this class carries comfortably, ×ROAD_CAPACITY. */
  capacity: number;
  /** Population it unlocks at; 0 is always available. */
  unlockPop: number;
  /** Human phrasing for the toolbar hint, matching the buildings' `unlock.label`. */
  unlockLabel: string;
  blurb: string;
}

/**
 * Indexed by class, so `ROAD_CLASSES[t.road]` is always the tile's own row.
 * Widths are the player-facing promise: a route needs two squares, a boulevard
 * three, a highway four, and its second level six.
 */
export const ROAD_CLASSES: readonly RoadClassDef[] = [
  {
    cls: 0,
    tool: 'road',
    label: 'Street',
    width: 1,
    costMult: 1,
    upkeepMult: 1,
    capacity: 1,
    unlockPop: 0,
    unlockLabel: '',
    blurb: 'One lane each way. The substrate everything else grows from.',
  },
  {
    cls: 1,
    tool: 'route',
    label: 'Route',
    width: 2,
    costMult: 1.4,
    upkeepMult: 1.2,
    capacity: 1.15,
    unlockPop: 2000,
    unlockLabel: 'pop 2,000',
    blurb: 'Two squares wide: traffic flows in each direction without meeting.',
  },
  {
    cls: 2,
    tool: 'boulevard',
    label: 'Boulevard',
    width: 3,
    costMult: 1.6,
    upkeepMult: 1.2,
    capacity: 1.3,
    unlockPop: 8000,
    unlockLabel: 'pop 8,000',
    blurb: 'Two carriageways around a planted median — three squares wide.',
  },
  {
    cls: 3,
    tool: 'highway',
    label: 'Highway',
    width: 4,
    costMult: 3,
    upkeepMult: 2.5,
    capacity: 2.4,
    unlockPop: 20000,
    unlockLabel: 'pop 20,000',
    blurb: 'Four squares wide: two lanes each direction, and no front doors.',
  },
  {
    cls: 4,
    tool: 'highway2',
    label: 'Highway II',
    width: 6,
    costMult: 4,
    upkeepMult: 3,
    capacity: 2.8,
    unlockPop: 45000,
    unlockLabel: 'pop 45,000',
    blurb: 'Six squares of interstate. Enormous, expensive, and it moves a city.',
  },
];

/** The class a tool lays, or null when the tool is not a road tool at all. */
export function roadClassOfTool(tool: BuildTool): RoadClass | null {
  const found = ROAD_CLASSES.find((r) => r.tool === tool);
  return found ? found.cls : null;
}

export function isRoadTool(tool: BuildTool): boolean {
  return roadClassOfTool(tool) !== null;
}

/** Every road tool, lowest class first — the toolbar bundle's member order. */
export const ROAD_TOOLS: readonly string[] = ROAD_CLASSES.map((r) => r.tool);

/** Revive a persisted class; junk clamps to a plain street. */
export function clampRoadClass(raw: unknown): RoadClass {
  return raw === 1 || raw === 2 || raw === 3 || raw === 4 ? raw : 0;
}

/** Traffic multiplier for a tile of this class, ×ROAD_CAPACITY. */
export function roadCapacityMult(cls: RoadClass): number {
  return ROAD_CLASSES[cls].capacity;
}

/**
 * True when this tile carries traffic. Planted medians are road tiles that
 * cars never touch: routing steps around them, the automata ignore them, and
 * a building beside one does not count it as road access. Drawing a plain
 * street across a boulevard turns the median tile it crosses back into
 * ordinary asphalt, which is how a junction gets made.
 */
export function drivable(t: { zone: Zone; median: boolean }): boolean {
  return t.zone === Zone.Road && !t.median;
}
