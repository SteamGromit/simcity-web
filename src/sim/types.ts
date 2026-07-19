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
  Hospital,
  BusStop,
  WaterPump,
  WaterPipe,
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
  /** Natural ground cover; structures require Grass (roads may bridge Water). */
  terrain: Terrain;
  /** Ground height 0..MAX_ELEV; the whole tile sits at one level. */
  elevation: number;
  stage: Stage;
  /** Zoned density (R/C/I): caps development at stage 3 / 5 / 7. */
  density: Density;
  powered: boolean;
  /** Connected to a working water pump; stages 3+ require it. */
  watered: boolean;
  abandoned: boolean;
  /** Power line strung over a road tile (lines elsewhere use Zone.PowerLine). */
  wire: boolean;
  /** Water main under a road tile (pipes elsewhere use Zone.WaterPipe). */
  pipe: boolean;
  /** Service coverage 0..1 from powered stations, refreshed by the sim. */
  fireCov: number;
  policeCov: number;
  schoolCov: number;
  healthCov: number;
  busCov: number;
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

export type OrdinanceId = 'cleanAir' | 'freeBus' | 'fireCode' | 'eduGrant';

export interface Ordinance {
  id: OrdinanceId;
  label: string;
  blurb: string;
  /** Monthly cost while enacted. */
  cost: number;
}

export const ORDINANCES: Ordinance[] = [
  {
    id: 'cleanAir',
    label: 'Clean Air Act',
    blurb: 'Scrubbers and emission checks: industry and traffic pollute 30% less.',
    cost: 100,
  },
  {
    id: 'freeBus',
    label: 'Free Bus Service',
    blurb: 'Fare-free transit: bus-served commutes put only a quarter of the cars on the road.',
    cost: 150,
  },
  {
    id: 'fireCode',
    label: 'Fire Safety Code',
    blurb: 'Inspections and sprinklers: buildings are half as likely to catch fire.',
    cost: 80,
  },
  {
    id: 'eduGrant',
    label: 'Education Grant',
    blurb: 'Extra school funding: school coverage counts 25% stronger across its reach.',
    cost: 120,
  },
];

export function defaultOrdinances(): Record<OrdinanceId, boolean> {
  return { cleanAir: false, freeBus: false, fireCode: false, eduGrant: false };
}

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
  lastBudget: BudgetReport;
  /** Enacted city policies; each charges monthly and tweaks the sim. */
  ordinances: Record<OrdinanceId, boolean>;
  /** Active disasters (spawned randomly or summoned from City Hall). */
  disasters: Disasters;
  /** Current weather; visual plus light sim effects (fire, traffic). */
  weather: import('./weather').Weather;
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
  | 'hospital'
  | 'bus'
  | 'pump'
  | 'pipe'
  | 'terraWater'
  | 'terraForest'
  | 'terraGrass'
  | 'terraRaise'
  | 'terraLower'
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
  hospital: 600,
  bus: 150,
  pump: 300,
  pipe: 5,
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
export const SERVICE_RADII = { fire: 8, police: 8, school: 10, health: 10, bus: 5 };
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
