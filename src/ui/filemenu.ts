/**
 * The File menu: everything that is about the *city as a document* rather than
 * about playing it — start one, save one, load one, and the mods that change
 * what a city can contain. Those were four separate buttons cluttering the
 * control bar; they are one now.
 *
 * It is also the game's front door. On launch the menu opens over the map so
 * the first decision is an explicit one — carry on with the saved city, or
 * start fresh — instead of the game silently choosing for you.
 */

import { panelHandle } from './panel';

export interface FileActions {
  newCity(): void;
  save(): void;
  load(): void;
  openMods(): void;
  /** True when there is a save worth loading. */
  hasSave(): boolean;
}

interface Entry {
  id: keyof Omit<FileActions, 'hasSave'>;
  label: string;
  blurb: string;
  /** Greyed out when there is nothing saved. */
  needsSave?: boolean;
  primary?: boolean;
}

const ENTRIES: Entry[] = [
  {
    id: 'load',
    label: 'Load saved city',
    blurb: 'Pick up the city in browser storage where you left it.',
    needsSave: true,
    primary: true,
  },
  {
    id: 'newCity',
    label: 'New city',
    blurb: 'Generate fresh terrain and start over. Unsaved progress is lost.',
  },
  { id: 'save', label: 'Save city', blurb: 'Write the city to browser storage.' },
  {
    id: 'openMods',
    label: 'Mods…',
    blurb: 'Create, enable, import and author mods.',
  },
];

export function buildFileMenu(root: HTMLElement, actions: FileActions) {
  const panel = document.createElement('div');
  panel.id = 'file-panel';
  panel.className = 'panel hidden';
  panel.innerHTML = '<h3>File</h3><div id="file-entries"></div><p class="file-note"></p>';
  root.appendChild(panel);

  const entries = panel.querySelector('#file-entries') as HTMLElement;
  const note = panel.querySelector('.file-note') as HTMLElement;
  const buttons = new Map<Entry['id'], HTMLButtonElement>();

  for (const entry of ENTRIES) {
    const btn = document.createElement('button');
    btn.className = 'file-entry';
    if (entry.primary) btn.classList.add('file-primary');
    btn.innerHTML = `<span class="file-label"></span><span class="file-blurb"></span>`;
    (btn.querySelector('.file-label') as HTMLElement).textContent = entry.label;
    (btn.querySelector('.file-blurb') as HTMLElement).textContent = entry.blurb;
    btn.addEventListener('click', () => {
      // every entry lands you back on the map; the menu has done its job
      handle.close();
      actions[entry.id]();
    });
    buttons.set(entry.id, btn);
    entries.appendChild(btn);
  }

  function sync() {
    const has = actions.hasSave();
    for (const entry of ENTRIES) {
      if (!entry.needsSave) continue;
      const btn = buttons.get(entry.id)!;
      btn.disabled = !has;
      btn.title = has ? '' : 'Nothing saved yet.';
    }
    note.textContent = has
      ? 'Saving overwrites the one city this browser keeps.'
      : 'No saved city yet — start a new one.';
  }

  const handle = panelHandle(panel, sync);
  return {
    toggle: handle.toggle,
    open: handle.open,
    close: handle.close,
    isOpen: handle.isOpen,
    /** Re-read whether a save exists (after saving, or after a fresh start). */
    sync,
  };
}
