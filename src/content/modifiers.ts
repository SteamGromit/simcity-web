/**
 * The fixed vocabulary of tuning knobs authored content may set. Content
 * cannot invent a knob: the sim has to read it, so adding one is a code
 * change here plus a read at the call site. Validation rejects unknown keys,
 * which turns a typo in a pack into a load error instead of silence.
 */

export const MODIFIER_KEYS = [
  'pollution.industry',
  'pollution.traffic',
  'fire.ignition',
  'transit.share',
  'coverage.school',
  'disaster.pandemicOdds',
  'disaster.pandemicToll',
  'garbage.production',
  'crime.rate',
  'accident.rate',
  'accident.duration',
] as const;

export type ModifierKey = (typeof MODIFIER_KEYS)[number];

export type ModifierSet = Partial<Record<ModifierKey, number>>;

/** Every knob at 1 — the identity for multiplicative accumulation. */
export function neutralModifiers(): Record<ModifierKey, number> {
  const out = {} as Record<ModifierKey, number>;
  for (const k of MODIFIER_KEYS) out[k] = 1;
  return out;
}

/** Accumulate sets multiplicatively; absent keys leave the knob untouched. */
export function combineModifiers(sets: readonly ModifierSet[]): Record<ModifierKey, number> {
  const out = neutralModifiers();
  for (const set of sets) {
    for (const k of MODIFIER_KEYS) {
      const v = set[k];
      if (v !== undefined) out[k] *= v;
    }
  }
  return out;
}

export function isModifierKey(v: string): v is ModifierKey {
  return (MODIFIER_KEYS as readonly string[]).includes(v);
}
