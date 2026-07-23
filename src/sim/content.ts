/**
 * The seam between the simulation and the content registry. Everything that
 * needs a CityState lives here, so src/content stays free of any dependency
 * on the sim and can be reasoned about (and tested) on its own.
 */

import { CORE_PACK } from '../content/packs/core';
import type { ExprContext } from '../content/expr';
import { combineModifiers, type ModifierKey, type ModifierSet } from '../content/modifiers';
import { allOrdinances, allBuildings, registerPack } from '../content/registry';
import type { BuildingDef } from '../content/types';
import { unlockExpr } from '../content/registry';
import type { CityState } from './types';

/** Register the game's own content once. Safe to call repeatedly. */
export function ensureCoreContent(): void {
  if (allBuildings().length > 0) return;
  const r = registerPack(CORE_PACK);
  if (!r.ok) throw new Error(`core pack failed validation:\n${r.errors.join('\n')}`);
}

/** The city scalars an unlock expression may read. Keys must match UNLOCK_CONTEXT_KEYS. */
export function unlockContext(city: CityState): ExprContext {
  return {
    population: city.population,
    funds: city.funds,
    jobs: city.jobs,
    month: city.month,
    year: 2000 + Math.floor(city.month / 12),
    eduLevel: city.eduLevel,
    demandR: city.demand.r,
    demandC: city.demand.c,
    demandI: city.demand.i,
    brownouts: city.brownouts,
  };
}

/** No unlock means always available. */
export function unlockedFor(def: BuildingDef, city: CityState): boolean {
  if (!def.unlock) return true;
  const expr = unlockExpr(def.id);
  if (!expr) return true;
  return expr.eval(unlockContext(city)) !== 0;
}

/** Product of every enacted ordinance's value for this knob; 1 when none apply. */
export function modifier(city: CityState, key: ModifierKey): number {
  const sets: ModifierSet[] = [];
  // OrdinanceDef.id is a plain string (packs mint their own ids) while
  // city.ordinances is still keyed by the fixed OrdinanceId union — Task 9
  // widens that type. Cast here rather than at the CityState boundary so
  // this stays the one place that knows about the mismatch.
  const enacted = city.ordinances as Record<string, boolean>;
  for (const o of allOrdinances()) {
    if (enacted[o.id]) sets.push(o.effects);
  }
  return combineModifiers(sets)[key];
}
