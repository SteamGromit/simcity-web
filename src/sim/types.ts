export const GRID = 64;

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
}

export type Stage = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type Density = 1 | 2 | 3;

export enum Terrain {
  Grass,
  Water,
  Forest,
}

export interface Tile {
  zone: Zone;
  /** Natural ground cover; structures require Grass. */
  terrain: Terrain;
  stage: Stage;
  /** Zoned density (R/C/I): caps development at stage 3 / 5 / 7. */
  density: Density;
  powered: boolean;
  abandoned: boolean;
  /** Power line strung over a road tile (lines elsewhere use Zone.PowerLine). */
  wire: boolean;
  /** Service coverage 0..1 from powered stations, refreshed by the sim. */
  fireCov: number;
  policeCov: number;
  schoolCov: number;
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

export interface CityState {
  version: 1;
  seed: number;
  tiles: Tile[]; // GRID * GRID, row-major
  funds: number;
  tick: number;
  month: number; // months since Jan 2000
  demand: Demand;
  taxes: Taxes;
  population: number;
  jobs: number;
  lastBudget: BudgetReport;
  /** Event messages (fires, etc.) queued for the UI; newest last, capped. */
  notices: string[];
  /** Monthly samples for the charts panel, newest last, capped at HISTORY_MAX. */
  history: { pop: number[]; funds: number[] };
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
  | 'terraWater'
  | 'terraForest'
  | 'terraGrass'
  | 'bulldoze';

export const COSTS: Record<ToolId, number> = {
  road: 10,
  zoneR: 5,
  zoneC: 5,
  zoneI: 5,
  plant: 3000,
  line: 5,
  park: 50,
  fire: 500,
  police: 500,
  school: 400,
  terraWater: 25,
  terraForest: 10,
  terraGrass: 5,
  bulldoze: 1,
};

/** Coverage radii (Chebyshev tiles) per service. */
export const SERVICE_RADII = { fire: 8, police: 8, school: 10 };
/** Monthly upkeep per service building. */
export const SERVICE_UPKEEP = { fire: 50, police: 50, school: 40 };
/** Monthly burn-down probability for a developed tile with zero fire coverage. */
export const FIRE_RISK = 0.004;

export const START_FUNDS = 50_000;
export const DEFAULT_TAX = 0.09;
export const TICKS_PER_MONTH = 8;
