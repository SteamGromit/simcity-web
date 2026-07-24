/**
 * Schemas for authored content. This module is the bottom layer: it must not
 * import from src/sim or src/render, so a pack can be described without
 * pulling in the simulation.
 */

import type { ModifierKey } from './modifiers';

/** Non-core buildings allocate runtime slots from here upward. */
export const MOD_SLOT_BASE = 1000;

/** Context keys an unlock expression may reference. */
export const UNLOCK_CONTEXT_KEYS = [
  'population',
  'funds',
  'jobs',
  'month',
  'year',
  'eduLevel',
  'demandR',
  'demandC',
  'demandI',
  'brownouts',
] as const;

export type ServiceKind = 'fire' | 'police' | 'school' | 'health' | 'bus';

export interface UnlockDef {
  /** Expression over UNLOCK_CONTEXT_KEYS; truthy means available. */
  expr: string;
  /** Human phrasing for the UI, e.g. "pop 2,000". */
  label: string;
}

/** Roof shapes an authored building may wear (mirrors the renderer's RoofStyle). */
export const BUILDING_ROOFS = ['flat', 'parapet', 'gabled', 'sawtooth'] as const;
export type BuildingRoof = (typeof BUILDING_ROOFS)[number];

/** Rooftop details an authored building may wear. */
export const BUILDING_PROPS = [
  'waterTower',
  'acUnit',
  'antenna',
  'chimney',
  'vent',
  'tank',
  'smokestack',
] as const;
export type BuildingProp = (typeof BUILDING_PROPS)[number];

/** Most rooftop props one authored building may carry. */
export const MAX_BUILDING_PROPS = 3;

/**
 * How an authored building looks. Declarative rather than drawn: the renderer
 * composes the same isometric primitives core buildings use, so an authored
 * building inherits skins, day/night, and zoom LOD for free. Core buildings
 * define no `visual` — they keep their bespoke draw code.
 */
export interface VisualDef {
  /** Share of the tile the mass covers, 0.3..1. */
  footprint: number;
  /** Height in px before the skin's heightScale, 6..60. */
  height: number;
  hue: number;
  sat: number;
  light: number;
  roof: BuildingRoof;
  props: BuildingProp[];
}

export interface BuildingDef {
  /** Stable identity, namespaced for non-core packs: "core:coal_plant". */
  id: string;
  /** Pinned runtime slot (the Zone number). Core content must declare it. */
  slot?: number;
  name: string;
  /** Toolbar tool that places it; omitted for wizard-placed content. */
  tool?: string;
  cost: number;
  /** Monthly upkeep. */
  upkeep: number;
  unlock?: UnlockDef;
  power?: { capacity: number; pollution: number };
  service?: { kind: ServiceKind; radius: number; share?: number };
  transit?: { radius: number; share: number };
  siting?: { needsWater?: boolean };
  /** Present ⇒ the generic renderer draws this building from the spec. */
  visual?: VisualDef;
}

export interface OrdinanceDef {
  /** Core ids are pinned to their historic strings — saves store them. */
  id: string;
  label: string;
  blurb: string;
  /** Monthly cost while enacted. */
  cost: number;
  effects: Partial<Record<ModifierKey, number>>;
}

export type HueTransform = { mode: 'identity' } | { mode: 'wrap'; base: number; span: number };

export interface SkinDef {
  id: string;
  label: string;
  blurb: string;
  hue: HueTransform;
  sat: { mul?: number; add?: number };
  light: { mul?: number; add?: number };
  outline: number;
  heightScale: number;
  grassSat: number;
  roadFill: string;
}

export interface Pack {
  /** Package identity; "core" is reserved for the game's own content. */
  id: string;
  name: string;
  version: string;
  buildings?: BuildingDef[];
  ordinances?: OrdinanceDef[];
  skins?: SkinDef[];
}
