export const GRID = 96;

/** The grid the classic balance numbers were tuned on. */
export const BASE_GRID = 64;

/** Scale a 64-era tile distance to this map, so radii and spreads keep
 * their share of the city across map sizes. Only for share-of-city
 * semantics — physical adjacency rules (pump water range, hurricane
 * surge) stay absolute. */
export const mapScaled = (base: number): number => Math.round((base * GRID) / BASE_GRID);

export enum Zone {
  None,
  Residential,
  Commercial,
  Industrial,
  Road,
  PowerPlant,
  PowerLine,
  Park,
  FireStation,
  PoliceStation,
  School,
  Hospital,
  BusStop,
  WaterPump,
  WaterPipe,
  // appended for save compatibility — energy tiers (v0.31)
  SolarPlant,
  WindTurbine,
  HydroPlant,
  NuclearPlant,
  // appended for save compatibility — transit tiers (v0.32)
  StreetcarStop,
  MonorailStation,
  SubwayStation,
  RailTerminal,
  // appended for save compatibility — garbage (v0.50)
  Landfill,
  Incinerator,
  RecyclingCentre,
  // appended for save compatibility — crime (v0.51)
  Prison,
}

export type Stage = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type Density = 1 | 2 | 3;
/** Residential/commercial wealth: § / §§ / §§§. */
export type Wealth = 1 | 2 | 3;
/** Industrial subtype. Agriculture is player-chosen via density 1. */
export type IndustryKind = 'ag' | 'dirty' | 'manu' | 'tech';
/** A developed tile's subtype: wealth for R/C, kind for I. */
export type Tier = Wealth | IndustryKind;

export enum Terrain {
  Grass,
  Water,
  Forest,
}

export interface Tile {
  zone: Zone;
  /** Natural ground cover; structures require Grass (roads may bridge Water). */
  terrain: Terrain;
  /** Ground height 0..MAX_ELEV; the whole tile sits at one level. */
  elevation: number;
  stage: Stage;
  /** Zoned density (R/C/I): caps development at stage 3 / 5 / 7. */
  density: Density;
  /** Wealth (R/C) or industry kind (I). Meaningless while stage === 0;
   * always read through normalizeTier, never raw. */
  tier: Tier;
  powered: boolean;
  /** Connected to a working water pump; stages 3+ require it. */
  watered: boolean;
  abandoned: boolean;
  /** Power line strung over a road tile (lines elsewhere use Zone.PowerLine). */
  wire: boolean;
  /** Water main under a road tile (pipes elsewhere use Zone.WaterPipe). */
  pipe: boolean;
  /** Cars a covered trip from here still puts on the road; 1 = no
   * transit. Computed each coverage pass, like the coverage fields. */
  transitShare: number;
  /** Service coverage 0..1 from powered stations, refreshed by the sim. */
  fireCov: number;
  policeCov: number;
  schoolCov: number;
  healthCov: number;
  busCov: number;
  /** Garbage pickup reach from a powered disposal building. */
  garbageCov: number;
  /**
   * Uncollected refuse piled on this lot, 0..1. Unlike the coverage fields
   * this is real state the city is in, not a derived reading, so it persists
   * and only clears as collection catches up.
   */
  garbage: number;
  /**
   * Standing crime rate, 0..1. Persisted, and feeds back on itself through
   * land value, so it is real state rather than a reading recomputed cold.
   */
  crime: number;
  /** Frames of incident flash left; render-only, never saved. */
  crimeFlash: number;
  /** Ticks of fire left on this tile; 0 = not burning. */
  burning: number;
  /** Months of disaster debris on the lot; blocks development while > 0. */
  rubble: number;
  // computed fields, refreshed by the sim
  pollution: number; // 0..1
  landValue: number; // 0..1
  commute: number; // road distance to jobs (R) or workers (C/I); Infinity if unreachable
  traffic: number; // commuter volume, road tiles only
}

export interface Demand {
  r: number; // −1..1
  c: number;
  i: number;
}

export interface Taxes {
  r: number; // 0..0.20
  c: number;
  i: number;
}

export interface BudgetReport {
  rIncome: number;
  cIncome: number;
  iIncome: number;
  expenses: number;
  net: number;
}

/** Ordinance ids are content-defined, so this is a plain string. Core ids are
 * pinned (cleanAir, freeBus, fireCode, eduGrant, healthDrive) because saves
 * store them as the keys of city.ordinances. */
export type OrdinanceId = string;

export type DisasterKind = 'tornado' | 'hurricane' | 'pandemic';

export interface Disasters {
  /** Wandering funnel; null when the skies are clear. */
  tornado: { x: number; y: number; ticksLeft: number } | null;
  /** City-wide storm; 0 = none. */
  hurricaneTicks: number;
  /** Demand-sapping outbreak; 0 = none. Hospitals soften it. */
  pandemicMonths: number;
}

export function defaultDisasters(): Disasters {
  return { tornado: null, hurricaneTicks: 0, pandemicMonths: 0 };
}

export const TORNADO_TICKS = 48;
export const HURRICANE_TICKS = 64;
export const PANDEMIC_MONTHS = 6;

export type Biome = 'temperate' | 'desert';

/** What the city threw out last month, and what happened to it. */
export interface WasteReport {
  /** Tonnes developed tiles put out, after the production modifier. */
  produced: number;
  /** Tonnes recycling removed before any of it needed burying. */
  diverted: number;
  /** Tonnes per month the powered disposal buildings can process. */
  capacity: number;
  /** Tonnes actually taken away. */
  collected: number;
  /** Tonnes left on the kerb — out of reach, or over capacity. */
  uncollected: number;
}

export function defaultWaste(): WasteReport {
  return { produced: 0, diverted: 0, capacity: 0, collected: 0, uncollected: 0 };
}

export interface CityState {
  version: 1;
  seed: number;
  /** Map flavor rolled at generation: ground palette, vegetation, dryness. */
  biome: Biome;
  tiles: Tile[]; // GRID * GRID, row-major
  funds: number;
  tick: number;
  month: number; // months since Jan 2000
  demand: Demand;
  taxes: Taxes;
  population: number;
  jobs: number;
  /** Share of developed R tiles with school coverage, 0..1. Gates high-tech. */
  eduLevel: number;
  /** Consumers denied power last tick because the plant pool ran dry. */
  brownouts: number;
  lastBudget: BudgetReport;
  /** Last month's refuse ledger; recomputed by the waste pass. */
  waste: WasteReport;
  /** Enacted city policies; each charges monthly and tweaks the sim. */
  ordinances: Record<string, boolean>;
  /** Active disasters (spawned randomly or summoned from City Hall). */
  disasters: Disasters;
  /** Current weather; visual plus light sim effects (fire, traffic). */
  weather: import('./weather').Weather;
  /** Event messages (fires, etc.) queued for the UI; newest last, capped. */
  notices: string[];
  /** Monthly samples for the charts panel, newest last, capped at HISTORY_MAX. */
  history: { pop: number[]; funds: number[] };
  /** Player-drawn transit routes; stops are ordinary station tiles. */
  transitLines: import('./transitlines').TransitLine[];
  /** Slot → content id for every slot this city uses, so a save survives
   * being opened with a different set of packs loaded. Absent in legacy
   * saves, which are read with an identity mapping. */
  zoneIds?: Record<number, string>;
}

export const HISTORY_MAX = 240; // 20 years of monthly samples

/** Residential population capacity by development stage (0–7). */
export const R_POP = [0, 8, 24, 60, 120, 240, 420, 700];
/** Commercial job capacity by development stage. */
export const C_JOBS = [0, 6, 18, 45, 90, 180, 320, 550];
/** Industrial job capacity by development stage. */
export const I_JOBS = [0, 10, 30, 75, 140, 260, 420, 650];

/** Max development stage a zone of each density can reach. */
export const MAX_STAGE_BY_DENSITY = [0, 3, 5, 7];
/** Zone construction cost multiplier by density. */
export const DENSITY_COST_MULT = [0, 1, 2, 4];

export type ToolId =
  | 'road'
  | 'zoneR'
  | 'zoneC'
  | 'zoneI'
  | 'plant'
  | 'line'
  | 'park'
  | 'fire'
  | 'police'
  | 'school'
  | 'hospital'
  | 'bus'
  | 'pump'
  | 'pipe'
  | 'solar'
  | 'wind'
  | 'hydro'
  | 'nuclear'
  | 'landfill'
  | 'incinerator'
  | 'recycling'
  | 'prison'
  | 'streetcar'
  | 'monorail'
  | 'subway'
  | 'rail'
  | 'terraWater'
  | 'terraForest'
  | 'terraGrass'
  | 'terraRaise'
  | 'terraLower'
  | 'bulldoze';

/**
 * A tool the player can hold. Core tools are the closed `ToolId` union above;
 * a building authored in a mod contributes its own tool id at runtime, so the
 * placement seam accepts any string. `(string & {})` keeps editor completion
 * for the known ids instead of collapsing the whole thing to `string`.
 */
export type BuildTool = ToolId | (string & {});

/** Tools that are actions or zoning rather than a placed building; their
 * prices stay here because no content definition owns them. Building prices
 * come from the registry (see toolCost). */
export type ActionToolId =
  | 'zoneR'
  | 'zoneC'
  | 'zoneI'
  | 'terraWater'
  | 'terraForest'
  | 'terraGrass'
  | 'terraRaise'
  | 'terraLower'
  | 'bulldoze';

export const COSTS: Record<ActionToolId, number> = {
  zoneR: 5,
  zoneC: 5,
  zoneI: 5,
  terraWater: 25,
  terraForest: 10,
  terraGrass: 5,
  terraRaise: 20,
  terraLower: 20,
  bulldoze: 1,
};

/** Highest ground level; cliffs form where neighbors differ.
 * 4 renders rocky, 5 wears a snowcap. */
export const MAX_ELEV = 5;
/** Flat cost for a road tile laid over water. */
export const BRIDGE_COST = 50;

/** A pump only works within this Chebyshev distance of open water. */
export const PUMP_WATER_RANGE = 2;

/** Commuter volume a road tile carries comfortably; beyond it, congestion. */
export const ROAD_CAPACITY = 12;
/** Extra route cost (on a base of 1) for a fully jammed tile. */
export const CONGESTION_MAX_EXTRA = 3;
/** Traffic a bus-served trip adds to each road tile (vs 1 for car trips). */
export const BUS_TRAFFIC_SHARE = 0.5;

/** Coverage radii (Chebyshev tiles) per service. */
export const SERVICE_RADII = {
  fire: mapScaled(8),
  police: mapScaled(8),
  school: mapScaled(10),
  health: mapScaled(10),
  bus: mapScaled(5),
  // collection rounds cover ground; a depot reaches further than a school does
  landfill: mapScaled(11),
  incinerator: mapScaled(12),
  recycling: mapScaled(10),
  prison: mapScaled(14),
};
/** Monthly upkeep per service building. */
export const SERVICE_UPKEEP = { fire: 50, police: 50, school: 40, health: 60, bus: 15 };
/** Monthly ignition probability for a developed tile with zero fire coverage. */
export const FIRE_RISK = 0.004;
/** Ticks a fire burns before the building is destroyed. */
export const FIRE_BURN_TICKS = 12;
/** Per-tick chance fire spreads to an adjacent building, scaled by 1 − fireCov. */
export const FIRE_SPREAD = 0.25;
/** Per-tick extinguish chance multiplier: rand < fireCov × this puts it out. */
export const FIRE_EXTINGUISH = 0.35;
/** Months a wrecked lot stays buried in debris before crews clear it. */
export const RUBBLE_MONTHS = 4;

export const START_FUNDS = 50_000;
export const DEFAULT_TAX = 0.09;
export const TICKS_PER_MONTH = 8;
