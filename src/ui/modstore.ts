/**
 * The player's mods: named content packs held in localStorage and applied to
 * the content registry. Lives in the UI layer, not content/, so content/ stays
 * storage-free. Storage is injected so the pure logic is testable in Node.
 */

import { registerPack, unregisterPack } from '../content/registry';
import type { ModifierKey } from '../content/modifiers';
import type {
  BuildingDef,
  OrdinanceDef,
  Pack,
  ServiceKind,
  VisualDef,
} from '../content/types';
import { validatePack } from '../content/validate';

const STORAGE_KEY = 'simcity.mods';

export interface StoredMod {
  enabled: boolean;
  pack: Pack;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface OrdinanceDraft {
  label: string;
  blurb: string;
  cost: number;
  effects: Array<{ key: ModifierKey; value: number }>;
}

/** What a building does. A building has exactly one, matching what the sim
 * assumes downstream; the form only shows the fields the choice needs. */
export type BuildingCategory = 'plain' | 'power' | 'service' | 'transit';

/** Which kind of existing content a patch edits. */
export type OverrideKind = 'building' | 'ordinance';

/** The flat shape the building form edits, before it becomes a BuildingDef. */
export interface BuildingDraft {
  name: string;
  category: BuildingCategory;
  cost: number;
  upkeep: number;
  /** category 'power' */
  capacity?: number;
  pollution?: number;
  /** category 'service' */
  serviceKind?: ServiceKind;
  /** category 'service' and 'transit' */
  radius?: number;
  /** bus service and transit: cars still on the road per covered trip */
  share?: number;
  unlock?: { expr: string; label: string };
  needsWater: boolean;
  visual: VisualDef;
}

/** URL/id-safe slug; never empty. */
export function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'mod';
}

export interface ModStore {
  list(): readonly Readonly<StoredMod>[];
  create(name: string): Readonly<StoredMod>;
  rename(id: string, name: string): void;
  remove(id: string): void;
  setEnabled(id: string, on: boolean): void;
  exportMod(id: string): string;
  importMod(json: string): { ok: true; id: string } | { ok: false; errors: string[] };
  addOrdinance(id: string, draft: OrdinanceDraft): { ok: true } | { ok: false; errors: string[] };
  updateOrdinance(id: string, ordId: string, draft: OrdinanceDraft): { ok: true } | { ok: false; errors: string[] };
  removeOrdinance(id: string, ordId: string): void;
  addBuilding(id: string, draft: BuildingDraft): { ok: true } | { ok: false; errors: string[] };
  updateBuilding(id: string, bId: string, draft: BuildingDraft): { ok: true } | { ok: false; errors: string[] };
  removeBuilding(id: string, bId: string): void;
  setOverride(
    id: string,
    kind: OverrideKind,
    patch: { id: string } & Record<string, unknown>,
  ): { ok: true } | { ok: false; errors: string[] };
  clearOverride(id: string, kind: OverrideKind, targetId: string): void;
  onChange(cb: () => void): void;
}

export function createModStore(storage: StorageLike): ModStore {
  const listeners: Array<() => void> = [];
  let mods: StoredMod[] = load();

  function load(): StoredMod[] {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (m): m is StoredMod =>
          !!m &&
          typeof m === 'object' &&
          typeof m.enabled === 'boolean' &&
          !!m.pack &&
          typeof m.pack === 'object' &&
          typeof m.pack.id === 'string',
      );
    } catch {
      return [];
    }
  }

  function persist(): void {
    storage.setItem(STORAGE_KEY, JSON.stringify(mods));
  }

  function fire(): void {
    for (const cb of listeners) cb();
  }

  function find(id: string): StoredMod | undefined {
    return mods.find((m) => m.pack.id === id);
  }

  function uniqueId(base: string): string {
    let id = base;
    let n = 2;
    while (mods.some((m) => m.pack.id === id)) id = `${base}-${n++}`;
    return id;
  }

  function draftToOrdinance(packId: string, draft: OrdinanceDraft, id?: string): OrdinanceDef {
    const effects: Partial<Record<ModifierKey, number>> = {};
    for (const e of draft.effects) effects[e.key] = e.value;
    return { id: id ?? `${packId}:${slugify(draft.label)}`, label: draft.label, blurb: draft.blurb, cost: draft.cost, effects };
  }

  /**
   * Assemble a BuildingDef from the form's flat draft. The id is passed in
   * when editing so it survives a rename — a tile stores the slot that id
   * owns, so re-slugging on every edit would orphan anything already built.
   */
  function draftToBuilding(packId: string, draft: BuildingDraft, id?: string): BuildingDef {
    const slug = slugify(draft.name);
    const def: BuildingDef = {
      id: id ?? `${packId}:${slug}`,
      name: draft.name,
      tool: `${packId}__${slug}`,
      cost: draft.cost,
      upkeep: draft.upkeep,
      visual: draft.visual,
    };

    if (draft.category === 'power') {
      def.power = { capacity: draft.capacity ?? 0, pollution: draft.pollution ?? 0 };
    } else if (draft.category === 'service') {
      def.service = { kind: draft.serviceKind ?? 'fire', radius: draft.radius ?? 0 };
      // share only means anything for buses, where it's cars still on the road
      if (draft.serviceKind === 'bus' && draft.share !== undefined) {
        def.service.share = draft.share;
      }
    } else if (draft.category === 'transit') {
      def.transit = { radius: draft.radius ?? 0, share: draft.share ?? 1 };
    }

    if (draft.unlock) def.unlock = draft.unlock;
    if (draft.needsWater) def.siting = { needsWater: true };
    return def;
  }

  /** Validate a proposed building list, and adopt it only if it holds up. */
  function commitBuildings(
    m: StoredMod,
    next: BuildingDef[],
  ): { ok: true } | { ok: false; errors: string[] } {
    const result = validatePack({ ...m.pack, buildings: next });
    if (!result.ok) return { ok: false, errors: result.errors };
    m.pack.buildings = next;
    if (m.enabled) registerPack(m.pack);
    persist();
    fire();
    return { ok: true };
  }

  // apply enabled mods to the registry at construction
  for (const m of mods) if (m.enabled) registerPack(m.pack);

  return {
    list: () => mods,

    create(name) {
      const id = uniqueId(slugify(name));
      const mod: StoredMod = {
        enabled: true,
        pack: { id, name: name.trim() || id, version: '1.0.0', ordinances: [] },
      };
      mods.push(mod);
      registerPack(mod.pack);
      persist();
      fire();
      return mod;
    },

    rename(id, name) {
      const m = find(id);
      if (!m) return;
      // id is stable; only the display name changes (the registry doesn't read
      // pack.name for ordinances, so no re-register is needed)
      m.pack.name = name.trim() || m.pack.id;
      persist();
      fire();
    },

    remove(id) {
      const i = mods.findIndex((m) => m.pack.id === id);
      if (i < 0) return;
      unregisterPack(id);
      mods.splice(i, 1);
      persist();
      fire();
    },

    setEnabled(id, on) {
      const m = find(id);
      if (!m || m.enabled === on) return;
      m.enabled = on;
      if (on) registerPack(m.pack);
      else unregisterPack(id);
      persist();
      fire();
    },

    addOrdinance(id, draft) {
      const m = find(id);
      if (!m) return { ok: false, errors: [`no mod "${id}"`] };
      const ord = draftToOrdinance(m.pack.id, draft);
      const next = [...(m.pack.ordinances ?? []), ord];
      const result = validatePack({ ...m.pack, ordinances: next });
      if (!result.ok) return { ok: false, errors: result.errors };
      m.pack.ordinances = next;
      if (m.enabled) registerPack(m.pack);
      persist();
      fire();
      return { ok: true };
    },

    updateOrdinance(id, ordId, draft) {
      const m = find(id);
      if (!m) return { ok: false, errors: [`no mod "${id}"`] };
      const list = m.pack.ordinances ?? [];
      const i = list.findIndex((o) => o.id === ordId);
      if (i < 0) return { ok: false, errors: [`no ordinance "${ordId}"`] };
      const next = list.slice();
      next[i] = draftToOrdinance(m.pack.id, draft, ordId); // id stays stable
      const result = validatePack({ ...m.pack, ordinances: next });
      if (!result.ok) return { ok: false, errors: result.errors };
      m.pack.ordinances = next;
      if (m.enabled) registerPack(m.pack);
      persist();
      fire();
      return { ok: true };
    },

    removeOrdinance(id, ordId) {
      const m = find(id);
      if (!m) return;
      m.pack.ordinances = (m.pack.ordinances ?? []).filter((o) => o.id !== ordId);
      if (m.enabled) registerPack(m.pack);
      persist();
      fire();
    },

    addBuilding(id, draft) {
      const m = find(id);
      if (!m) return { ok: false, errors: [`no mod "${id}"`] };
      return commitBuildings(m, [
        ...(m.pack.buildings ?? []),
        draftToBuilding(m.pack.id, draft),
      ]);
    },

    updateBuilding(id, bId, draft) {
      const m = find(id);
      if (!m) return { ok: false, errors: [`no mod "${id}"`] };
      const list = m.pack.buildings ?? [];
      const i = list.findIndex((b) => b.id === bId);
      if (i < 0) return { ok: false, errors: [`no building "${bId}"`] };
      const next = list.slice();
      next[i] = draftToBuilding(m.pack.id, draft, bId); // id stays stable
      return commitBuildings(m, next);
    },

    removeBuilding(id, bId) {
      const m = find(id);
      if (!m) return;
      m.pack.buildings = (m.pack.buildings ?? []).filter((b) => b.id !== bId);
      if (m.enabled) registerPack(m.pack);
      persist();
      fire();
    },

    setOverride(id, kind, patch) {
      const m = find(id);
      if (!m) return { ok: false, errors: [`no mod "${id}"`] };
      const key = kind === 'building' ? 'buildings' : 'ordinances';
      const current = m.pack.overrides?.[key] ?? [];
      // one patch per target: setting it again replaces, never stacks
      const next = [...current.filter((p) => p.id !== patch.id), patch];
      const overrides = { ...m.pack.overrides, [key]: next };

      const result = validatePack({ ...m.pack, overrides });
      if (!result.ok) return { ok: false, errors: result.errors };
      // registerPack has the last word: it alone knows whether the target
      // exists, and it refuses without touching the registry.
      if (m.enabled) {
        const registered = registerPack({ ...m.pack, overrides });
        if (!registered.ok) return { ok: false, errors: registered.errors };
      }
      m.pack.overrides = overrides as Pack['overrides'];
      persist();
      fire();
      return { ok: true };
    },

    clearOverride(id, kind, targetId) {
      const m = find(id);
      if (!m?.pack.overrides) return;
      const key = kind === 'building' ? 'buildings' : 'ordinances';
      const current = m.pack.overrides[key] ?? [];
      m.pack.overrides = {
        ...m.pack.overrides,
        [key]: current.filter((p) => p.id !== targetId),
      } as Pack['overrides'];
      if (m.enabled) registerPack(m.pack);
      persist();
      fire();
    },

    exportMod(id) {
      const m = find(id);
      return m ? JSON.stringify(m.pack, null, 2) : '';
    },

    importMod(json) {
      let raw: unknown;
      try {
        raw = JSON.parse(json);
      } catch {
        return { ok: false, errors: ['not valid JSON'] };
      }
      const result = validatePack(raw);
      if (!result.ok) return { ok: false, errors: result.errors };
      const pack = result.value.pack;
      if (find(pack.id)) {
        return { ok: false, errors: [`a mod with id "${pack.id}" already exists`] };
      }
      const registered = registerPack(pack);
      if (!registered.ok) return { ok: false, errors: registered.errors };
      const mod: StoredMod = { enabled: true, pack };
      mods.push(mod);
      persist();
      fire();
      return { ok: true, id: pack.id };
    },

    onChange(cb) {
      listeners.push(cb);
    },
  };
}
