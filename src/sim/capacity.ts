import { capacityFor } from './tiers';
import { CityState, Zone } from './types';

export interface Capacities {
  population: number;
  cJobs: number;
  iJobs: number;
}

/** Developed, non-abandoned capacity totals — the city's people and jobs. */
export function sumCapacities(city: CityState): Capacities {
  let population = 0;
  let cJobs = 0;
  let iJobs = 0;
  for (const t of city.tiles) {
    if (t.stage === 0 || t.abandoned) continue;
    const cap = capacityFor(t.zone, t.tier, t.stage);
    if (t.zone === Zone.Residential) population += cap;
    else if (t.zone === Zone.Commercial) cJobs += cap;
    else if (t.zone === Zone.Industrial) iJobs += cap;
  }
  return { population, cJobs, iJobs };
}
