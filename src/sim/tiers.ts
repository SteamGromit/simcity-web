import {
  C_JOBS,
  CityState,
  I_JOBS,
  IndustryKind,
  R_POP,
  Stage,
  Tier,
  Tile,
  Wealth,
  Zone,
} from './types';

export const INDUSTRY_KINDS: readonly IndustryKind[] = ['ag', 'dirty', 'manu', 'tech'];

/** Neutral tiers carry 1.0 multipliers, so an un-tiered tile behaves as it always has. */
const NEUTRAL_WEALTH: Wealth = 2;
const NEUTRAL_KIND: IndustryKind = 'manu';

function isIndustryKind(tier: Tier): tier is IndustryKind {
  return typeof tier === 'string';
}

function isRC(zone: Zone): boolean {
  return zone === Zone.Residential || zone === Zone.Commercial;
}

/**
 * One Tile.tier field carries two different unions, so every read
 * normalizes first. A mismatched tier — from an old save, or a lot
 * bulldozed and rezoned to another use — collapses to the neutral
 * member of the zone's own union rather than poisoning a lookup.
 */
export function normalizeTier(zone: Zone, tier: Tier): Tier {
  if (zone === Zone.Industrial) {
    return isIndustryKind(tier) ? tier : NEUTRAL_KIND;
  }
  if (isRC(zone)) {
    return isIndustryKind(tier) ? NEUTRAL_WEALTH : tier;
  }
  return tier;
}

/** Capacity multipliers. Capacity and yield pull in opposite directions
 * so that no tier is strictly better than another. */
const WEALTH_CAPACITY: Record<Wealth, number> = { 1: 1.15, 2: 1.0, 3: 0.75 };
const C_WEALTH_CAPACITY: Record<Wealth, number> = { 1: 1.1, 2: 1.0, 3: 0.8 };
const KIND_CAPACITY: Record<IndustryKind, number> = {
  ag: 0.45,
  dirty: 1.15,
  manu: 1.0,
  tech: 0.8,
};

const WEALTH_YIELD: Record<Wealth, number> = { 1: 0.75, 2: 1.0, 3: 1.7 };
const C_WEALTH_YIELD: Record<Wealth, number> = { 1: 0.8, 2: 1.0, 3: 1.6 };
const KIND_YIELD: Record<IndustryKind, number> = {
  ag: 0.6,
  dirty: 0.85,
  manu: 1.0,
  tech: 1.75,
};

const KIND_POLLUTION: Record<IndustryKind, number> = {
  ag: 0.1,
  dirty: 1.6,
  manu: 1.0,
  tech: 0.25,
};

/** People (R) or jobs (C/I) a developed lot holds, tier-scaled. */
export function capacityFor(zone: Zone, tier: Tier, stage: Stage): number {
  const t = normalizeTier(zone, tier);
  if (zone === Zone.Residential) {
    return Math.round(R_POP[stage] * WEALTH_CAPACITY[t as Wealth]);
  }
  if (zone === Zone.Commercial) {
    return Math.round(C_JOBS[stage] * C_WEALTH_CAPACITY[t as Wealth]);
  }
  if (zone === Zone.Industrial) {
    return Math.round(I_JOBS[stage] * KIND_CAPACITY[t as IndustryKind]);
  }
  return 0;
}

/** Per-occupant monthly tax yield multiplier, applied over the base R/C/I yields. */
export function taxYieldFor(zone: Zone, tier: Tier): number {
  const t = normalizeTier(zone, tier);
  if (zone === Zone.Residential) return WEALTH_YIELD[t as Wealth];
  if (zone === Zone.Commercial) return C_WEALTH_YIELD[t as Wealth];
  if (zone === Zone.Industrial) return KIND_YIELD[t as IndustryKind];
  return 0;
}

/** Emission multiplier for an industrial lot. */
export function pollutionScaleFor(tier: Tier): number {
  return KIND_POLLUTION[(typeof tier === 'string' ? tier : NEUTRAL_KIND)];
}

/** Land value needed for each wealth, with a pollution ceiling that stops a
 * well-parked lot downwind of a refinery from reading as affluent. */
const WEALTH_GATES = [
  { lv: 0.62, maxPollution: 0.15, wealth: 3 as Wealth },
  { lv: 0.42, maxPollution: 0.35, wealth: 2 as Wealth },
];
/** City-wide education needed for each industry kind. */
const TECH_EDU = 0.55;
const TECH_MAX_POLLUTION = 0.3;
const MANU_EDU = 0.3;

/**
 * Share of developed residential lots within reach of a school. Education is
 * a property of the city's workforce, not of a factory's own lot — computing
 * it per-tile would let one school beside an industrial park conjure a tech
 * corridor out of nothing.
 */
export function updateEducation(city: CityState): void {
  let developed = 0;
  let covered = 0;
  for (const t of city.tiles) {
    if (t.zone !== Zone.Residential || t.stage === 0 || t.abandoned) continue;
    developed++;
    if (t.schoolCov > 0) covered++;
  }
  city.eduLevel = developed === 0 ? 0 : covered / developed;
}

/**
 * The subtype local conditions call for. Pure: reads only fields the sim
 * already maintains, so it can be re-asked any time without side effects.
 */
export function chooseTier(city: CityState, tile: Tile): Tier {
  if (tile.zone === Zone.Industrial) {
    if (tile.density === 1) return 'ag'; // player-chosen farmland
    if (city.eduLevel >= TECH_EDU && tile.pollution < TECH_MAX_POLLUTION) return 'tech';
    if (city.eduLevel >= MANU_EDU) return 'manu';
    return 'dirty';
  }
  if (isRC(tile.zone)) {
    for (const gate of WEALTH_GATES) {
      if (tile.landValue >= gate.lv && tile.pollution < gate.maxPollution) return gate.wealth;
    }
    return 1;
  }
  return normalizeTier(tile.zone, tile.tier);
}
