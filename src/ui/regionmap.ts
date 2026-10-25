/**
 * The region map: what stands on each city tile, and the way in.
 *
 * Every tile is either unclaimed land or a founded city. A founded city shows
 * the numbers the region keeps mirrored for it — population, treasury, date —
 * so this screen never has to parse a city blob to draw itself. Borders that
 * carry a road are drawn between the tiles that share them, because a
 * connection is the thing that makes two cities one region rather than two
 * saves that happen to sit near each other.
 */

import { monthLabel } from './format';
import { MAX_NAME, cleanName } from './savestore';
import {
  connected,
  defaultCityName,
  neighborsOf,
  regionIndex,
  regionPopulation,
  sharedEdge,
  worldOf,
  type Region,
} from '../sim/region';
import { paintLand, type Link } from './regionland';

export interface RegionMapActions {
  /** Play the city on this tile, founding it first if it is empty. */
  enter(col: number, row: number, name: string): void;
  /** Back to the launch screen. */
  leave(): void;
  /** Raze a city back to unclaimed land. */
  raze(col: number, row: number): void;
  notify(msg: string, kind: 'info' | 'error'): void;
}

export function buildRegionMap(root: HTMLElement, actions: RegionMapActions) {
  const screen = document.createElement('div');
  screen.id = 'region-screen';
  screen.className = 'menu-screen hidden';
  screen.innerHTML = `
    <div class="menu-inner region-inner">
      <header class="region-head">
        <div>
          <h1 class="menu-title region-title" id="region-name"></h1>
          <p class="menu-tag" id="region-stats"></p>
        </div>
        <button type="button" id="region-back" class="menu-btn">← All regions</button>
      </header>
      <div id="region-grid" class="region-grid"></div>
      <section class="region-contracts">
        <h2>Contracts</h2>
        <div id="region-deals" class="menu-list"></div>
      </section>
    </div>
  `;
  root.appendChild(screen);

  const nameEl = screen.querySelector('#region-name') as HTMLElement;
  const statsEl = screen.querySelector('#region-stats') as HTMLElement;
  const gridEl = screen.querySelector('#region-grid') as HTMLElement;
  const dealsEl = screen.querySelector('#region-deals') as HTMLElement;

  screen.querySelector('#region-back')!.addEventListener('click', () => actions.leave());

  let current: Region | null = null;

  function render(region: Region) {
    current = region;
    nameEl.textContent = region.name;
    const founded = region.tiles.filter((t) => t.founded).length;
    statsEl.textContent =
      `${founded === 1 ? '1 city' : `${founded} cities`} · ` +
      `population ${regionPopulation(region).toLocaleString()} · ` +
      `${region.biome === 'desert' ? 'desert' : 'temperate'} country`;

    gridEl.style.gridTemplateColumns = `repeat(${region.cols}, minmax(0, 1fr))`;
    gridEl.replaceChildren();
    for (const t of region.tiles) {
      gridEl.appendChild(tileCard(region, t.col, t.row));
    }
    renderDeals(region);
  }

  function tileCard(region: Region, col: number, row: number): HTMLElement {
    const i = regionIndex(region, col, row);
    const t = region.tiles[i];
    const card = document.createElement('div');
    card.className = `region-tile${t.founded ? ' founded' : ''}`;

    // The land first: every card samples the same field, so the cards laid
    // edge to edge are one drawn country. A joined border is ticked in gold.
    const links: Link[] = [];
    const joinedTo = neighborsOf(region, i).filter((n) => connected(region, i, n));
    for (const n of joinedTo) {
      const edges = sharedEdge(region, i, n);
      if (!edges) continue;
      const theirs = new Set(region.tiles[n].edges[edges[1]]);
      links.push({ edge: edges[0], positions: t.edges[edges[0]].filter((p) => theirs.has(p)) });
    }
    const land = document.createElement('canvas');
    land.className = 'region-land';
    paintLand(land, worldOf(region), t, links);
    card.appendChild(land);

    const scrim = document.createElement('div');
    scrim.className = 'region-tile-scrim';
    card.appendChild(scrim);

    if (!t.founded) {
      scrim.innerHTML = `
        <span class="region-tile-empty">Unclaimed land</span>
        <button type="button" class="menu-btn region-found">Found a city</button>
      `;
      scrim.querySelector('.region-found')!.addEventListener('click', () => {
        const proposed = window.prompt('Name the city', defaultCityName(region, col, row));
        if (proposed === null) return; // cancelled
        const name = cleanName(proposed.slice(0, MAX_NAME)) || defaultCityName(region, col, row);
        actions.enter(col, row, name);
      });
      return card;
    }

    const crossings = joinedTo.length;
    scrim.innerHTML = `
      <span class="region-tile-name"></span>
      <span class="region-tile-meta"></span>
      <span class="region-tile-links"></span>
      <div class="region-tile-actions">
        <button type="button" class="menu-btn menu-primary region-enter">Play</button>
        <button type="button" class="menu-btn region-raze" title="Raze this city">Raze</button>
      </div>
    `;
    (scrim.querySelector('.region-tile-name') as HTMLElement).textContent = t.name;
    (scrim.querySelector('.region-tile-meta') as HTMLElement).textContent =
      `pop ${t.population.toLocaleString()} · §${t.funds.toLocaleString()} · ${monthLabel(t.month)}`;
    (scrim.querySelector('.region-tile-links') as HTMLElement).textContent =
      crossings === 0 ? 'no road to a neighbour' : crossings === 1 ? '1 border crossing' : `${crossings} border crossings`;

    scrim.querySelector('.region-enter')!.addEventListener('click', () => {
      actions.enter(col, row, t.name);
    });
    const raze = scrim.querySelector('.region-raze') as HTMLButtonElement;
    raze.addEventListener('click', () => {
      if (raze.dataset.armed !== '1') {
        raze.dataset.armed = '1';
        raze.textContent = 'Really?';
        window.setTimeout(() => {
          delete raze.dataset.armed;
          raze.textContent = 'Raze';
        }, 4000);
        return;
      }
      actions.raze(col, row);
    });
    return card;
  }

  function renderDeals(region: Region) {
    dealsEl.replaceChildren();
    if (region.deals.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'menu-note';
      empty.textContent =
        'None yet. Open one from inside a city — the Neighbours panel lists what the ' +
        'cities beside it have going spare.';
      dealsEl.appendChild(empty);
      return;
    }
    for (const d of region.deals) {
      const seller = region.tiles[d.seller];
      const buyer = region.tiles[d.buyer];
      const row = document.createElement('div');
      row.className = 'menu-row menu-row-static';
      const unit = d.kind === 'power' ? 'MW of power' : 'tonnes of refuse';
      row.innerHTML = `<span class="menu-row-meta"></span>`;
      (row.querySelector('.menu-row-meta') as HTMLElement).textContent =
        `${seller?.name ?? 'a city'} → ${buyer?.name ?? 'a city'}: ` +
        `${d.amount.toLocaleString()} ${unit} for §${d.price.toLocaleString()} a month`;
      dealsEl.appendChild(row);
    }
  }

  return {
    el: screen,
    open(region: Region) {
      render(region);
      screen.classList.remove('hidden');
      document.body.classList.add('in-menu');
    },
    close() {
      screen.classList.add('hidden');
      document.body.classList.remove('in-menu');
    },
    isOpen: () => !screen.classList.contains('hidden'),
    /** Redraw from the region as it now stands. */
    refresh() {
      if (current) render(current);
    },
  };
}

export type RegionMap = ReturnType<typeof buildRegionMap>;
