import { idx } from './grid';
import { roadAccess } from './traffic';
import { CityState, Tile, Zone } from './types';

const GROW_SCALE = 0.6;
const DECAY_CHANCE = 0.35;
const DEMAND_COLLAPSE = -0.3;
/** Land value required to reach stage 2 / stage 3 (R and C only). */
const LV_GATES = [0, 0, 0.35, 0.55];

function desirability(t: Tile): number {
  const jobAccess = 1 - Math.min(1, t.commute / 30);
  const services = (t.fireCov + t.policeCov + t.schoolCov) / 3;
  switch (t.zone) {
    case Zone.Residential:
      return 0.7 * t.landValue + 0.3 * jobAccess + 0.12 * services;
    case Zone.Commercial:
      return 0.5 * t.landValue + 0.5 * jobAccess + 0.12 * services;
    case Zone.Industrial:
      return 0.45 + 0.2 * (1 - Math.min(1, t.commute / 40)) + 0.05 * t.fireCov;
    default:
      return 0;
  }
}

/** Service coverage required before a building may reach `next` stage. */
function servicesAllow(t: Tile, next: number): boolean {
  if (next >= 2 && t.fireCov <= 0) return false;
  if (next >= 3) {
    if (t.policeCov <= 0) return false;
    if (t.zone !== Zone.Industrial && t.schoolCov <= 0) return false;
  }
  return true;
}

function sectorDemand(city: CityState, zone: Zone): number {
  if (zone === Zone.Residential) return city.demand.r;
  if (zone === Zone.Commercial) return city.demand.c;
  return city.demand.i;
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

  const eligible = t.powered && roadAccess(city, x, y) !== null;
  const demand = sectorDemand(city, t.zone);

  if (eligible && demand > 0) {
    const p = demand * desirability(t) * GROW_SCALE;
    if (rand() < p) {
      if (t.abandoned) {
        t.abandoned = false;
        t.stage = 1;
      } else if (t.stage === 0) {
        t.stage = 1;
      } else if (t.stage < 3) {
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
