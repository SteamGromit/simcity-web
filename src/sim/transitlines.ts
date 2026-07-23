import { buildingByTool } from '../content/registry';
import { idx, inBounds, neighbors4, roadLine } from './grid';
import { transitUnlocked } from './transit';
import { CityState, Terrain, ToolId, Zone } from './types';

/** A planned transit route: the drawn path, its stops, and its color.
 * Stops are ordinary station tiles — coverage, power, and upkeep flow
 * from the existing machinery; the line is the placement vehicle. */
export interface TransitLine {
  id: number;
  mode: Zone; // BusStop … RailTerminal
  color: string;
  path: [number, number][];
  stops: [number, number][];
}

export interface LineDraft {
  mode: Zone;
  color: string;
  path: [number, number][];
  stops: [number, number][];
}

export const LINE_COLORS = [
  '#e05548', // red
  '#3d6ea8', // blue
  '#3f9a50', // green
  '#e0913f', // orange
  '#8a5fb0', // violet
  '#2fa38f', // teal
];

/** Per-path-tile track cost. Buses ride the streets that already exist. */
export const TRACK_COST: Partial<Record<Zone, number>> = {
  [Zone.BusStop]: 0,
  [Zone.StreetcarStop]: 10,
  [Zone.MonorailStation]: 25,
  [Zone.SubwayStation]: 40,
  [Zone.RailTerminal]: 50,
};

const STOP_TOOL: Partial<Record<Zone, ToolId>> = {
  [Zone.BusStop]: 'bus',
  [Zone.StreetcarStop]: 'streetcar',
  [Zone.MonorailStation]: 'monorail',
  [Zone.SubwayStation]: 'subway',
  [Zone.RailTerminal]: 'rail',
};

/** Rasterize clicked vertices into a contiguous tile path (joints deduped). */
export function rasterizePath(vertices: [number, number][]): [number, number][] {
  const path: [number, number][] = [];
  for (let k = 0; k + 1 < vertices.length; k++) {
    const seg = roadLine(vertices[k][0], vertices[k][1], vertices[k + 1][0], vertices[k + 1][1]);
    for (const p of k === 0 ? seg : seg.slice(1)) path.push(p);
  }
  if (path.length === 0 && vertices.length === 1) path.push(vertices[0]);
  return path;
}

/** Ground rules for routing: surface modes cannot cross water; elevated
 * and underground modes (monorail, subway, rail) may span it. */
export function validPathTile(city: CityState, mode: Zone, x: number, y: number): boolean {
  if (!inBounds(x, y)) return false;
  if (city.tiles[idx(x, y)].terrain !== Terrain.Water) return true;
  return mode === Zone.MonorailStation || mode === Zone.SubwayStation || mode === Zone.RailTerminal;
}

/** A stop must sit on or orthogonally beside the path, on clear ground:
 * empty land or a still-empty R/C/I zoning (which the stop overrides). */
export function validStopSite(
  city: CityState,
  path: [number, number][],
  x: number,
  y: number,
): boolean {
  if (!inBounds(x, y)) return false;
  const touches = path.some(
    ([px, py]) => (px === x && py === y) || neighbors4(x, y).some(([nx, ny]) => nx === px && ny === py),
  );
  if (!touches) return false;
  const t = city.tiles[idx(x, y)];
  if (t.terrain !== Terrain.Grass) return false;
  if (t.zone === Zone.None) return true;
  const rci =
    t.zone === Zone.Residential || t.zone === Zone.Commercial || t.zone === Zone.Industrial;
  return rci && t.stage === 0 && !t.abandoned;
}

export function lineCost(mode: Zone, path: [number, number][], stops: [number, number][]): number {
  const track = TRACK_COST[mode] ?? 0;
  const stopPrice = buildingByTool(STOP_TOOL[mode] ?? 'bus')?.cost ?? 0;
  return path.length * track + stops.length * stopPrice;
}

/** Build the drafted line atomically: validates funds, converts every
 * stop tile to the mode's station zone, and records the line. Returns
 * false (changing nothing) when funds are short or the draft is empty. */
export function buildLine(city: CityState, draft: LineDraft): boolean {
  if (draft.path.length < 2 || draft.stops.length === 0) return false;
  if (draft.mode !== Zone.BusStop && !transitUnlocked(draft.mode, city)) return false;
  const cost = lineCost(draft.mode, draft.path, draft.stops);
  if (city.funds < cost) return false;
  city.funds -= cost;
  for (const [x, y] of draft.stops) {
    const t = city.tiles[idx(x, y)];
    t.zone = draft.mode;
    t.stage = 0;
    t.abandoned = false;
  }
  const id = city.transitLines.reduce((m, l) => Math.max(m, l.id), 0) + 1;
  city.transitLines.push({
    id,
    mode: draft.mode,
    color: draft.color,
    path: draft.path.map((p) => [p[0], p[1]]),
    stops: draft.stops.map((p) => [p[0], p[1]]),
  });
  return true;
}
