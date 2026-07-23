/**
 * The player's mods: named content packs held in localStorage and applied to
 * the content registry. Lives in the UI layer, not content/, so content/ stays
 * storage-free. Storage is injected so the pure logic is testable in Node.
 */

import { registerPack, unregisterPack } from '../content/registry';
import type { Pack } from '../content/types';
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
