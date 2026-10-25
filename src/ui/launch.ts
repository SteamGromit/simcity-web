/**
 * The front door.
 *
 * The game used to generate a city on load and open the File dialog over it,
 * which meant you were already somewhere before you had chosen to be. Now the
 * first screen is a choice: carry on with a region, found a new one, or play a
 * single city the way the game has always worked.
 *
 * A region is the headline, so it gets the left-hand column and the bigger
 * type. Single cities are not deprecated — they are the whole game for anyone
 * who does not want nine of them — so they keep a column of their own.
 */

import { agoLabel } from './filemenu';
import { monthLabel } from './format';
import { MAX_NAME, cleanName, type SaveMeta, type SaveStore } from './savestore';
import type { RegionMeta, RegionStore } from './regionstore';

export interface LaunchActions {
  /** Open a region's map. */
  openRegion(slug: string): void;
  /** Leave the region layer entirely and play one standalone city. */
  playSingle(save: SaveMeta | null): void;
  notify(msg: string, kind: 'info' | 'error'): void;
}

export function buildLaunchScreen(
  root: HTMLElement,
  regions: RegionStore,
  saves: SaveStore,
  actions: LaunchActions,
) {
  const screen = document.createElement('div');
  screen.id = 'launch-screen';
  screen.className = 'menu-screen hidden';
  screen.innerHTML = `
    <div class="menu-inner">
      <h1 class="menu-title">SimCity <span>Web</span></h1>
      <p class="menu-tag">Found a region. Build its cities. Trade between them.</p>
      <div class="menu-cols">
        <section class="menu-col menu-col-wide">
          <h2>Regions</h2>
          <div id="launch-regions" class="menu-list"></div>
          <div class="menu-new">
            <input type="text" id="launch-region-name" placeholder="Region name"
                   maxlength="${MAX_NAME}">
            <select id="launch-region-size" title="Region size" aria-label="Region size">
              <option value="2">2×2</option>
              <option value="3" selected>3×3</option>
              <option value="4">4×4</option>
            </select>
            <button type="button" id="launch-create" class="menu-btn menu-primary">
              New region
            </button>
          </div>
          <button type="button" id="launch-import" class="menu-link">
            Import a region from a file…
          </button>
          <div class="menu-error" id="launch-error"></div>
        </section>
        <section class="menu-col">
          <h2>A single city</h2>
          <p class="menu-note">
            One map, no neighbours — the game as it was before regions.
          </p>
          <button type="button" id="launch-single" class="menu-btn">Start a single city</button>
          <div id="launch-saves" class="menu-list"></div>
        </section>
      </div>
    </div>
    <input type="file" id="launch-picker" accept="application/json,.json" hidden>
  `;
  root.appendChild(screen);

  const regionList = screen.querySelector('#launch-regions') as HTMLElement;
  const saveList = screen.querySelector('#launch-saves') as HTMLElement;
  const nameInput = screen.querySelector('#launch-region-name') as HTMLInputElement;
  const sizeSel = screen.querySelector('#launch-region-size') as HTMLSelectElement;
  const errorEl = screen.querySelector('#launch-error') as HTMLElement;
  const picker = screen.querySelector('#launch-picker') as HTMLInputElement;

  const fail = (msg: string) => {
    errorEl.textContent = msg;
  };

  function renderRegions(now: number) {
    const list = regions.list();
    regionList.replaceChildren();
    if (list.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'menu-note';
      empty.textContent = 'No regions yet. Name one and it is yours.';
      regionList.appendChild(empty);
      return;
    }
    for (const meta of list) {
      regionList.appendChild(regionRow(meta, now));
    }
  }

  function regionRow(meta: RegionMeta, now: number): HTMLElement {
    const row = document.createElement('div');
    row.className = 'menu-row';
    const cities = meta.cities === 1 ? '1 city' : `${meta.cities} cities`;
    row.innerHTML = `
      <button type="button" class="menu-row-main">
        <span class="menu-row-name"></span>
        <span class="menu-row-meta">${cities} · pop ${meta.population.toLocaleString()} ·
          ${agoLabel(meta.saved, now)}</span>
      </button>
      <button type="button" class="menu-row-del" title="Delete this region">Delete</button>
    `;
    // textContent, not innerHTML: a region name is player-typed
    (row.querySelector('.menu-row-name') as HTMLElement).textContent = meta.name;
    row.querySelector('.menu-row-main')!.addEventListener('click', () => {
      actions.openRegion(meta.slug);
    });
    row.querySelector('.menu-row-del')!.addEventListener('click', () => {
      const del = row.querySelector('.menu-row-del') as HTMLButtonElement;
      if (del.dataset.armed !== '1') {
        del.dataset.armed = '1';
        del.textContent = 'Really?';
        window.setTimeout(() => {
          delete del.dataset.armed;
          del.textContent = 'Delete';
        }, 4000);
        return;
      }
      regions.remove(meta.slug);
      actions.notify(`Deleted “${meta.name}” and every city in it`, 'info');
      refresh();
    });
    return row;
  }

  function renderSaves(now: number) {
    const list = saves.list();
    saveList.replaceChildren();
    for (const meta of list.slice(0, 6)) {
      const row = document.createElement('div');
      row.className = 'menu-row';
      row.innerHTML = `
        <button type="button" class="menu-row-main">
          <span class="menu-row-name"></span>
          <span class="menu-row-meta">${monthLabel(meta.month)} · pop
            ${meta.population.toLocaleString()} · ${agoLabel(meta.saved, now)}</span>
        </button>
      `;
      (row.querySelector('.menu-row-name') as HTMLElement).textContent = meta.name;
      row.querySelector('.menu-row-main')!.addEventListener('click', () => {
        actions.playSingle(meta);
      });
      saveList.appendChild(row);
    }
  }

  screen.querySelector('#launch-create')!.addEventListener('click', () => {
    const name = cleanName(nameInput.value);
    if (!name) return fail('give the region a name');
    const n = Number(sizeSel.value) || 3;
    const res = regions.create(name, Date.now() % 2 ** 31, Date.now(), n, n);
    if (!res.ok) return fail(res.error);
    nameInput.value = '';
    fail('');
    actions.openRegion(res.region.slug);
  });

  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') (screen.querySelector('#launch-create') as HTMLButtonElement).click();
  });

  screen.querySelector('#launch-single')!.addEventListener('click', () => {
    actions.playSingle(null);
  });

  screen.querySelector('#launch-import')!.addEventListener('click', () => picker.click());
  picker.addEventListener('change', async () => {
    const file = picker.files?.[0];
    picker.value = '';
    if (!file) return;
    const name = cleanName(file.name.replace(/\.json$/i, ''));
    const res = regions.importRegion(name, await file.text(), Date.now());
    if (!res.ok) return fail(res.error);
    fail('');
    actions.notify(`Imported “${res.meta.name}”`, 'info');
    refresh();
  });

  function refresh() {
    const now = Date.now();
    renderRegions(now);
    renderSaves(now);
  }

  return {
    el: screen,
    open() {
      fail('');
      refresh();
      screen.classList.remove('hidden');
      document.body.classList.add('in-menu');
    },
    close() {
      screen.classList.add('hidden');
      document.body.classList.remove('in-menu');
    },
    isOpen: () => !screen.classList.contains('hidden'),
    refresh,
  };
}

export type LaunchScreen = ReturnType<typeof buildLaunchScreen>;
