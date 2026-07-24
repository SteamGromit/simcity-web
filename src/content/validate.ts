/**
 * Pack validation. Takes unknown because the runtime path receives parsed
 * JSON from outside the build. Never throws: it collects every problem so an
 * author sees them all at once instead of fixing one per attempt.
 */

import { compile, type CompiledExpr } from './expr';
import { isModifierKey } from './modifiers';
import {
  BUILDING_PROPS,
  BUILDING_ROOFS,
  MAX_BUILDING_PROPS,
  UNLOCK_CONTEXT_KEYS,
  type BuildingDef,
  type BuildingProp,
  type BuildingRoof,
  type OrdinanceDef,
  type Pack,
  type ServiceKind,
  type SkinDef,
} from './types';

export interface ValidatedPack {
  pack: Pack;
  /** Compiled unlock expressions by building id, so the registry needn't recompile. */
  unlocks: Map<string, CompiledExpr>;
}

export type ValidateResult =
  | { ok: true; value: ValidatedPack }
  | { ok: false; errors: string[] };

const SERVICE_KINDS: ServiceKind[] = ['fire', 'police', 'school', 'health', 'bus'];

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function validatePack(raw: unknown): ValidateResult {
  const errors: string[] = [];
  const unlocks = new Map<string, CompiledExpr>();

  if (!isObj(raw)) return { ok: false, errors: ['pack must be an object'] };

  if (!isStr(raw.id)) errors.push('pack: "id" must be a non-empty string');
  if (!isStr(raw.name)) errors.push('pack: "name" must be a non-empty string');
  if (!isStr(raw.version)) errors.push('pack: "version" must be a non-empty string');

  const buildings = validateBuildings(raw.buildings, errors, unlocks);
  const ordinances = validateOrdinances(raw.ordinances, errors);
  const skins = validateSkins(raw.skins, errors);

  if (errors.length > 0) return { ok: false, errors };

  const pack: Pack = {
    id: raw.id as string,
    name: raw.name as string,
    version: raw.version as string,
    buildings,
    ordinances,
    skins,
  };
  return { ok: true, value: { pack, unlocks } };
}

function validateBuildings(
  raw: unknown,
  errors: string[],
  unlocks: Map<string, CompiledExpr>,
): BuildingDef[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    errors.push('pack: "buildings" must be an array');
    return [];
  }
  const out: BuildingDef[] = [];
  const seenIds = new Set<string>();
  const seenSlots = new Set<number>();

  raw.forEach((entry, i) => {
    const where = `buildings[${i}]`;
    if (!isObj(entry)) {
      errors.push(`${where}: must be an object`);
      return;
    }
    if (!isStr(entry.id)) {
      errors.push(`${where}: "id" must be a non-empty string`);
      return;
    }
    const id = entry.id;
    if (seenIds.has(id)) errors.push(`${where}: duplicate building id "${id}"`);
    seenIds.add(id);

    if (!isStr(entry.name)) errors.push(`${where} (${id}): "name" must be a non-empty string`);
    if (!isNum(entry.cost) || entry.cost < 0) errors.push(`${where} (${id}): "cost" must be a number >= 0`);
    if (!isNum(entry.upkeep) || entry.upkeep < 0) errors.push(`${where} (${id}): "upkeep" must be a number >= 0`);

    if (entry.slot !== undefined) {
      if (!isNum(entry.slot) || entry.slot < 0 || !Number.isInteger(entry.slot)) {
        errors.push(`${where} (${id}): "slot" must be a non-negative integer`);
      } else {
        if (seenSlots.has(entry.slot)) errors.push(`${where} (${id}): duplicate slot ${entry.slot}`);
        seenSlots.add(entry.slot);
      }
    }

    if (entry.tool !== undefined && !isStr(entry.tool)) {
      errors.push(`${where} (${id}): "tool" must be a non-empty string`);
    }

    if (entry.unlock !== undefined) {
      if (!isObj(entry.unlock) || !isStr(entry.unlock.expr) || !isStr(entry.unlock.label)) {
        errors.push(`${where} (${id}): "unlock" needs string "expr" and "label"`);
      } else {
        const r = compile(entry.unlock.expr, UNLOCK_CONTEXT_KEYS);
        if (!r.ok) errors.push(`${where} (${id}): unlock expression — ${r.error}`);
        else unlocks.set(id, r.expr);
      }
    }

    if (entry.power !== undefined) {
      const p = entry.power;
      if (!isObj(p) || !isNum(p.capacity) || p.capacity < 0 || !isNum(p.pollution) || p.pollution < 0) {
        errors.push(`${where} (${id}): "power" needs numeric "capacity" and "pollution" >= 0`);
      }
    }

    if (entry.service !== undefined) {
      const s = entry.service;
      if (!isObj(s) || !isStr(s.kind) || !SERVICE_KINDS.includes(s.kind as ServiceKind)) {
        errors.push(`${where} (${id}): "service.kind" must be one of ${SERVICE_KINDS.join(', ')}`);
      }
      if (!isObj(s) || !isNum((s as Record<string, unknown>).radius)) {
        errors.push(`${where} (${id}): "service.radius" must be a number`);
      }
    }

    if (entry.transit !== undefined) {
      const t = entry.transit;
      if (!isObj(t) || !isNum(t.radius) || !isNum(t.share)) {
        errors.push(`${where} (${id}): "transit" needs numeric "radius" and "share"`);
      }
    }

    if (entry.visual !== undefined) validateVisual(entry.visual, `${where} (${id})`, errors);

    out.push(entry as unknown as BuildingDef);
  });

  return out;
}

/** Numeric bounds for a VisualDef, by field. */
const VISUAL_RANGES: Record<string, [number, number]> = {
  footprint: [0.3, 1],
  height: [6, 60],
  hue: [0, 359],
  sat: [0, 100],
  light: [0, 100],
};

/**
 * Check an authored building's look. Ranges are bounds the renderer can draw
 * sensibly — a zero-footprint or 500px-tall mass would render as garbage
 * rather than a building, so it's rejected at author time with a named field.
 */
function validateVisual(raw: unknown, where: string, errors: string[]): void {
  if (!isObj(raw)) {
    errors.push(`${where}: "visual" must be an object`);
    return;
  }

  for (const [key, [lo, hi]] of Object.entries(VISUAL_RANGES)) {
    const v = raw[key];
    if (!isNum(v) || v < lo || v > hi) {
      errors.push(`${where}: "visual.${key}" must be a number ${lo}..${hi}`);
    }
  }

  if (!isStr(raw.roof) || !BUILDING_ROOFS.includes(raw.roof as BuildingRoof)) {
    errors.push(`${where}: "visual.roof" must be one of ${BUILDING_ROOFS.join(', ')}`);
  }

  if (!Array.isArray(raw.props)) {
    errors.push(`${where}: "visual.props" must be an array`);
    return;
  }
  if (raw.props.length > MAX_BUILDING_PROPS) {
    errors.push(`${where}: "visual.props" takes at most ${MAX_BUILDING_PROPS} props`);
  }
  for (const p of raw.props) {
    if (!isStr(p) || !BUILDING_PROPS.includes(p as BuildingProp)) {
      errors.push(`${where}: unknown prop "${String(p)}"`);
    }
  }
}

function validateOrdinances(raw: unknown, errors: string[]): OrdinanceDef[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    errors.push('pack: "ordinances" must be an array');
    return [];
  }
  const out: OrdinanceDef[] = [];
  const seen = new Set<string>();

  raw.forEach((entry, i) => {
    const where = `ordinances[${i}]`;
    if (!isObj(entry)) {
      errors.push(`${where}: must be an object`);
      return;
    }
    if (!isStr(entry.id)) {
      errors.push(`${where}: "id" must be a non-empty string`);
      return;
    }
    const id = entry.id;
    if (seen.has(id)) errors.push(`${where}: duplicate ordinance id "${id}"`);
    seen.add(id);

    if (!isStr(entry.label)) errors.push(`${where} (${id}): "label" must be a non-empty string`);
    if (!isStr(entry.blurb)) errors.push(`${where} (${id}): "blurb" must be a non-empty string`);
    if (!isNum(entry.cost) || entry.cost < 0) errors.push(`${where} (${id}): "cost" must be a number >= 0`);

    if (!isObj(entry.effects)) {
      errors.push(`${where} (${id}): "effects" must be an object`);
    } else {
      for (const [key, value] of Object.entries(entry.effects)) {
        if (!isModifierKey(key)) errors.push(`${where} (${id}): unknown modifier key "${key}"`);
        else if (!isNum(value) || value < 0) errors.push(`${where} (${id}): "${key}" must be a number >= 0`);
      }
    }

    out.push(entry as unknown as OrdinanceDef);
  });

  return out;
}

function validateSkins(raw: unknown, errors: string[]): SkinDef[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    errors.push('pack: "skins" must be an array');
    return [];
  }
  const out: SkinDef[] = [];
  const seen = new Set<string>();

  raw.forEach((entry, i) => {
    const where = `skins[${i}]`;
    if (!isObj(entry)) {
      errors.push(`${where}: must be an object`);
      return;
    }
    if (!isStr(entry.id)) {
      errors.push(`${where}: "id" must be a non-empty string`);
      return;
    }
    const id = entry.id;
    if (seen.has(id)) errors.push(`${where}: duplicate skin id "${id}"`);
    seen.add(id);

    if (!isStr(entry.label)) errors.push(`${where} (${id}): "label" must be a non-empty string`);
    if (!isStr(entry.blurb)) errors.push(`${where} (${id}): "blurb" must be a non-empty string`);
    if (!isStr(entry.roadFill)) errors.push(`${where} (${id}): "roadFill" must be a non-empty string`);
    for (const k of ['outline', 'heightScale', 'grassSat'] as const) {
      if (!isNum(entry[k])) errors.push(`${where} (${id}): "${k}" must be a number`);
    }

    const hue = entry.hue;
    if (!isObj(hue) || (hue.mode !== 'identity' && hue.mode !== 'wrap')) {
      errors.push(`${where} (${id}): "hue.mode" must be "identity" or "wrap"`);
    } else if (hue.mode === 'wrap' && (!isNum(hue.base) || !isNum(hue.span) || hue.span === 0)) {
      errors.push(`${where} (${id}): wrap hue needs numeric "base" and non-zero "span"`);
    }

    for (const k of ['sat', 'light'] as const) {
      const t = entry[k];
      if (!isObj(t)) {
        errors.push(`${where} (${id}): "${k}" must be an object`);
        continue;
      }
      if (t.mul !== undefined && !isNum(t.mul)) errors.push(`${where} (${id}): "${k}.mul" must be a number`);
      if (t.add !== undefined && !isNum(t.add)) errors.push(`${where} (${id}): "${k}.add" must be a number`);
    }

    out.push(entry as unknown as SkinDef);
  });

  return out;
}
