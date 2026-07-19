import { CityState, C_JOBS, I_JOBS, R_POP, Zone } from './types';

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
    if (t.zone === Zone.Residential) population += R_POP[t.stage];
    else if (t.zone === Zone.Commercial) cJobs += C_JOBS[t.stage];
    else if (t.zone === Zone.Industrial) iJobs += I_JOBS[t.stage];
  }
  return { population, cJobs, iJobs };
}
