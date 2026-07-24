import { idx } from './grid';
import { chooseTier } from './tiers';
import { roadAccess } from './traffic';
import { CityState, MAX_STAGE_BY_DENSITY, Tile, Zone } from './types';

const GROW_SCALE = 0.6;
const DECAY_CHANCE = 0.35;
const DEMAND_COLLAPSE = -0.3;
/** Land value required to reach each stage (R and C only). */
const LV_GATES = [0, 0, 0.35, 0.5, 0.55, 0.62, 0.68, 0.75];
/** Coverage floor for high-density stages (4+). */
const HIGH_STAGE_COV = 0.2;

function desirability(t: Tile): number {
  const jobAccess = 1 - Math.min(1, t.commute / 30);
  const services = (t.fireCov + t.policeCov + t.schoolCov) / 3;
  // Nobody wants to move in next to a heap, over and above what it has
  // already done to the land value.
  const refuse = 0.25 * t.garbage;
  switch (t.zone) {
    case Zone.Residential:
      return Math.max(0,
        0.7 * t.landValue + 0.3 * jobAccess + 0.12 * services + 0.06 * t.healthCov +
        0.04 * t.busCov - refuse,
      );
    case Zone.Commercial:
      return Math.max(0, 0.5 * t.landValue + 0.5 * jobAccess + 0.12 * services - refuse);
    case Zone.Industrial:
      return 0.45 + 0.2 * (1 - Math.min(1, t.commute / 40)) + 0.05 * t.fireCov;
    default:
      return 0;
  }
}

/** Service coverage required before a building may reach `next` stage. */
function servicesAllow(t: Tile, next: number): boolean {
  if (next >= 2 && t.fireCov <= 0) return false;
  if (next >= 3 && !t.watered) return false; // wells only carry a building so far
  if (next >= 3) {
    if (t.policeCov <= 0) return false;
    if (t.zone !== Zone.Industrial && t.schoolCov <= 0) return false;
  }
  if (next >= 4) {
    if (t.fireCov <= HIGH_STAGE_COV || t.policeCov <= HIGH_STAGE_COV) return false;
    if (t.zone !== Zone.Industrial && t.schoolCov <= HIGH_STAGE_COV) return false;
  }
  // density past a point means refuse nobody can ignore: a block only builds
  // up if something is coming to take the bins away
  if (next >= 4 && t.garbageCov <= 0) return false;
  // towers need a hospital in reach (industry exempt, as with schools)
  if (next >= 5 && t.zone !== Zone.Industrial && t.healthCov <= 0) return false;
  return true;
}

function sectorDemand(city: CityState, zone: Zone): number {
  if (zone === Zone.Residential) return city.demand.r;
  if (zone === Zone.Commercial) return city.demand.c;
  return city.demand.i;
}

/** What the Demand data view shows for one tile. */
export interface DemandReading {
  /** Grow-roll probability for this sweep (0 when blocked or demand ≤ 0). */
  pressure: number;
  /** Tile cannot develop: unpowered or no road within reach. */
  blocked: boolean;
  /** Sector demand sits below the abandonment threshold. */
  collapsing: boolean;
}

/** Growth pressure the development sweep applies at (x, y); null off-RCI. */
export function demandReading(city: CityState, x: number, y: number): DemandReading | null {
  const t = city.tiles[idx(x, y)];
  if (t.zone !== Zone.Residential && t.zone !== Zone.Commercial && t.zone !== Zone.Industrial) {
    return null;
  }
  const demand = sectorDemand(city, t.zone);
  const blocked = !t.powered || roadAccess(city, x, y) === null;
  return {
    pressure: blocked || demand <= 0 ? 0 : demand * desirability(t) * GROW_SCALE,
    blocked,
    collapsing: demand < DEMAND_COLLAPSE,
  };
}

/**
 * The heart of the simulation: one zoned tile either constructs, grows,
 * holds, downgrades, or abandons based on demand and desirability. Called
 * round-robin across the grid so change ripples through the city over time.
 */
export function developTile(city: CityState, x: number, y: number, rand: () => number): void {
  const t = city.tiles[idx(x, y)];
  if (t.zone !== Zone.Residential && t.zone !== Zone.Commercial && t.zone !== Zone.Industrial) {
    return;
  }
  if (t.burning > 0) return; // fire consumes the tile; no growth or decay mid-blaze
  if (t.rubble > 0) return; // debris blocks the lot until crews clear it

  const eligible = t.powered && roadAccess(city, x, y) !== null;
  const demand = sectorDemand(city, t.zone);

  if (eligible && demand > 0) {
    const p = demand * desirability(t) * GROW_SCALE;
    if (rand() < p) {
      if (t.abandoned) {
        t.abandoned = false;
        t.stage = 1;
        t.tier = chooseTier(city, t);
      } else if (t.stage === 0) {
        t.stage = 1;
        t.tier = chooseTier(city, t);
      } else if (t.stage < MAX_STAGE_BY_DENSITY[t.density]) {
        const next = t.stage + 1;
        const lvGated = t.zone !== Zone.Industrial && t.landValue < LV_GATES[next];
        if (!lvGated && servicesAllow(t, next)) t.stage = next as Tile['stage'];
      }
    }
    return;
  }

  if (t.stage > 0 && !t.abandoned && (!eligible || demand < DEMAND_COLLAPSE)) {
    if (rand() < DECAY_CHANCE) {
      if (t.stage > 1) t.stage = (t.stage - 1) as Tile['stage'];
      else t.abandoned = true;
    }
  }
}
