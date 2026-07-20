import { capacityFor, taxYieldFor } from './tiers';
import { BudgetReport, CityState, ORDINANCES, SERVICE_UPKEEP, Zone } from './types';

const R_YIELD = 10;
const C_YIELD = 16;
const I_YIELD = 14;
const UPKEEP = { road: 1, line: 0.2, plant: 150, park: 2, pump: 25, pipe: 0.2 };

/** Monthly close: collect taxes on developed capacity, pay upkeep, move funds. */
export function collectBudget(city: CityState): BudgetReport {
  let expenses = 0;
  let rIncome = 0;
  let cIncome = 0;
  let iIncome = 0;

  for (const t of city.tiles) {
    if (t.stage > 0 && !t.abandoned) {
      const cap = capacityFor(t.zone, t.tier, t.stage);
      if (t.zone === Zone.Residential) {
        rIncome += cap * city.taxes.r * R_YIELD * taxYieldFor(t.zone, t.tier);
      } else if (t.zone === Zone.Commercial) {
        cIncome += cap * city.taxes.c * C_YIELD * taxYieldFor(t.zone, t.tier);
      } else if (t.zone === Zone.Industrial) {
        iIncome += cap * city.taxes.i * I_YIELD * taxYieldFor(t.zone, t.tier);
      }
    }

    switch (t.zone) {
      case Zone.Road:
        expenses += UPKEEP.road;
        if (t.wire) expenses += UPKEEP.line;
        if (t.pipe) expenses += UPKEEP.pipe;
        break;
      case Zone.PowerLine:
        expenses += UPKEEP.line;
        break;
      case Zone.WaterPump:
        expenses += UPKEEP.pump;
        break;
      case Zone.WaterPipe:
        expenses += UPKEEP.pipe;
        break;
      case Zone.PowerPlant:
        expenses += UPKEEP.plant;
        break;
      case Zone.Park:
        expenses += UPKEEP.park;
        break;
      case Zone.FireStation:
        expenses += SERVICE_UPKEEP.fire;
        break;
      case Zone.PoliceStation:
        expenses += SERVICE_UPKEEP.police;
        break;
      case Zone.School:
        expenses += SERVICE_UPKEEP.school;
        break;
      case Zone.Hospital:
        expenses += SERVICE_UPKEEP.health;
        break;
      case Zone.BusStop:
        expenses += SERVICE_UPKEEP.bus;
        break;
    }
  }

  for (const o of ORDINANCES) {
    if (city.ordinances[o.id]) expenses += o.cost;
  }

  const report: BudgetReport = {
    rIncome: Math.round(rIncome),
    cIncome: Math.round(cIncome),
    iIncome: Math.round(iIncome),
    expenses: Math.round(expenses),
    net: 0,
  };
  report.net = report.rIncome + report.cIncome + report.iIncome - report.expenses;
  city.funds += report.net;
  city.lastBudget = report;
  return report;
}
