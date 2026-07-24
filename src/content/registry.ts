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

/**
 * Slots handed to buildings that didn't declare one, by building id. This only
 * ever grows (until resetRegistry), which is what makes a slot stable: a tile
 * stores a slot number, so once an id owns one it must keep it for the life of
 * the session — through re-registration, through a sibling being added or
 * removed, and through the mod being disabled and re-enabled.
 */
const allocated = new Map<string, number>();

// derived indices, rebuilt whenever packs change
let bySlot = new Map<number, BuildingDef>();
let byId = new Map<string, BuildingDef>();
let byTool = new Map<string, BuildingDef>();
let unlocks = new Map<string, CompiledExpr>();
let buildings: BuildingDef[] = [];
let ordinances: OrdinanceDef[] = [];
let skins: SkinDef[] = [];
let byOrdinanceId = new Map<string, OrdinanceDef>();

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
    // Re-declaring a slot for the SAME building id is an override of that
    // building, which is legal and must keep the slot — that's the whole point
    // of pinned identity. Only a different id claiming the slot is a theft.
    if (heldBy !== undefined && heldBy !== id) {
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
  allocated.clear();
  reindex();
}

/** Remove a registered pack and rebuild indices. Core is never removable. */
export function unregisterPack(id: string): void {
  if (id === 'core') return;
  if (packs.delete(id)) reindex();
}

/**
 * Rebuild every derived index from `packs`.
 *
 * Declared and allocated slots are kept strictly separate: a stored building's
 * `slot` is only ever the one its author declared (core content), and a
 * building that declared none gets its slot from the `allocated` ledger, which
 * remembers the assignment by id. Nothing here mutates the stored defs, so
 * re-registering a pack recomputes from the ledger rather than from a slot a
 * previous pass wrote back.
 *
 * That makes the whole thing sound for the path the mod manager exercises —
 * replacing an already-registered pack with a different-sized building list
 * mid-session. An id's slot cannot move while the session lives, which matters
 * because tiles store the slot number: if removing one building shifted its
 * sibling's slot, every already-placed copy of that sibling would silently
 * rebind to different content.
 */
function reindex(): void {
  bySlot = new Map();
  byId = new Map();
  byTool = new Map();
  unlocks = new Map();

  // Resolve to one definition per id first, in pack order, so a later pack
  // replaces an earlier one rather than sitting beside it. Every index and
  // every list is built from these maps, which is what keeps `allOrdinances()`
  // and `ordinanceById()` agreeing about which definition actually won.
  const buildingsById = new Map<string, BuildingDef>();
  const ordinancesById = new Map<string, OrdinanceDef>();
  const skinsById = new Map<string, SkinDef>();

  for (const reg of packs.values()) {
    for (const b of reg.buildings) buildingsById.set(b.id, b);
    for (const o of reg.ordinances) ordinancesById.set(o.id, o);
    for (const s of reg.skins) skinsById.set(s.id, s);
    for (const [id, expr] of reg.unlocks) unlocks.set(id, expr);
  }

  // Reserve every declared slot before allocating, so an allocation can never
  // land on one no matter what order the packs come in.
  const declared = new Set<number>();
  for (const b of buildingsById.values()) {
    if (b.slot !== undefined) declared.add(b.slot);
  }

  const inUse = new Set(allocated.values());
  let next = MOD_SLOT_BASE;

  for (const b of buildingsById.values()) {
    let slot = b.slot;
    if (slot === undefined) {
      slot = allocated.get(b.id);
      if (slot === undefined) {
        while (declared.has(next) || inUse.has(next)) next++;
        slot = next;
        allocated.set(b.id, slot);
        inUse.add(slot);
      }
    }
    // One derived def per building, carrying its resolved slot, shared by
    // every index so the lookups agree by identity. A declaring building is
    // already correct and is indexed as-is.
    const def = b.slot === slot ? b : { ...b, slot };
    bySlot.set(slot, def);
    byId.set(def.id, def);
    if (def.tool !== undefined) byTool.set(def.tool, def);
  }

  buildings = [...byId.values()];
  ordinances = [...ordinancesById.values()];
  skins = [...skinsById.values()];
  byOrdinanceId = ordinancesById;
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
  return byOrdinanceId.get(id);
}

export function allSkins(): readonly SkinDef[] {
  return skins;
}
