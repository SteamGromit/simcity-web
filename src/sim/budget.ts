import { sumCapacities } from './capacity';
import { BudgetReport, CityState, Zone } from './types';

const R_YIELD = 10;
const C_YIELD = 16;
const I_YIELD = 14;
const UPKEEP = { road: 1, line: 0.2, plant: 150, park: 2 };

/** Monthly close: collect taxes on developed capacity, pay upkeep, move funds. */
export function collectBudget(city: CityState): BudgetReport {
  const { population, cJobs, iJobs } = sumCapacities(city);
  let expenses = 0;

  for (const t of city.tiles) {
    switch (t.zone) {
      case Zone.Road:
        expenses += UPKEEP.road;
        break;
      case Zone.PowerLine:
        expenses += UPKEEP.line;
        break;
      case Zone.PowerPlant:
        expenses += UPKEEP.plant;
        break;
      case Zone.Park:
        expenses += UPKEEP.park;
        break;
    }
  }

  const report: BudgetReport = {
    rIncome: Math.round(population * city.taxes.r * R_YIELD),
    cIncome: Math.round(cJobs * city.taxes.c * C_YIELD),
    iIncome: Math.round(iJobs * city.taxes.i * I_YIELD),
    expenses: Math.round(expenses),
    net: 0,
  };
  report.net = report.rIncome + report.cIncome + report.iIncome - report.expenses;
  city.funds += report.net;
  city.lastBudget = report;
  return report;
}
