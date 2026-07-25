/**
 * The File menu: everything that is about the *city as a document* rather than
 * about playing it — start one, save one under a name, load any of the ones
 * you have kept, and the mods that change what a city can contain.
 *
 * It is also the game's front door. On launch the menu opens over the map so
 * the first decision is an explicit one — carry on with a saved city, or start
 * fresh — instead of the game silently choosing for you.
 */

import { monthLabel } from './format';
import { panelHandle } from './panel';
import { cleanName, MAX_NAME, type SaveMeta, type SaveStore } from './savestore';
import type { CityState } from '../sim/types';

export interface FileActions {
  /** The city as it stands, for saving. */
  city(): CityState;
  /** Adopt a loaded city. */
  adopt(city: CityState, meta: SaveMeta): void;
  newCity(): void;
  openMods(): void;
  notify(msg: string, kind: 'info' | 'error'): void;
}

/** "3 minutes ago" / "2 days ago"; 0 means the write predates timestamps. */
export function agoLabel(saved: number, now: number): string {
  if (saved <= 0) return 'earlier';
  const secs = Math.max(0, Math.round((now - saved) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} d ago`;
}

export function buildFileMenu(root: HTMLElement, store: SaveStore, actions: FileActions) {
  const panel = document.createElement('div');
  panel.id = 'file-panel';
  panel.className = 'panel hidden';
  panel.innerHTML = `
    <h3>File</h3>
    <div class="file-actions">
      <button id="file-new" class="file-btn" type="button">New city</button>
      <button id="file-mods" class="file-btn" type="button">Mods…</button>
      <button id="file-import" class="file-btn" type="button">Import from file…</button>
    </div>
    <h4>Save the current city</h4>
    <div class="file-save-row">
      <input type="text" id="file-name" placeholder="City name" maxlength="${MAX_NAME}">
      <button id="file-save" class="file-btn file-primary" type="button">Save</button>
    </div>
    <div class="file-error" id="file-error"></div>
    <h4>Saved cities</h4>
    <div id="file-list"></div>
    <input type="file" id="file-picker" accept="application/json,.json" hidden>
  `;
  root.appendChild(panel);

  const nameInput = panel.querySelector('#file-name') as HTMLInputElement;
  const errorEl = panel.querySelector('#file-error') as HTMLElement;
  const listEl = panel.querySelector('#file-list') as HTMLElement;
  const picker = panel.querySelector('#file-picker') as HTMLInputElement;

  /** The slug the current city was last saved to, so Save overwrites it. */
  let currentSlug: string | null = null;

  const fail = (msg: string) => {
    errorEl.textContent = msg;
  };

  function metaLine(m: SaveMeta): string {
    const pop = m.population.toLocaleString();
    return `${monthLabel(m.month)} · pop ${pop} · §${Math.round(m.funds).toLocaleString()} · ${agoLabel(m.saved, Date.now())}`;
  }

  function render() {
    errorEl.textContent = '';
    listEl.innerHTML = '';
    const saves = store.list();
    if (saves.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'file-note';
      empty.textContent = 'No saved cities yet. Name the one you are playing and save it.';
      listEl.appendChild(empty);
      return;
    }
    for (const m of saves) {
      const row = document.createElement('div');
      row.className = 'file-row';
      if (m.slug === currentSlug) row.classList.add('file-current');

      const open = document.createElement('button');
      open.className = 'file-open';
      open.type = 'button';
      open.innerHTML = '<span class="file-label"></span><span class="file-blurb"></span>';
      (open.querySelector('.file-label') as HTMLElement).textContent = m.name;
      (open.querySelector('.file-blurb') as HTMLElement).textContent = metaLine(m);
      open.addEventListener('click', () => {
        const city = store.load(m.slug);
        if (!city) {
          fail(`“${m.name}” could not be read.`);
          return;
        }
        currentSlug = m.slug;
        nameInput.value = m.name;
        handle.close();
        actions.adopt(city, m);
      });

      const tools = document.createElement('div');
      tools.className = 'file-row-tools';

      const renameBtn = document.createElement('button');
      renameBtn.type = 'button';
      renameBtn.textContent = 'Rename';
      renameBtn.addEventListener('click', () => {
        const next = window.prompt(`Rename “${m.name}” to:`, m.name);
        if (next === null) return;
        const r = store.rename(m.slug, next);
        if (!r.ok) fail(r.error);
        else render();
      });

      const exportBtn = document.createElement('button');
      exportBtn.type = 'button';
      exportBtn.textContent = 'Export';
      exportBtn.title = 'Download this city as a .json file';
      exportBtn.addEventListener('click', () => {
        const json = store.exportCity(m.slug);
        if (!json) {
          fail(`“${m.name}” could not be read.`);
          return;
        }
        downloadJson(`${m.slug}.simcity.json`, json);
      });

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'file-danger';
      del.textContent = 'Delete';
      del.addEventListener('click', () => {
        if (!window.confirm(`Delete “${m.name}”? This cannot be undone.`)) return;
        store.remove(m.slug);
        if (currentSlug === m.slug) currentSlug = null;
        render();
      });

      tools.append(renameBtn, exportBtn, del);
      row.append(open, tools);
      listEl.appendChild(row);
    }
  }

  function downloadJson(filename: string, json: string): void {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  (panel.querySelector('#file-save') as HTMLButtonElement).addEventListener('click', () => {
    const name = cleanName(nameInput.value);
    if (!name) {
      fail('Give the city a name first.');
      nameInput.focus();
      return;
    }
    // Saving under the name it already has overwrites it; a new name forks a
    // new city, which is how you keep the one you started from.
    const existing = store.list().find((m) => m.name === name);
    const slug = existing?.slug ?? (currentSlug && nameIsCurrent(name) ? currentSlug : undefined);
    const r = store.save(name, actions.city(), Date.now(), slug);
    if (!r.ok) {
      fail(r.error);
      return;
    }
    currentSlug = r.meta.slug;
    render();
    actions.notify(`Saved as “${r.meta.name}”`, 'info');
  });

  /** True when the typed name is the one the current slug already carries. */
  function nameIsCurrent(name: string): boolean {
    return store.list().some((m) => m.slug === currentSlug && m.name === name);
  }

  (panel.querySelector('#file-new') as HTMLButtonElement).addEventListener('click', () => {
    if (!window.confirm('Start a new city? Anything unsaved is lost.')) return;
    currentSlug = null;
    nameInput.value = '';
    handle.close();
    actions.newCity();
  });

  (panel.querySelector('#file-mods') as HTMLButtonElement).addEventListener('click', () => {
    handle.close();
    actions.openMods();
  });

  (panel.querySelector('#file-import') as HTMLButtonElement).addEventListener('click', () => {
    picker.click();
  });

  picker.addEventListener('change', async () => {
    const file = picker.files?.[0];
    picker.value = ''; // so re-picking the same file fires again
    if (!file) return;
    const suggested = cleanName(file.name.replace(/\.simcity\.json$|\.json$/i, '')) || 'Imported city';
    const name = window.prompt('Name this city:', suggested);
    if (name === null) return;
    const r = store.importCity(name, await file.text(), Date.now());
    if (!r.ok) {
      fail(r.error);
      return;
    }
    render();
    actions.notify(`Imported “${r.meta.name}”`, 'info');
  });

  const handle = panelHandle(panel, render);

  return {
    toggle: handle.toggle,
    open: handle.open,
    close: handle.close,
    isOpen: handle.isOpen,
    /** Re-read the listing (after an outside change). */
    refresh: render,
    /** Point Save at a city that was just loaded or created. */
    setCurrent(meta: SaveMeta | null) {
      currentSlug = meta?.slug ?? null;
      nameInput.value = meta?.name ?? '';
    },
  };
}
