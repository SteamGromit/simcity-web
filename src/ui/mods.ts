/**
 * The Mods panel: create, enable/disable, export, import, and delete mods, and
 * author their ordinances. It renders the mod store and calls back into it;
 * the store owns persistence and the registry, and fires onChange so City Hall
 * refreshes. No dialogs — inline inputs keep it keyboard- and test-friendly.
 */

import { MODIFIER_KEYS, type ModifierKey } from '../content/modifiers';
import type { ModStore, OrdinanceDraft, StoredMod } from './modstore';

/** Plain-language names for the modifier vocabulary. */
const MODIFIER_LABELS: Record<ModifierKey, string> = {
  'pollution.industry': 'Industry pollution',
  'pollution.traffic': 'Traffic pollution',
  'fire.ignition': 'Fire ignition',
  'transit.share': 'Cars per transit trip',
  'coverage.school': 'School coverage',
  'disaster.pandemicOdds': 'Pandemic odds',
  'disaster.pandemicToll': 'Pandemic severity',
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

  return {
    toggle() {
      panel.classList.toggle('hidden');
      if (!panel.classList.contains('hidden')) render();
    },
  };
}
