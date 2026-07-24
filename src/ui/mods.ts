/**
 * The Mods panel: create, enable/disable, export, import, and delete mods, and
 * author their ordinances. It renders the mod store and calls back into it;
 * the store owns persistence and the registry, and fires onChange so City Hall
 * refreshes. No dialogs — inline inputs keep it keyboard- and test-friendly.
 */

import { MODIFIER_KEYS, type ModifierKey } from '../content/modifiers';
import { BUILDING_PROPS, BUILDING_ROOFS, type VisualDef } from '../content/types';
import { allBuildings, allOrdinances } from '../content/registry';
import { drawAuthoredBuilding } from '../render/buildings';
import { TILE_W, TILE_H } from '../render/iso';
import type { BuildingDraft, ModStore, OrdinanceDraft, OverrideKind, StoredMod } from './modstore';

/** Plain-language names for the modifier vocabulary. */
const MODIFIER_LABELS: Record<ModifierKey, string> = {
  'pollution.industry': 'Industry pollution',
  'pollution.traffic': 'Traffic pollution',
  'fire.ignition': 'Fire ignition',
  'transit.share': 'Cars per transit trip',
  'coverage.school': 'School coverage',
  'disaster.pandemicOdds': 'Pandemic odds',
  'disaster.pandemicToll': 'Pandemic severity',
  'garbage.production': 'Garbage produced',
  'crime.rate': 'Crime rate',
  'accident.rate': 'Accident rate',
  'accident.duration': 'Accident duration',
};

export function buildModsPanel(
  root: HTMLElement,
  store: ModStore,
  opts: { toast: (msg: string, kind?: 'error' | 'info') => void },
): { toggle(): void } {
  const panel = document.createElement('div');
  panel.id = 'mods-panel';
  panel.className = 'panel hidden';
  root.appendChild(panel);

  // view state: which mod is open, which ordinance is being edited
  let openModId: string | null = null;
  let editingOrdId: string | null | undefined = undefined; // undefined = not editing, null = new
  let editingBldId: string | null | undefined = undefined;
  let editingOverride: { kind: OverrideKind; id: string } | undefined = undefined;

  store.onChange(() => {
    if (!panel.classList.contains('hidden')) render();
  });

  function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    props: Partial<HTMLElementTagNameMap[K]> = {},
    children: (Node | string)[] = [],
  ): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    Object.assign(node, props);
    for (const c of children) node.append(c);
    return node;
  }

  function render() {
    panel.innerHTML = '';
    panel.append(el('h3', { textContent: 'Mods' }));
    const open = openModId ? store.list().find((m) => m.pack.id === openModId) : undefined;
    if (open) renderModEditor(open);
    else renderModList();
  }

  function renderModList() {
    const list = el('div', { id: 'mod-list' });
    for (const m of store.list()) list.append(modRow(m));
    if (store.list().length === 0) {
      list.append(el('p', { className: 'mods-empty', textContent: 'No mods yet. Create one below.' }));
    }
    panel.append(list);

    // create
    const nameInput = el('input', { type: 'text', id: 'mod-new-name', placeholder: 'New mod name' });
    const createBtn = el('button', { textContent: 'Create' });
    createBtn.addEventListener('click', () => {
      const name = nameInput.value.trim();
      if (!name) return;
      store.create(name);
      opts.toast('Mod created', 'info');
    });
    panel.append(el('div', { className: 'mods-create' }, [nameInput, createBtn]));

    // import
    const importArea = el('textarea', { id: 'mod-import', placeholder: 'Paste mod JSON to import' });
    const importErr = el('div', { className: 'mods-error' });
    const importBtn = el('button', { textContent: 'Import' });
    importBtn.addEventListener('click', () => {
      const r = store.importMod(importArea.value);
      if (r.ok) {
        importArea.value = '';
        importErr.textContent = '';
        opts.toast('Mod imported', 'info');
      } else {
        importErr.textContent = r.errors.join('; ');
      }
    });
    panel.append(el('div', { className: 'mods-import' }, [importArea, importBtn, importErr]));
  }

  function modRow(m: StoredMod): HTMLElement {
    const toggle = el('input', { type: 'checkbox', checked: m.enabled });
    toggle.addEventListener('change', () => store.setEnabled(m.pack.id, toggle.checked));

    const name = el('span', { className: 'mod-name', textContent: m.pack.name });

    const edit = el('button', { textContent: 'Edit' });
    edit.addEventListener('click', () => {
      openModId = m.pack.id;
      editingOrdId = undefined;
      editingBldId = undefined;
      editingOverride = undefined;
      render();
    });

    const exp = el('button', { textContent: 'Export' });
    exp.addEventListener('click', async () => {
      const json = store.exportMod(m.pack.id);
      try {
        await navigator.clipboard.writeText(json);
        opts.toast('Mod JSON copied', 'info');
      } catch {
        opts.toast('Copy failed — JSON shown below', 'error');
        // fallback: drop the JSON into a selectable field
        const out = el('textarea', { className: 'mods-export-out', value: json });
        panel.append(out);
        out.select();
      }
    });

    const del = el('button', { textContent: 'Delete', className: 'mods-danger' });
    del.addEventListener('click', () => {
      store.remove(m.pack.id);
      opts.toast('Mod deleted', 'info');
    });

    return el('div', { className: 'mod-row' }, [
      el('label', { className: 'mod-row-head' }, [toggle, name]),
      el('div', { className: 'mod-row-actions' }, [edit, exp, del]),
    ]);
  }

  function renderModEditor(m: StoredMod) {
    const back = el('button', { textContent: '← Mods', className: 'mods-back' });
    back.addEventListener('click', () => {
      openModId = null;
      editingOrdId = undefined;
      editingBldId = undefined;
      editingOverride = undefined;
      render();
    });
    panel.append(back);

    const nameInput = el('input', { type: 'text', className: 'mod-edit-name', value: m.pack.name });
    nameInput.addEventListener('change', () => store.rename(m.pack.id, nameInput.value));
    panel.append(el('div', { className: 'mods-field' }, [el('span', { textContent: 'Name' }), nameInput]));

    panel.append(el('h4', { textContent: 'Ordinances' }));
    const ordList = el('div', { id: 'mod-ord-list' });
    for (const o of m.pack.ordinances ?? []) {
      const label = el('span', { className: 'mod-ord-name', textContent: `${o.label} · §${o.cost}` });
      const edit = el('button', { textContent: 'Edit' });
      edit.addEventListener('click', () => {
        editingOrdId = o.id;
        renderOrdinanceForm(m, o.id);
      });
      const rm = el('button', { textContent: 'Remove', className: 'mods-danger' });
      rm.addEventListener('click', () => {
        // Drop the form first if it is editing this ordinance, or the re-render
        // below would rebuild it bound to an id that no longer exists.
        if (editingOrdId === o.id) editingOrdId = undefined;
        store.removeOrdinance(m.pack.id, o.id);
      });
      ordList.append(el('div', { className: 'mod-ord-row' }, [label, edit, rm]));
    }
    panel.append(ordList);

    const add = el('button', { textContent: '＋ Add ordinance' });
    add.addEventListener('click', () => {
      editingOrdId = null;
      renderOrdinanceForm(m, null);
    });
    panel.append(add);

    if (editingOrdId !== undefined) renderOrdinanceForm(m, editingOrdId);

    panel.append(el('h4', { textContent: 'Buildings' }));
    const bList = el('div', { id: 'mod-bld-list' });
    for (const b of m.pack.buildings ?? []) {
      const label = el('span', {
        className: 'mod-bld-name',
        textContent: `${b.name} · §${b.cost}`,
      });
      const edit = el('button', { textContent: 'Edit' });
      edit.addEventListener('click', () => {
        editingBldId = b.id;
        renderBuildingForm(m, b.id);
      });
      const rm = el('button', { textContent: 'Remove', className: 'mods-danger' });
      rm.addEventListener('click', () => {
        // Same ordering trap as ordinances: drop the form before the store
        // fires, or the re-render rebuilds it bound to a dead id.
        if (editingBldId === b.id) editingBldId = undefined;
        store.removeBuilding(m.pack.id, b.id);
      });
      bList.append(el('div', { className: 'mod-bld-row' }, [label, edit, rm]));
    }
    panel.append(bList);

    const addB = el('button', { textContent: '＋ Add building' });
    addB.addEventListener('click', () => {
      editingBldId = null;
      renderBuildingForm(m, null);
    });
    panel.append(addB);

    if (editingBldId !== undefined) renderBuildingForm(m, editingBldId);

    renderOverrides(m);
  }

  /**
   * Retune content some other pack defines. The list offers everything
   * registered that this mod doesn't define itself; each field shows the
   * inherited value as its placeholder and is left blank when not overridden,
   * so "unset" stays distinguishable from "set to the same number".
   */
  function renderOverrides(m: StoredMod) {
    panel.append(el('h4', { textContent: 'Overrides' }));

    const mine = new Set([
      ...(m.pack.buildings ?? []).map((b) => b.id),
      ...(m.pack.ordinances ?? []).map((o) => o.id),
    ]);
    const patched = m.pack.overrides ?? {};

    const list = el('div', { id: 'mod-ovr-list' });
    for (const kind of ['building', 'ordinance'] as const) {
      const key = kind === 'building' ? 'buildings' : 'ordinances';
      for (const p of patched[key] ?? []) {
        const changed = Object.keys(p).filter((k) => k !== 'id');
        const label = el('span', {
          className: 'mod-ovr-name',
          textContent: `${p.id} · ${changed.join(', ') || 'no change'}`,
        });
        const edit = el('button', { textContent: 'Edit' });
        edit.addEventListener('click', () => {
          editingOverride = { kind, id: p.id };
          renderOverrideForm(m, kind, p.id);
        });
        const reset = el('button', { textContent: 'Reset', className: 'mods-danger' });
        reset.addEventListener('click', () => {
          if (editingOverride?.id === p.id) editingOverride = undefined;
          store.clearOverride(m.pack.id, kind, p.id);
        });
        list.append(el('div', { className: 'mod-ovr-row' }, [label, edit, reset]));
      }
    }
    if (!list.children.length) {
      list.append(
        el('p', { className: 'mods-empty', textContent: 'Nothing overridden yet.' }),
      );
    }
    panel.append(list);

    // picker: everything registered that this mod doesn't define
    const pick = el('select', { className: 'mod-ovr-pick' });
    for (const b of allBuildings()) {
      if (mine.has(b.id)) continue;
      pick.append(el('option', { value: `building:${b.id}`, textContent: `${b.name} — §${b.cost}` }));
    }
    for (const o of allOrdinances()) {
      if (mine.has(o.id)) continue;
      pick.append(el('option', { value: `ordinance:${o.id}`, textContent: `${o.label} — §${o.cost}/mo` }));
    }
    const go = el('button', { textContent: 'Override' });
    go.addEventListener('click', () => {
      const [kind, ...rest] = pick.value.split(':');
      editingOverride = { kind: kind as OverrideKind, id: rest.join(':') };
      renderOverrideForm(m, editingOverride.kind, editingOverride.id);
    });
    panel.append(el('div', { className: 'mods-create' }, [pick, go]));

    if (editingOverride) renderOverrideForm(m, editingOverride.kind, editingOverride.id);
  }

  function renderOverrideForm(m: StoredMod, kind: OverrideKind, targetId: string) {
    panel.querySelector('.mod-ovr-form')?.remove();

    const key = kind === 'building' ? 'buildings' : 'ordinances';
    const existing = (m.pack.overrides?.[key] ?? []).find((p) => p.id === targetId) as
      | Record<string, unknown>
      | undefined;

    const form = el('div', { className: 'mod-ovr-form' });
    form.append(el('div', { className: 'mods-effects-head' }, [el('span', { textContent: targetId })]));

    /** A number input that is blank when inherited, showing the live value. */
    function numField(label: string, inherited: number | undefined, current: unknown) {
      const input = el('input', {
        type: 'number',
        placeholder: inherited === undefined ? '—' : String(inherited),
        value: current === undefined ? '' : String(current),
      });
      form.append(field(label, input));
      return input;
    }

    const inputs: Array<{ apply: (patch: Record<string, unknown>) => void }> = [];

    if (kind === 'building') {
      const base = allBuildings().find((b) => b.id === targetId);
      const cost = numField('Cost §', base?.cost, existing?.cost);
      const upkeep = numField('Upkeep §/mo', base?.upkeep, existing?.upkeep);
      inputs.push({
        apply: (patch) => {
          if (cost.value !== '') patch.cost = Number(cost.value);
          if (upkeep.value !== '') patch.upkeep = Number(upkeep.value);
        },
      });

      if (base?.power) {
        const ex = existing?.power as Record<string, unknown> | undefined;
        const cap = numField('Capacity', base.power.capacity, ex?.capacity);
        const pol = numField('Pollution', base.power.pollution, ex?.pollution);
        inputs.push({
          apply: (patch) => {
            const power: Record<string, number> = {};
            if (cap.value !== '') power.capacity = Number(cap.value);
            if (pol.value !== '') power.pollution = Number(pol.value);
            if (Object.keys(power).length) patch.power = power;
          },
        });
      }
      if (base?.service) {
        const ex = existing?.service as Record<string, unknown> | undefined;
        const radius = numField('Radius', base.service.radius, ex?.radius);
        inputs.push({
          apply: (patch) => {
            if (radius.value !== '') patch.service = { radius: Number(radius.value) };
          },
        });
      }
      if (base?.transit) {
        const ex = existing?.transit as Record<string, unknown> | undefined;
        const radius = numField('Radius', base.transit.radius, ex?.radius);
        const share = numField('Cars/trip', base.transit.share, ex?.share);
        inputs.push({
          apply: (patch) => {
            const transit: Record<string, number> = {};
            if (radius.value !== '') transit.radius = Number(radius.value);
            if (share.value !== '') transit.share = Number(share.value);
            if (Object.keys(transit).length) patch.transit = transit;
          },
        });
      }
    } else {
      const base = allOrdinances().find((o) => o.id === targetId);
      const cost = numField('Cost §/mo', base?.cost, existing?.cost);
      inputs.push({
        apply: (patch) => {
          if (cost.value !== '') patch.cost = Number(cost.value);
        },
      });

      const exEffects = (existing?.effects ?? {}) as Record<string, unknown>;
      const effectInputs = Object.entries(base?.effects ?? {}).map(([k, v]) => {
        const input = numField(MODIFIER_LABELS[k as ModifierKey] ?? k, v as number, exEffects[k]);
        input.step = '0.05';
        return { k, input };
      });
      inputs.push({
        apply: (patch) => {
          const effects: Record<string, number> = {};
          for (const { k, input } of effectInputs) {
            if (input.value !== '') effects[k] = Number(input.value);
          }
          if (Object.keys(effects).length) patch.effects = effects;
        },
      });
    }

    const err = el('div', { className: 'mods-error' });
    const save = el('button', { textContent: 'Save', className: 'mods-primary' });
    save.addEventListener('click', () => {
      const patch: Record<string, unknown> = { id: targetId };
      for (const i of inputs) i.apply(patch);

      const was = editingOverride;
      editingOverride = undefined;
      const r = store.setOverride(m.pack.id, kind, patch as { id: string });
      if (r.ok) {
        opts.toast('Override saved', 'info');
      } else {
        editingOverride = was;
        err.textContent = r.errors.join('; ');
      }
    });
    const cancel = el('button', { textContent: 'Cancel' });
    cancel.addEventListener('click', () => {
      editingOverride = undefined;
      render();
    });

    form.append(err, el('div', { className: 'mods-form-actions' }, [save, cancel]));
    panel.append(form);
  }

  function renderOrdinanceForm(m: StoredMod, ordId: string | null) {
    // remove any prior form
    panel.querySelector('.mod-ord-form')?.remove();
    const existing = ordId ? (m.pack.ordinances ?? []).find((o) => o.id === ordId) : undefined;

    const form = el('div', { className: 'mod-ord-form' });
    const label = el('input', { type: 'text', placeholder: 'Label', value: existing?.label ?? '' });
    const blurb = el('input', { type: 'text', placeholder: 'Description', value: existing?.blurb ?? '' });
    const cost = el('input', { type: 'number', min: '0', value: String(existing?.cost ?? 0) });

    form.append(
      el('div', { className: 'mods-field' }, [el('span', { textContent: 'Label' }), label]),
      el('div', { className: 'mods-field' }, [el('span', { textContent: 'Blurb' }), blurb]),
      el('div', { className: 'mods-field' }, [el('span', { textContent: 'Cost §/mo' }), cost]),
    );

    const effectsWrap = el('div', { className: 'mods-effects' });
    const effectRows: { key: HTMLSelectElement; val: HTMLInputElement }[] = [];
    function addEffectRow(key?: ModifierKey, value?: number) {
      const sel = el('select');
      for (const k of MODIFIER_KEYS) sel.append(el('option', { value: k, textContent: MODIFIER_LABELS[k] }));
      if (key) sel.value = key;
      const val = el('input', { type: 'number', step: '0.05', value: String(value ?? 1) });
      const rm = el('button', { textContent: '×' });
      const row = el('div', { className: 'mods-effect-row' }, [sel, val, rm]);
      rm.addEventListener('click', () => {
        row.remove();
        const i = effectRows.findIndex((e) => e.key === sel);
        if (i >= 0) effectRows.splice(i, 1);
      });
      effectRows.push({ key: sel, val });
      effectsWrap.append(row);
    }
    if (existing) for (const [k, v] of Object.entries(existing.effects)) addEffectRow(k as ModifierKey, v);
    else addEffectRow();

    const addEffect = el('button', { textContent: '＋ Effect' });
    addEffect.addEventListener('click', () => addEffectRow());

    form.append(
      el('div', { className: 'mods-effects-head' }, [
        el('span', { textContent: 'Effects (×; below 1 reduces, above 1 increases)' }),
      ]),
      effectsWrap,
      addEffect,
    );

    const err = el('div', { className: 'mods-error' });
    const save = el('button', { textContent: 'Save', className: 'mods-primary' });
    save.addEventListener('click', () => {
      const draft: OrdinanceDraft = {
        label: label.value,
        blurb: blurb.value,
        cost: Number(cost.value),
        effects: effectRows.map((e) => ({ key: e.key.value as ModifierKey, value: Number(e.val.value) })),
      };
      // Close the form *before* the store call: a successful mutation fires
      // onChange synchronously and that re-render reads editingOrdId, so it has
      // to already say "not editing" or the form comes back blank.
      const wasEditing = editingOrdId;
      editingOrdId = undefined;
      const r = ordId
        ? store.updateOrdinance(m.pack.id, ordId, draft)
        : store.addOrdinance(m.pack.id, draft);
      if (r.ok) {
        opts.toast('Ordinance saved', 'info');
        // onChange already re-rendered the panel, without the form
      } else {
        // nothing fired, so this form is still mounted — reopen it and explain
        editingOrdId = wasEditing;
        err.textContent = r.errors.join('; ');
      }
    });
    const cancel = el('button', { textContent: 'Cancel' });
    cancel.addEventListener('click', () => {
      editingOrdId = undefined;
      render();
    });

    form.append(err, el('div', { className: 'mods-form-actions' }, [save, cancel]));
    panel.append(form);
  }

  /** An iso tile filling a small preview canvas, independent of the camera. */
  function previewGeom(w: number, h: number) {
    const cx = w / 2;
    const cy = h * 0.66;
    const hw = TILE_W / 2;
    const hh = TILE_H / 2;
    return {
      cx,
      cy,
      corners: [
        [cx, cy - hh],
        [cx + hw, cy],
        [cx, cy + hh],
        [cx - hw, cy],
      ] as [number, number][],
    };
  }

  function renderBuildingForm(m: StoredMod, bldId: string | null) {
    panel.querySelector('.mod-bld-form')?.remove();
    const existing = bldId ? (m.pack.buildings ?? []).find((b) => b.id === bldId) : undefined;

    const form = el('div', { className: 'mod-bld-form' });

    const name = el('input', { type: 'text', placeholder: 'Name', value: existing?.name ?? '' });
    const cost = el('input', { type: 'number', min: '0', value: String(existing?.cost ?? 500) });
    const upkeep = el('input', { type: 'number', min: '0', value: String(existing?.upkeep ?? 10) });

    const category = el('select');
    for (const [value, text] of [
      ['plain', 'Decoration'],
      ['power', 'Power plant'],
      ['service', 'Service'],
      ['transit', 'Transit stop'],
    ] as const) {
      category.append(el('option', { value, textContent: text }));
    }
    category.value = existing?.power
      ? 'power'
      : existing?.service
        ? 'service'
        : existing?.transit
          ? 'transit'
          : 'plain';

    form.append(
      field('Name', name),
      field('Category', category),
      field('Cost §', cost),
      field('Upkeep §/mo', upkeep),
    );

    // --- category-specific numbers, shown only where they mean something ---
    const capacity = el('input', { type: 'number', min: '0', value: String(existing?.power?.capacity ?? 100) });
    const pollution = el('input', { type: 'number', min: '0', step: '0.1', value: String(existing?.power?.pollution ?? 0) });
    const serviceKind = el('select');
    for (const k of ['fire', 'police', 'school', 'health', 'bus'] as const) {
      serviceKind.append(el('option', { value: k, textContent: k }));
    }
    if (existing?.service) serviceKind.value = existing.service.kind;
    const radius = el('input', {
      type: 'number', min: '1',
      value: String(existing?.service?.radius ?? existing?.transit?.radius ?? 8),
    });
    const share = el('input', {
      type: 'number', min: '0', max: '1', step: '0.05',
      value: String(existing?.transit?.share ?? existing?.service?.share ?? 0.4),
    });

    // Each control lives in exactly one row — a node appended twice would be
    // moved, not copied, so radius and share get rows of their own and are
    // shown for whichever categories use them.
    const powerRow = el('div', {}, [field('Capacity', capacity), field('Pollution', pollution)]);
    const kindRow = field('Kind', serviceKind);
    const radiusRow = field('Radius', radius);
    const shareRow = field('Cars/trip', share);
    form.append(powerRow, kindRow, radiusRow, shareRow);

    function syncCategory() {
      const c = category.value;
      powerRow.classList.toggle('hidden', c !== 'power');
      kindRow.classList.toggle('hidden', c !== 'service');
      radiusRow.classList.toggle('hidden', c !== 'service' && c !== 'transit');
      // "cars still on the road per covered trip" only means something for
      // transit and for a bus stop
      const usesShare = c === 'transit' || (c === 'service' && serviceKind.value === 'bus');
      shareRow.classList.toggle('hidden', !usesShare);
    }
    category.addEventListener('change', syncCategory);
    serviceKind.addEventListener('change', syncCategory);

    const needsWater = el('input', { type: 'checkbox', checked: !!existing?.siting?.needsWater });
    form.append(el('label', { className: 'mods-check' }, [needsWater, el('span', { textContent: 'Needs adjacent water' })]));

    const unlockExpr = el('input', { type: 'text', placeholder: 'e.g. population >= 2000', value: existing?.unlock?.expr ?? '' });
    const unlockLabel = el('input', { type: 'text', placeholder: 'e.g. pop 2,000', value: existing?.unlock?.label ?? '' });
    form.append(field('Unlock when', unlockExpr), field('Unlock text', unlockLabel));

    // --- the look, with a preview that redraws on every change ---
    form.append(el('div', { className: 'mods-effects-head' }, [el('span', { textContent: 'Look' })]));

    const v = existing?.visual;
    const footprint = el('input', { type: 'range', min: '0.3', max: '1', step: '0.05', value: String(v?.footprint ?? 0.8) });
    const height = el('input', { type: 'range', min: '6', max: '60', step: '1', value: String(v?.height ?? 24) });
    const hue = el('input', { type: 'range', min: '0', max: '359', step: '1', value: String(v?.hue ?? 210) });
    const sat = el('input', { type: 'range', min: '0', max: '100', step: '1', value: String(v?.sat ?? 40) });
    const light = el('input', { type: 'range', min: '0', max: '100', step: '1', value: String(v?.light ?? 50) });
    const roof = el('select');
    for (const r of BUILDING_ROOFS) roof.append(el('option', { value: r, textContent: r }));
    if (v) roof.value = v.roof;

    const propBoxes = BUILDING_PROPS.map((p) => {
      const box = el('input', { type: 'checkbox', checked: !!v?.props.includes(p) });
      return { p, box, node: el('label', { className: 'mods-check' }, [box, el('span', { textContent: p })]) };
    });

    const preview = el('canvas', { className: 'mod-bld-preview', width: 150, height: 110 });

    function draftVisual(): VisualDef {
      return {
        footprint: Number(footprint.value),
        height: Number(height.value),
        hue: Number(hue.value),
        sat: Number(sat.value),
        light: Number(light.value),
        roof: roof.value as VisualDef['roof'],
        props: propBoxes.filter((b) => b.box.checked).map((b) => b.p),
      };
    }

    function drawPreview() {
      const ctx = preview.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, preview.width, preview.height);
      drawAuthoredBuilding(ctx, previewGeom(preview.width, preview.height), draftVisual(), true, 2);
    }

    for (const input of [footprint, height, hue, sat, light, roof, ...propBoxes.map((b) => b.box)]) {
      input.addEventListener('input', drawPreview);
      input.addEventListener('change', drawPreview);
    }

    form.append(
      field('Size', footprint),
      field('Height', height),
      field('Hue', hue),
      field('Saturation', sat),
      field('Lightness', light),
      field('Roof', roof),
      el('div', { className: 'mods-props' }, propBoxes.map((b) => b.node)),
      preview,
    );

    const err = el('div', { className: 'mods-error' });
    const save = el('button', { textContent: 'Save', className: 'mods-primary' });
    save.addEventListener('click', () => {
      const expr = unlockExpr.value.trim();
      const draft: BuildingDraft = {
        name: name.value,
        category: category.value as BuildingDraft['category'],
        cost: Number(cost.value),
        upkeep: Number(upkeep.value),
        capacity: Number(capacity.value),
        pollution: Number(pollution.value),
        serviceKind: serviceKind.value as BuildingDraft['serviceKind'],
        radius: Number(radius.value),
        share: Number(share.value),
        unlock: expr ? { expr, label: unlockLabel.value.trim() || expr } : undefined,
        needsWater: needsWater.checked,
        visual: draftVisual(),
      };
      // Clear editing state before the store call: onChange fires synchronously
      // and the re-render reads it (same trap the ordinance form documents).
      const was = editingBldId;
      editingBldId = undefined;
      const r = bldId
        ? store.updateBuilding(m.pack.id, bldId, draft)
        : store.addBuilding(m.pack.id, draft);
      if (r.ok) {
        opts.toast('Building saved', 'info');
      } else {
        editingBldId = was;
        err.textContent = r.errors.join('; ');
      }
    });
    const cancel = el('button', { textContent: 'Cancel' });
    cancel.addEventListener('click', () => {
      editingBldId = undefined;
      render();
    });

    form.append(err, el('div', { className: 'mods-form-actions' }, [save, cancel]));
    panel.append(form);
    syncCategory();
    drawPreview();
  }

  /** Label + control, the panel's standard row. */
  function field(label: string, control: HTMLElement): HTMLElement {
    return el('div', { className: 'mods-field' }, [el('span', { textContent: label }), control]);
  }

  return {
    toggle() {
      panel.classList.toggle('hidden');
      if (!panel.classList.contains('hidden')) render();
    },
  };
}
