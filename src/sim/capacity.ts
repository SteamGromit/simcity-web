import { buildingBySlot } from '../content/registry';
import { isBody } from './footprint';
import { capacityFor } from './tiers';
import { CityState, Zone } from './types';

export interface Capacities {
  population: number;
  cJobs: number;
  iJobs: number;
  /** Jobs from buildings that provide them directly — rewards, mostly. */
  civicJobs: number;
}

/** Developed, non-abandoned capacity totals — the city's people and jobs. */
export function sumCapacities(city: CityState): Capacities {
  let population = 0;
  let cJobs = 0;
  let iJobs = 0;
  let civicJobs = 0;
  for (let i = 0; i < city.tiles.length; i++) {
    const t = city.tiles[i];
    // A reward employs people the moment it is built — it does not develop
    // through stages the way a zoned lot does. Counted from the anchor only,
    // so a five-by-five university is one employer rather than twenty-five.
    if (!isBody(t, i)) {
      const jobs = buildingBySlot(t.zone)?.jobs;
      if (jobs) civicJobs += jobs;
    }
    if (t.stage === 0 || t.abandoned) continue;
    const cap = capacityFor(t.zone, t.tier, t.stage);
    if (t.zone === Zone.Residential) population += cap;
    else if (t.zone === Zone.Commercial) cJobs += cap;
    else if (t.zone === Zone.Industrial) iJobs += cap;
  }
  return { population, cJobs, iJobs, civicJobs };
}
