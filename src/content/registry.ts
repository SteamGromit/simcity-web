/**
 * The live content registry. Everything the sim asks about a building,
 * ordinance, or skin comes through here.
 *
 * Identity is a stable string id; the runtime handle is a numeric slot, so
 * existing `switch (zone)` code and every save keep working. Core content
 * pins its slots to the historic Zone numbers; anything else is allocated
 * from MOD_SLOT_BASE upward, in declaration order, so the mapping is
 * deterministic for a given set of packs.
 */

import type { CompiledExpr } from './expr';
import { MOD_SLOT_BASE, type BuildingDef, type OrdinanceDef, type SkinDef } from './types';
import { validatePack } from './validate';

interface Registered {
  buildings: BuildingDef[];
  ordinances: OrdinanceDef[];
  skins: SkinDef[];
  unlocks: Map<string, CompiledExpr>;
}

/** Insertion-ordered so re-registration and slot allocation stay deterministic. */
const packs = new Map<string, Registered>();

// derived indices, rebuilt whenever packs change
let bySlot = new Map<number, BuildingDef>();
let byId = new Map<string, BuildingDef>();
let byTool = new Map<string, BuildingDef>();
let unlocks = new Map<string, CompiledExpr>();
let buildings: BuildingDef[] = [];
let ordinances: OrdinanceDef[] = [];
let skins: SkinDef[] = [];

export type RegisterResult = { ok: true } | { ok: false; errors: string[] };

export function registerPack(raw: unknown): RegisterResult {
  const result = validatePack(raw);
  if (!result.ok) return { ok: false, errors: result.errors };

  const { pack, unlocks: packUnlocks } = result.value;
  packs.set(pack.id, {
    // clone so a caller mutating its literal cannot reach into the registry
    buildings: (pack.buildings ?? []).map((b) => ({ ...b })),
    ordinances: pack.ordinances ?? [],
    skins: pack.skins ?? [],
    unlocks: packUnlocks,
  });
  reindex();
  return { ok: true };
}

/** Drop all registered content. Tests use this; the game never does. */
export function resetRegistry(): void {
  packs.clear();
  reindex();
}

function reindex(): void {
  bySlot = new Map();
  byId = new Map();
  byTool = new Map();
  unlocks = new Map();
  buildings = [];
  ordinances = [];
  skins = [];

  // pinned slots first, so allocation can never land on one
  for (const reg of packs.values()) {
    for (const b of reg.buildings) {
      if (b.slot !== undefined) bySlot.set(b.slot, b);
    }
  }

  let next = MOD_SLOT_BASE;
  for (const reg of packs.values()) {
    for (const b of reg.buildings) {
      if (b.slot === undefined) {
        while (bySlot.has(next)) next++;
        b.slot = next;
        bySlot.set(next, b);
      }
      byId.set(b.id, b);
      if (b.tool !== undefined) byTool.set(b.tool, b);
      buildings.push(b);
    }
    for (const [id, expr] of reg.unlocks) unlocks.set(id, expr);
    ordinances.push(...reg.ordinances);
    skins.push(...reg.skins);
  }
}

export function buildingBySlot(slot: number): BuildingDef | undefined {
  return bySlot.get(slot);
}

export function buildingById(id: string): BuildingDef | undefined {
  return byId.get(id);
}

export function buildingByTool(tool: string): BuildingDef | undefined {
  return byTool.get(tool);
}

export function allBuildings(): readonly BuildingDef[] {
  return buildings;
}

export function slotOf(id: string): number | undefined {
  return byId.get(id)?.slot;
}

export function idOfSlot(slot: number): string | undefined {
  return bySlot.get(slot)?.id;
}

export function unlockExpr(id: string): CompiledExpr | undefined {
  return unlocks.get(id);
}

export function allOrdinances(): readonly OrdinanceDef[] {
  return ordinances;
}

export function ordinanceById(id: string): OrdinanceDef | undefined {
  return ordinances.find((o) => o.id === id);
}

export function allSkins(): readonly SkinDef[] {
  return skins;
}
