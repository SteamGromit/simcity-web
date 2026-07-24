import { buildingBySlot, buildingByTool, slotOf } from '../content/registry';
import { MOD_SLOT_BASE } from '../content/types';
import { collectBudget } from './budget';
import { defaultOrdinances, ensureCoreContent, unlockedFor } from './content';
import { updateDemand } from './demand';
import { developTile } from './develop';
import { blankTile, idx, inBounds, neighbors4 } from './grid';
import { updateLandValue } from './landvalue';
import { updatePollution } from './pollution';
import { updatePower } from './power';
import { updateWater } from './water';
import { updateWasteMonthly } from './waste';
import { crimeIncidents, updateCrime } from './crime';
import { accidentRoll, updateAccidents } from './accidents';
import { ageBuildings, collapseRoll } from './safety';
import { pandemicMonthly, rollForDisaster, rubbleMonthly, updateDisasters } from './disasters';
import { defaultWeather, updateWeatherMonthly } from './weather';
import { fireRisk, updateCoverage, updateFires } from './services';
import { isPlant, plantUnlockLabel, plantUnlocked } from './energy';
import { retierMonthly, updateEducation } from './tiers';
import { updateTraffic } from './traffic';
import {
  ActionToolId,
  Biome,
  BRIDGE_COST,
  BuildTool,
  CityState,
  COSTS,
  DEFAULT_TAX,
  defaultDisasters,
  defaultWaste,
  Density,
  DENSITY_COST_MULT,
  GRID,
  HISTORY_MAX,
  MAX_ELEV,
  START_FUNDS,
  Terrain,
  TICKS_PER_MONTH,
  ToolId,
  Zone,
} from './types';

/** Tiles per development roll; the whole grid is swept once per month. */
export const DEV_SLICE = (GRID * GRID) / TICKS_PER_MONTH;
const FIELD_INTERVAL = 4; // ticks between field recomputes

/** Grow an organic blob of `terrain` from a random start; deterministic. */
function growBlob(
  tiles: CityState['tiles'],
  rand: () => number,
  terrain: Terrain,
  size: number,
): void {
  const frontier: [number, number][] = [
    [4 + Math.floor(rand() * (GRID - 8)), 4 + Math.floor(rand() * (GRID - 8))],
  ];
  let placed = 0;
  let guard = size * 20;
  while (placed < size && frontier.length > 0 && guard-- > 0) {
    const k = Math.floor(rand() * frontier.length);
    const [x, y] = frontier.splice(k, 1)[0];
    if (!inBounds(x, y)) continue;
    const t = tiles[idx(x, y)];
    if (t.terrain !== Terrain.Grass) continue;
    t.terrain = terrain;
    placed++;
    for (const [nx, ny] of neighbors4(x, y)) {
      if (rand() < 0.75) frontier.push([nx, ny]);
    }
  }
}

/** Raise an organic blob of land by one level; returns the raised tiles. */
function raiseBlob(
  tiles: CityState['tiles'],
  rand: () => number,
  size: number,
  start?: [number, number],
): number[] {
  const frontier: [number, number][] = [
    start ?? [4 + Math.floor(rand() * (GRID - 8)), 4 + Math.floor(rand() * (GRID - 8))],
  ];
  const raised = new Set<number>();
  let guard = size * 20;
  while (raised.size < size && frontier.length > 0 && guard-- > 0) {
    const k = Math.floor(rand() * frontier.length);
    const [x, y] = frontier.splice(k, 1)[0];
    if (!inBounds(x, y) || raised.has(idx(x, y))) continue;
    const t = tiles[idx(x, y)];
    t.elevation = Math.min(MAX_ELEV, t.elevation + 1);
    raised.add(idx(x, y));
    for (const [nx, ny] of neighbors4(x, y)) {
      if (rand() < 0.8) frontier.push([nx, ny]);
    }
  }
  return [...raised];
}

function generateTerrain(tiles: CityState['tiles'], seed: number): Biome {
  const rand = mulberry32(seed ^ 0x7e44a1);
  const biome: Biome = rand() < 0.25 ? 'desert' : 'temperate';

  const AREA_SCALE = (GRID * GRID) / 4096; // 1 at the original 64×64

  // rolling hills first: broad base blobs with smaller caps stacked on top.
  // The first hill is always a true mountain — stacked to the snowcap.
  const hills = Math.round((2 + Math.floor(rand() * 3)) * AREA_SCALE);
  for (let i = 0; i < hills; i++) {
    const base = raiseBlob(tiles, rand, 80 + Math.floor(rand() * 120));
    if (base.length === 0) continue;
    const capAt = base[Math.floor(rand() * base.length)];
    const cap = raiseBlob(tiles, rand, 20 + Math.floor(rand() * 40), [
      capAt % GRID,
      (capAt / GRID) | 0,
    ]);
    const layers = i === 0 ? 3 : rand() < 0.6 ? 1 : 0;
    let on = cap.length > 0 ? cap : base;
    for (let k = 0; k < layers && on.length > 0; k++) {
      // climb from the highest point so the stack always gains a level
      const at = on.reduce((b, t) => (tiles[t].elevation > tiles[b].elevation ? t : b), on[0]);
      on = raiseBlob(tiles, rand, Math.max(4, 14 - k * 4), [at % GRID, (at / GRID) | 0]);
    }
  }

  if (biome === 'desert') {
    // oases and scrub patches — pumps and shade are precious out here
    const patches = Math.max(1, Math.round(AREA_SCALE));
    for (let i = 0; i < patches; i++) {
      growBlob(tiles, rand, Terrain.Water, 18 + Math.floor(rand() * 20));
      growBlob(tiles, rand, Terrain.Forest, 8 + Math.floor(rand() * 12));
    }
  } else {
    growBlob(tiles, rand, Terrain.Water, 70 + Math.floor(rand() * 90));
    const extraLakes = Math.round(AREA_SCALE);
    for (let i = 0; i < extraLakes; i++) {
      if (rand() < 0.5) growBlob(tiles, rand, Terrain.Water, 40 + Math.floor(rand() * 50));
    }
    const forests = Math.round((3 + Math.floor(rand() * 3)) * AREA_SCALE);
    for (let i = 0; i < forests; i++) {
      growBlob(tiles, rand, Terrain.Forest, 15 + Math.floor(rand() * 35));
    }
  }
  return biome;
}

export function newCity(seed: number): CityState {
  ensureCoreContent();
  const tiles = Array.from({ length: GRID * GRID }, blankTile);
  const biome = generateTerrain(tiles, seed);
  return {
    version: 1,
    seed,
    biome,
    tiles,
    funds: START_FUNDS,
    tick: 0,
    month: 0,
    demand: { r: 0, c: 0, i: 0 },
    taxes: { r: DEFAULT_TAX, c: DEFAULT_TAX, i: DEFAULT_TAX },
    population: 0,
    jobs: 0,
    eduLevel: 0,
    brownouts: 0,
    lastBudget: { rIncome: 0, cIncome: 0, iIncome: 0, expenses: 0, net: 0 },
    waste: defaultWaste(),
    ordinances: defaultOrdinances(),
    disasters: defaultDisasters(),
    weather: defaultWeather(),
    notices: [],
    history: { pop: [], funds: [] },
    transitLines: [],
  };
}

/** Deterministic 32-bit RNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TOOL_ZONE: Partial<Record<ToolId, Zone>> = {
  road: Zone.Road,
  zoneR: Zone.Residential,
  zoneC: Zone.Commercial,
  zoneI: Zone.Industrial,
  plant: Zone.PowerPlant,
  line: Zone.PowerLine,
  park: Zone.Park,
  fire: Zone.FireStation,
  police: Zone.PoliceStation,
  school: Zone.School,
  hospital: Zone.Hospital,
  pump: Zone.WaterPump,
  pipe: Zone.WaterPipe,
  solar: Zone.SolarPlant,
  wind: Zone.WindTurbine,
  hydro: Zone.HydroPlant,
  nuclear: Zone.NuclearPlant,
  landfill: Zone.Landfill,
  incinerator: Zone.Incinerator,
  recycling: Zone.RecyclingCentre,
  prison: Zone.Prison,
  // transit stations have no direct tools — the wizard places them
  // atomically via buildLine (sim/transitlines.ts)
};

export const ZONE_TOOLS: ToolId[] = ['zoneR', 'zoneC', 'zoneI'];
const TERRAIN_TOOLS: ToolId[] = ['terraWater', 'terraForest', 'terraGrass'];

/**
 * The slot a tool builds into.
 *
 * TOOL_ZONE stays the sole authority for core content: some core buildings
 * (the transit stations) deliberately declare a `tool` for pricing yet are
 * absent from the table because they're placed by the transit wizard, never
 * by a direct click. Falling back to the registry for those would quietly
 * re-enable direct placement, so the fallback is limited to mod-allocated
 * slots — the buildings the mod system owns.
 */
function toolSlot(tool: BuildTool): Zone | undefined {
  const core = TOOL_ZONE[tool as ToolId];
  if (core !== undefined) return core;
  const def = buildingByTool(tool);
  if (def === undefined) return undefined;
  const slot = slotOf(def.id);
  return slot !== undefined && slot >= MOD_SLOT_BASE ? (slot as Zone) : undefined;
}

const isZoneTool = (tool: BuildTool): boolean => (ZONE_TOOLS as string[]).includes(tool);
/** How much Building Permits add to the price of zoning. */
const PERMIT_SURCHARGE = 1.15;
const isTerrainTool = (tool: BuildTool): boolean => (TERRAIN_TOOLS as string[]).includes(tool);

const TOOL_TERRAIN: Partial<Record<ToolId, Terrain>> = {
  terraWater: Terrain.Water,
  terraForest: Terrain.Forest,
  terraGrass: Terrain.Grass,
};

/**
 * God-mode window: terrain sculpting is free until anything has developed.
 * Checked against the tiles themselves, not the lagging population
 * aggregates, so the window can't be gamed between field updates.
 */
function isPristine(city: CityState): boolean {
  return city.tiles.every((t) => t.stage === 0);
}

/** Zone tools cost more at higher density; everything else has a flat cost.
 * Building prices come from content; actions and zoning keep theirs in COSTS. */
export function toolCost(tool: BuildTool, density: Density): number {
  const def = buildingByTool(tool);
  if (def) return def.cost;
  const mult = isZoneTool(tool) ? DENSITY_COST_MULT[density] : 1;
  return COSTS[tool as ActionToolId] * mult;
}

function isBareTerrainDoze(tool: BuildTool, t: { zone: Zone; terrain: Terrain }): boolean {
  return tool === 'bulldoze' && t.zone === Zone.None && t.terrain !== Terrain.Grass;
}

function effectiveCost(
  city: CityState,
  tool: BuildTool,
  density: Density,
  t: { zone: Zone; terrain: Terrain },
): number {
  if (isTerrainTool(tool) || tool === 'terraRaise' || tool === 'terraLower') {
    return isPristine(city) ? 0 : toolCost(tool, density);
  }
  if (tool === 'road' && t.terrain === Terrain.Water) return BRIDGE_COST;
  // leveling bare forest/water is terrain work, priced like the Level Land tool
  if (isBareTerrainDoze(tool, t)) return isPristine(city) ? 0 : COSTS.terraGrass;
  let cost = toolCost(tool, density);
  // Building Permits pay for their inspections at new construction: a small
  // surcharge on zoning while the ordinance is enacted.
  if (isZoneTool(tool) && city.ordinances['permits']) cost = Math.round(cost * PERMIT_SURCHARGE);
  return cost;
}

function validateTool(
  city: CityState,
  tool: BuildTool,
  x: number,
  y: number,
  density: Density,
): string | null {
  if (!inBounds(x, y)) return 'out of bounds';
  const t = city.tiles[idx(x, y)];
  if (city.funds < effectiveCost(city, tool, density, t)) return 'not enough funds';
  if (tool === 'bulldoze') {
    return t.zone === Zone.None && t.terrain === Terrain.Grass ? 'nothing to bulldoze' : null;
  }
  if (tool === 'repair') {
    const rci = t.zone === Zone.Residential || t.zone === Zone.Commercial || t.zone === Zone.Industrial;
    return rci && t.stage > 0 && !t.abandoned ? null : 'nothing to repair here';
  }
  if (isTerrainTool(tool)) {
    if (t.zone !== Zone.None) return 'tile occupied';
    return t.terrain === TOOL_TERRAIN[tool as ToolId] ? 'no change' : null;
  }
  if (tool === 'terraRaise' || tool === 'terraLower') {
    if (t.zone !== Zone.None) return 'tile occupied';
    if (tool === 'terraRaise' && t.elevation >= MAX_ELEV) return 'no change';
    if (tool === 'terraLower' && t.elevation <= 0) return 'no change';
    return null;
  }
  if (t.terrain !== Terrain.Grass) {
    // the road tool bridges water; everything else needs dry, clear land
    if (!(tool === 'road' && t.terrain === Terrain.Water)) {
      return 'cannot build on water or forest';
    }
  }
  const built = toolSlot(tool);
  if (built === undefined) return 'placed via the transit wizard';
  if (isPlant(built) && !plantUnlocked(built, city)) {
    return `unlocks at ${plantUnlockLabel(built) ?? 'a larger population'}`;
  }
  // Everything below is driven by the building's own definition, so an
  // authored building is gated by the same rules core content is.
  const def = buildingBySlot(built);
  if (def?.unlock && !unlockedFor(def, city)) {
    return `unlocks at ${def.unlock.label}`;
  }
  if (def?.siting?.needsWater) {
    const wet = neighbors4(x, y).some(
      ([nx, ny]) => city.tiles[idx(nx, ny)].terrain === Terrain.Water,
    );
    if (!wet) return 'needs adjacent water';
  }
  if (tool === 'line' && t.zone === Zone.Road) return t.wire ? 'tile occupied' : null;
  if (tool === 'pipe' && t.zone === Zone.Road) return t.pipe ? 'tile occupied' : null;
  return t.zone === Zone.None ? null : 'tile occupied';
}

/** Would applyTool succeed here? (Used for hover feedback.) */
export function canApply(
  city: CityState,
  tool: BuildTool,
  x: number,
  y: number,
  density: Density = 1,
): boolean {
  return validateTool(city, tool, x, y, density) === null;
}

export function applyTool(
  city: CityState,
  tool: BuildTool,
  x: number,
  y: number,
  density: Density = 1,
): { ok: boolean; err?: string } {
  const err = validateTool(city, tool, x, y, density);
  if (err) return { ok: false, err };

  const t = city.tiles[idx(x, y)];
  const cost = effectiveCost(city, tool, density, t);
  if (tool === 'bulldoze') {
    // razing a structure keeps the ground; dozing bare forest/water clears it
    const keepTerrain = t.zone !== Zone.None ? t.terrain : Terrain.Grass;
    const keepElev = t.elevation;
    city.tiles[idx(x, y)] = blankTile();
    city.tiles[idx(x, y)].terrain = keepTerrain;
    city.tiles[idx(x, y)].elevation = keepElev;
  } else if (isTerrainTool(tool)) {
    t.terrain = TOOL_TERRAIN[tool as ToolId]!;
  } else if (tool === 'terraRaise' || tool === 'terraLower') {
    t.elevation += tool === 'terraRaise' ? 1 : -1;
  } else if (tool === 'repair') {
    t.age = 0; // as good as new — collapse risk back to zero
  } else if (tool === 'line' && t.zone === Zone.Road) {
    t.wire = true;
  } else if (tool === 'pipe' && t.zone === Zone.Road) {
    t.pipe = true;
  } else {
    t.zone = toolSlot(tool)!;
    t.stage = 0;
    t.abandoned = false;
    if (isZoneTool(tool)) t.density = density;
  }
  city.funds -= cost;
  return { ok: true };
}

/**
 * Apply a drag-line of tool tiles (roads, power lines, pipes). Tiles that
 * reject the tool are skipped, matching how road lines already behave;
 * brokeFunds reports whether any tile failed on money so the UI can toast.
 */
export function applyToolLine(
  city: CityState,
  tool: BuildTool,
  line: [number, number][],
  density: Density = 1,
): { applied: number; brokeFunds: boolean } {
  let applied = 0;
  let brokeFunds = false;
  for (const [x, y] of line) {
    const res = applyTool(city, tool, x, y, density);
    if (res.ok) applied++;
    else if (res.err === 'not enough funds') brokeFunds = true;
  }
  return { applied, brokeFunds };
}

/**
 * One simulation tick. Development sweeps the grid in DEV_SLICE chunks
 * (full coverage once per month); fields refresh every FIELD_INTERVAL
 * ticks; the budget closes monthly.
 */
export function simTick(city: CityState, rand: () => number): void {
  city.tick += 1;

  if (city.tick % FIELD_INTERVAL === 0) {
    updatePower(city);
    updateWater(city);
    updateCoverage(city);
    updateTraffic(city);
    updatePollution(city);
    updateLandValue(city);
    updateEducation(city);
    updateDemand(city);
  }

  updateFires(city, rand);
  updateAccidents(city);
  updateDisasters(city, rand);

  const start = (city.tick * DEV_SLICE) % (GRID * GRID);
  for (let n = 0; n < DEV_SLICE; n++) {
    const i = (start + n) % (GRID * GRID);
    developTile(city, i % GRID, (i / GRID) | 0, rand);
  }

  if (city.tick % TICKS_PER_MONTH === 0) {
    city.month += 1;
    fireRisk(city, rand);
    accidentRoll(city, rand);
    ageBuildings(city);
    collapseRoll(city, rand);
    pandemicMonthly(city, rand);
    rubbleMonthly(city);
    updateWasteMonthly(city);
    updateCrime(city);
    crimeIncidents(city, rand);
    retierMonthly(city, rand);
    rollForDisaster(city, rand);
    updateWeatherMonthly(city, rand);
    collectBudget(city);
    updateDemand(city); // demand reflects the month's new totals right away
    if (city.notices.length > 8) city.notices.splice(0, city.notices.length - 8);
    city.history.pop.push(city.population);
    city.history.funds.push(city.funds);
    if (city.history.pop.length > HISTORY_MAX) {
      city.history.pop.shift();
      city.history.funds.shift();
    }
  }
}
