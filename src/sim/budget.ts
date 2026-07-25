import { buildingBySlot, allOrdinances } from '../content/registry';
import { isBody } from './footprint';
import { ROAD_CLASSES } from './roads';
import { capacityFor, taxYieldFor } from './tiers';
import { BudgetReport, CityState, Zone } from './types';

const R_YIELD = 10;
const C_YIELD = 16;
const I_YIELD = 14;

/** Monthly close: collect taxes on developed capacity, pay upkeep, move funds. */
export function collectBudget(city: CityState): BudgetReport {
  let expenses = 0;
  let rIncome = 0;
  let cIncome = 0;
  let iIncome = 0;

  for (let i = 0; i < city.tiles.length; i++) {
    const t = city.tiles[i];
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

    const def = buildingBySlot(t.zone);
    // wires and mains ride on road tiles, so they are flags rather than zones;
    // a wider road costs proportionally more to keep swept and resurfaced
    if (t.zone === Zone.Road) {
      expenses += (def?.upkeep ?? 0) * ROAD_CLASSES[t.road].upkeepMult;
      if (t.wire) expenses += buildingBySlot(Zone.PowerLine)?.upkeep ?? 0;
      if (t.pipe) expenses += buildingBySlot(Zone.WaterPipe)?.upkeep ?? 0;
    } else if (def && !isBody(t, i)) {
      // a block pays one upkeep, not one per tile of ground it stands on
      expenses += def.upkeep;
    }
  }

  for (const o of allOrdinances()) {
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
