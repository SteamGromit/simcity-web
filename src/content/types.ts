/**
 * Schemas for authored content. This module is the bottom layer: it must not
 * import from src/sim or src/render, so a pack can be described without
 * pulling in the simulation.
 */

import type { ModifierKey } from './modifiers';

/** Non-core buildings allocate runtime slots from here upward. */
export const MOD_SLOT_BASE = 1000;

/**
 * Civic capabilities a standing building confers on the whole city. A closed
 * vocabulary, like the modifier keys: content declares what it `grants`, and
 * other content gates itself on that grant through an unlock expression —
 * which is how a Research University comes to unlock the fusion plant without
 * either building knowing about the other.
 */
export const CIVIC_GRANTS = ['learning', 'research', 'culture', 'sport'] as const;
export type CivicGrant = (typeof CIVIC_GRANTS)[number];

export function isCivicGrant(v: unknown): v is CivicGrant {
  return typeof v === 'string' && (CIVIC_GRANTS as readonly string[]).includes(v);
}

/** Context keys an unlock expression may reference. Each civic grant reads as
 * 1 while at least one building conferring it stands, else 0. */
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
  ...CIVIC_GRANTS,
] as const;

/** Largest footprint edge a building may claim; 6 covers the biggest reward. */
export const MAX_FOOTPRINT = 6;

export type ServiceKind = 'fire' | 'police' | 'school' | 'health' | 'bus' | 'garbage';

/**
 * Refuse handling. Coverage (who gets a pickup) rides the `service` block like
 * any other city service; this block is the other half — what the city can
 * actually process once the trucks arrive.
 */
/**
 * A building nobody wants to live near — a prison, a dump. It depresses land
 * value within a radius, additive to the vocabulary like every other
 * capability so it is validated, patchable, and available to mods.
 */
export interface BlightDef {
  /** Land value removed at the building's own tile, 0..1; falls off with distance. */
  amount: number;
  radius: number;
}

/**
 * The opposite of blight: a building people want to live near. Same shape and
 * the same falloff, added to the land-value field rather than subtracted, so a
 * stadium can lift its whole district while its `blight` block takes some of
 * that back on the streets right beside it.
 */
export interface AmenityDef {
  /** Land value added at the building's own tile, 0..1; falls off with distance. */
  amount: number;
  radius: number;
}

export interface WasteDef {
  /** Tonnes per month this building can dispose of. */
  capacity: number;
  /** Share of citywide production it recycles away entirely, 0..1. */
  divert?: number;
  /** What the building itself emits, on the same scale as a plant's. */
  pollution?: number;
}

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
  /**
   * Footprint edge in tiles; 1 (the default) is an ordinary one-tile building.
   * A larger building claims a `size`×`size` block of level, clear ground and
   * behaves as one thing: one upkeep, one service source, razed as a unit.
   */
  size?: number;
  /** Jobs the building itself provides, counted into the city's job total. */
  jobs?: number;
  unlock?: UnlockDef;
  power?: { capacity: number; pollution: number };
  service?: { kind: ServiceKind; radius: number; share?: number };
  transit?: { radius: number; share: number };
  siting?: { needsWater?: boolean };
  waste?: WasteDef;
  blight?: BlightDef;
  amenity?: AmenityDef;
  /** Civic capabilities this building confers while it stands. */
  grants?: CivicGrant[];
  /**
   * A mayor's-office reward: bought from the Rewards list once its `unlock`
   * milestone is met, rather than sitting in the toolbar from the start.
   */
  reward?: boolean;
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

/**
 * A sparse edit to a building that already exists, by id. Every field is
 * optional: only what's present is changed, so a pack that retunes a price
 * doesn't freeze every other number at whatever core happened to be that day.
 *
 * `slot` is deliberately absent. A slot is identity — tiles store it — so it
 * can never be patched; declaring one is a validation error.
 */
export interface BuildingOverride {
  id: string;
  name?: string;
  cost?: number;
  upkeep?: number;
  jobs?: number;
  unlock?: UnlockDef;
  power?: Partial<{ capacity: number; pollution: number }>;
  service?: Partial<{ kind: ServiceKind; radius: number; share: number }>;
  transit?: Partial<{ radius: number; share: number }>;
  waste?: Partial<WasteDef>;
  blight?: Partial<BlightDef>;
  amenity?: Partial<AmenityDef>;
  siting?: { needsWater?: boolean };
  visual?: VisualDef;
}

/** A sparse edit to an ordinance that already exists. Effects merge by key. */
export interface OrdinanceOverride {
  id: string;
  label?: string;
  blurb?: string;
  cost?: number;
  effects?: Partial<Record<ModifierKey, number>>;
}

export interface Pack {
  /** Package identity; "core" is reserved for the game's own content. */
  id: string;
  name: string;
  version: string;
  buildings?: BuildingDef[];
  ordinances?: OrdinanceDef[];
  skins?: SkinDef[];
  /** Edits to content some other pack (usually core) already defines. */
  overrides?: {
    buildings?: BuildingOverride[];
    ordinances?: OrdinanceOverride[];
  };
}
