import { sumCapacities } from './capacity';
import { CityState } from './types';

const WORKFORCE_FRACTION = 0.55;
const NEUTRAL_TAX = 0.09;

function clamp1(v: number): number {
  return Math.max(-1, Math.min(1, v));
}

function taxAdjust(raw: number, tax: number): number {
  return clamp1(raw - Math.max(0, tax - NEUTRAL_TAX) * 6 + Math.max(0, NEUTRAL_TAX - tax) * 1.5);
}

/**
 * Global RCI demand. Residents chase jobs, commerce chases customers,
 * industry chases an external market that grows with time. Taxes above the
 * neutral rate suppress demand; cuts below it give a smaller boost.
 * Also recomputes population and job totals from developed tiles.
 */
export function updateDemand(city: CityState): void {
  const { population, cJobs, iJobs, civicJobs } = sumCapacities(city);
  city.population = population;
  // Reward buildings employ people directly, so they feed residential demand
  // like any other employer — but they are nobody's commerce or industry, and
  // so leave the C and I sector balances alone.
  city.jobs = cJobs + iJobs + civicJobs;

  const workforce = population * WORKFORCE_FRACTION;
  const extMarket = Math.min(400, 30 + city.month * 2);

  // A neighbour joined to this city by road is part of its economy: its jobs
  // draw residents here, and its workers shop and work here. The region hands
  // over a share of each (see sim/region.ts) — this is what makes a bedroom
  // suburb beside an industrial city grow at all.
  const nearJobs = city.neighbors.jobs;
  const nearWorkers = city.neighbors.workers;
  const reach = workforce + nearWorkers;

  const rRaw = ((city.jobs + nearJobs) * 1.15 + 16 - workforce) / Math.max(40, workforce);
  const cRaw = (reach * 0.35 - cJobs) / Math.max(30, cJobs * 1.5);
  const iRaw = (extMarket + reach * 0.5 - iJobs) / Math.max(60, iJobs);

  city.demand = {
    r: taxAdjust(rRaw, city.taxes.r),
    c: taxAdjust(cRaw, city.taxes.c),
    i: taxAdjust(iRaw, city.taxes.i),
  };
}
