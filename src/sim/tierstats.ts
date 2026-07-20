import { capacityFor, normalizeTier } from './tiers';
import { CityState, IndustryKind, Tier, Wealth, Zone } from './types';

const WEALTH_LABELS: Record<Wealth, string> = { 1: '§', 2: '§§', 3: '§§§' };
const KIND_LABELS: Record<IndustryKind, string> = {
  ag: 'agricultural',
  dirty: 'dirty',
  manu: 'manufacturing',
  tech: 'high-tech',
};

/** Human-readable tier name for the query panel and City Hall. */
export function tierLabel(zone: Zone, tier: Tier): string {
  const t = normalizeTier(zone, tier);
  if (zone === Zone.Industrial) return KIND_LABELS[t as IndustryKind];
  return WEALTH_LABELS[t as Wealth];
}

export interface TierBreakdown {
  wealth: Record<Wealth, number>; // residents by wealth
  industry: Record<IndustryKind, number>; // industrial jobs by kind
}

/** Where the city's people and industrial jobs actually sit. */
export function tierBreakdown(city: CityState): TierBreakdown {
  const out: TierBreakdown = {
    wealth: { 1: 0, 2: 0, 3: 0 },
    industry: { ag: 0, dirty: 0, manu: 0, tech: 0 },
  };
  for (const t of city.tiles) {
    if (t.stage === 0 || t.abandoned) continue;
    const cap = capacityFor(t.zone, t.tier, t.stage);
    const tier = normalizeTier(t.zone, t.tier);
    if (t.zone === Zone.Residential) out.wealth[tier as Wealth] += cap;
    else if (t.zone === Zone.Industrial) out.industry[tier as IndustryKind] += cap;
  }
  return out;
}
