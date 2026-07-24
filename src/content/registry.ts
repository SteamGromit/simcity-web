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
  /**
   * Slots this pack's author declared explicitly, by building id — captured
   * at registration time, before reindex() mutates `slot` on auto-allocated
   * buildings. Used to detect cross-pack pinned-slot collisions; an
   * auto-allocated slot is never "pinned" for this purpose.
   */
  declaredSlots: Map<string, number>;
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

  const declaredSlots = new Map<string, number>();
  for (const b of pack.buildings ?? []) {
    if (b.slot !== undefined) declaredSlots.set(b.id, b.slot);
  }

  // Reject cross-pack pinned-slot collisions before touching the registry.
  // validatePack only rules out duplicate slots *within* this pack; a slot
  // this pack declares could still collide with one already pinned by a
  // different, already-registered pack. Re-registering the SAME pack id is
  // fine (it replaces its own content), so that pack is excluded here.
  const pinnedElsewhere = new Map<number, string>(); // slot -> owning building id
  for (const [otherId, other] of packs) {
    if (otherId === pack.id) continue;
    for (const [buildingId, slot] of other.declaredSlots) {
      pinnedElsewhere.set(slot, buildingId);
    }
  }
  const collisionErrors: string[] = [];
  for (const [id, slot] of declaredSlots) {
    const heldBy = pinnedElsewhere.get(slot);
    if (heldBy !== undefined) {
      collisionErrors.push(
        `pack "${pack.id}": building "${id}" declares slot ${slot}, already pinned by "${heldBy}"`,
      );
    }
  }
  if (collisionErrors.length > 0) return { ok: false, errors: collisionErrors };

  packs.set(pack.id, {
    // clone so a caller mutating its literal cannot reach into the registry
    buildings: (pack.buildings ?? []).map((b) => ({ ...b })),
    ordinances: pack.ordinances ?? [],
    skins: pack.skins ?? [],
    unlocks: packUnlocks,
    declaredSlots,
  });
  reindex();
  return { ok: true };
}

/** Drop all registered content. Tests use this; the game never does. */
export function resetRegistry(): void {
  packs.clear();
  reindex();
}

/** Remove a registered pack and rebuild indices. Core is never removable. */
export function unregisterPack(id: string): void {
  if (id === 'core') return;
  if (packs.delete(id)) reindex();
}

/**
 * Rebuild every derived index from `packs`, mutating `b.slot` in place for
 * any building that didn't declare one and treating any building with a
 * defined `slot` — declared or previously auto-allocated — as pinned so
 * allocation never collides.
 *
 * That's deterministic for the add-only path the game actually exercises:
 * reset the registry, then register each pack once, in a fixed order. It is
 * NOT sound for replacing an already-registered pack with a different-sized
 * building list mid-session — an old auto-allocated slot would read as
 * "pinned" even though nobody declared it, and the free-slot search could
 * land differently than a fresh registration would. Supporting that needs
 * declared and allocated slots tracked separately rather than collapsed
 * onto `b.slot`; deferred to the mod-manager work (TODO #2).
 */
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
