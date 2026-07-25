/**
 * The seam between the simulation and the content registry. Everything that
 * needs a CityState lives here, so src/content stays free of any dependency
 * on the sim and can be reasoned about (and tested) on its own.
 */

import { CORE_PACK } from '../content/packs/core';
import type { ExprContext } from '../content/expr';
import { combineModifiers, type ModifierKey, type ModifierSet } from '../content/modifiers';
import { allOrdinances, allBuildings, registerPack } from '../content/registry';
import { CIVIC_GRANTS, type BuildingDef, type CivicGrant } from '../content/types';
import { unlockExpr } from '../content/registry';
import type { CityState } from './types';

/** Register the game's own content once. Safe to call repeatedly. */
export function ensureCoreContent(): void {
  if (allBuildings().length > 0) return;
  const r = registerPack(CORE_PACK);
  if (!r.ok) throw new Error(`core pack failed validation:\n${r.errors.join('\n')}`);
}

/**
 * Which civic capabilities the city currently has, by virtue of something
 * standing that confers them. Recomputed on demand rather than cached: a
 * building can be bulldozed, and the thing it unlocked should lock again.
 */
export function civicGrants(city: CityState): Set<CivicGrant> {
  const out = new Set<CivicGrant>();
  const granted = new Map<number, CivicGrant[]>();
  for (const b of allBuildings()) {
    if (b.grants?.length && b.slot !== undefined) granted.set(b.slot, b.grants);
  }
  if (granted.size === 0) return out;
  for (const t of city.tiles) {
    const g = granted.get(t.zone);
    if (g) for (const k of g) out.add(k);
  }
  return out;
}

/** The city scalars an unlock expression may read. Keys must match UNLOCK_CONTEXT_KEYS. */
export function unlockContext(city: CityState): ExprContext {
  const grants = civicGrants(city);
  const ctx: ExprContext = {
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
  // each grant reads as 1 while something confers it, else 0
  for (const key of CIVIC_GRANTS) ctx[key] = grants.has(key) ? 1 : 0;
  return ctx;
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
  for (const o of allOrdinances()) {
    if (city.ordinances[o.id]) sets.push(o.effects);
  }
  return combineModifiers(sets)[key];
}

/** Every registered ordinance, off by default. */
export function defaultOrdinances(): Record<string, boolean> {
  ensureCoreContent();
  return Object.fromEntries(allOrdinances().map((o) => [o.id, false]));
}
