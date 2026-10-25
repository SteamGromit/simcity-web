/**
 * The Neighbours panel: what the cities next door will sell you.
 *
 * Deals are made here rather than on the region map because here is where the
 * shortage is felt — you notice the brownouts, open this, and find out that
 * the town across the river has three hundred megawatts doing nothing. The
 * contract itself belongs to the region (see sim/region.ts); this panel only
 * opens and closes them, and re-derives the city's `neighbors` block whenever
 * it does.
 */

import { panelHandle } from './panel';
import {
  canOpenDeal,
  closeDeal,
  connected,
  dealPrice,
  neighborsOf,
  openDeal,
  regionIndex,
  type DealKind,
  type Region,
} from '../sim/region';

export interface NeighborActions {
  /** The region being played, and which tile this city sits on. */
  context(): { region: Region; col: number; row: number } | null;
  /** A contract was opened or closed: re-derive and persist. */
  changed(): void;
  notify(msg: string, kind: 'info' | 'error'): void;
}

const KINDS: {
  kind: DealKind;
  label: string;
  unit: string;
  spare: 'sparePower' | 'spareGarbage' | 'spareWater';
}[] = [
  { kind: 'power', label: 'Power', unit: 'MW', spare: 'sparePower' },
  { kind: 'garbage', label: 'Refuse', unit: 't', spare: 'spareGarbage' },
  { kind: 'water', label: 'Water', unit: ' tiles', spare: 'spareWater' },
];

export function buildNeighborsPanel(root: HTMLElement, actions: NeighborActions) {
  const panel = document.createElement('div');
  panel.id = 'neighbors-panel';
  panel.className = 'panel hidden';
  panel.innerHTML = `
    <h3>Neighbours</h3>
    <div id="neighbors-body"></div>
  `;
  root.appendChild(panel);

  const body = panel.querySelector('#neighbors-body') as HTMLElement;
  const handle = panelHandle(panel, () => render());

  function render() {
    const ctx = actions.context();
    body.replaceChildren();
    if (!ctx) {
      body.appendChild(note('This city stands on its own — it has no region around it.'));
      return;
    }
    const { region, col, row } = ctx;
    const me = regionIndex(region, col, row);
    const others = neighborsOf(region, me).filter((n) => region.tiles[n].founded);

    if (others.length === 0) {
      body.appendChild(
        note('No city has been founded beside this one yet. Found one from the region map.'),
      );
    }

    for (const other of others) {
      body.appendChild(neighborBlock(region, me, other));
    }

    const mine = region.deals.filter((d) => d.seller === me || d.buyer === me);
    const heading = document.createElement('h4');
    heading.textContent = 'Your contracts';
    body.appendChild(heading);
    if (mine.length === 0) {
      body.appendChild(note('None.'));
      return;
    }
    let net = 0;
    for (const d of mine) {
      const selling = d.seller === me;
      net += selling ? d.price : -d.price;
      const kind = KINDS.find((k) => k.kind === d.kind)!;
      const withWhom = region.tiles[selling ? d.buyer : d.seller];
      const row_ = document.createElement('div');
      row_.className = 'neighbor-deal';
      row_.innerHTML = `
        <span class="neighbor-deal-text"></span>
        <button type="button" class="menu-btn neighbor-close">End</button>
      `;
      (row_.querySelector('.neighbor-deal-text') as HTMLElement).textContent =
        `${selling ? 'Selling' : 'Buying'} ${d.amount.toLocaleString()}${kind.unit} of ` +
        `${kind.label.toLowerCase()} ${selling ? 'to' : 'from'} ${withWhom?.name ?? 'a neighbour'} ` +
        `— ${selling ? '+' : '−'}§${d.price.toLocaleString()} a month`;
      row_.querySelector('.neighbor-close')!.addEventListener('click', () => {
        closeDeal(region, d.id);
        actions.changed();
        actions.notify('Contract ended', 'info');
        render();
      });
      body.appendChild(row_);
    }
    const total = document.createElement('p');
    total.className = 'neighbor-total';
    total.textContent =
      net === 0
        ? 'The contracts balance out at nothing a month.'
        : `Net ${net > 0 ? '+' : '−'}§${Math.abs(net).toLocaleString()} a month.`;
    body.appendChild(total);
  }

  function neighborBlock(region: Region, me: number, other: number): HTMLElement {
    const them = region.tiles[other];
    const block = document.createElement('div');
    block.className = 'neighbor-block';
    const link = connected(region, me, other);
    const head = document.createElement('h4');
    head.textContent = them.name;
    block.appendChild(head);

    const status = document.createElement('p');
    status.className = 'neighbor-status';
    status.textContent = link
      ? `Joined by road · pop ${them.population.toLocaleString()} · ` +
        `${them.jobs.toLocaleString()} jobs feeding your demand`
      : `No road crosses this border · pop ${them.population.toLocaleString()} · ` +
        'run a road to the map edge on both sides to join them up';
    block.appendChild(status);

    for (const k of KINDS) {
      const spare = them[k.spare];
      const already = region.deals.some(
        (d) => d.kind === k.kind && d.seller === other && d.buyer === me,
      );
      const line = document.createElement('div');
      line.className = 'neighbor-offer';
      if (already) {
        line.appendChild(note(`${k.label}: under contract.`));
        block.appendChild(line);
        continue;
      }
      if (spare <= 0) {
        line.appendChild(note(`${k.label}: nothing going spare.`));
        block.appendChild(line);
        continue;
      }
      line.innerHTML = `
        <label class="neighbor-label"></label>
        <input type="range" min="1" max="${spare}" value="${Math.round(spare / 2)}">
        <span class="neighbor-amount"></span>
        <button type="button" class="menu-btn menu-primary neighbor-buy">Buy</button>
      `;
      const label = line.querySelector('.neighbor-label') as HTMLElement;
      label.textContent = `${k.label} — ${spare.toLocaleString()}${k.unit} spare`;
      const slider = line.querySelector('input') as HTMLInputElement;
      const amountEl = line.querySelector('.neighbor-amount') as HTMLElement;
      const syncAmount = () => {
        const amount = Number(slider.value);
        amountEl.textContent = `${amount.toLocaleString()}${k.unit} · §${dealPrice(
          k.kind,
          amount,
        ).toLocaleString()}/mo`;
      };
      slider.addEventListener('input', syncAmount);
      syncAmount();
      line.querySelector('.neighbor-buy')!.addEventListener('click', () => {
        const amount = Number(slider.value);
        const why = canOpenDeal(region, k.kind, other, me, amount);
        if (why) {
          actions.notify(why, 'error');
          render();
          return;
        }
        openDeal(region, k.kind, other, me, amount);
        actions.changed();
        actions.notify(
          `${them.name} will supply ${amount.toLocaleString()}${k.unit} of ` +
            `${k.label.toLowerCase()}`,
          'info',
        );
        render();
      });
      block.appendChild(line);
    }
    return block;
  }

  function note(text: string): HTMLElement {
    const p = document.createElement('p');
    p.className = 'menu-note';
    p.textContent = text;
    return p;
  }

  return { ...handle, el: panel, refresh: render };
}

export type NeighborsPanel = ReturnType<typeof buildNeighborsPanel>;
