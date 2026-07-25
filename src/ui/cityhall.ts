import { allOrdinances } from '../content/registry';
import type { OrdinanceDef } from '../content/types';
import { CityState, DisasterKind } from '../sim/types';
import { tierBreakdown } from '../sim/tierstats';
import { panelHandle } from './panel';

/**
 * City Hall: what the city is made of, what it has legislated, and the button
 * that tempts fate.
 *
 * The advisors used to head this panel, and their list grew and shrank as the
 * city's mood changed — which moved every control below it out from under the
 * cursor. The advisors now speak through the event log (see ui/eventlog.ts),
 * and everything left here has a fixed height.
 */
export function buildCityHall(
  root: HTMLElement,
  city: () => CityState,
  onToggle: () => void,
  onDisaster: (kind: DisasterKind) => void,
) {
  const panel = document.createElement('div');
  panel.id = 'cityhall-panel';
  panel.className = 'panel hidden';
  panel.innerHTML = `
    <h3>City Hall</h3>
    <h4>City make-up</h4>
    <div id="tier-breakdown"></div>
    <h4>Ordinances · monthly cost</h4>
    <div id="ordinance-list"></div>
    <h4>Disasters · tempt fate</h4>
    <div id="disaster-list"></div>
  `;
  root.appendChild(panel);

  const tierPanel = panel.querySelector('#tier-breakdown') as HTMLElement;
  const ordinanceList = panel.querySelector('#ordinance-list') as HTMLElement;

  function buildOrdinanceRow(o: OrdinanceDef): HTMLElement {
    const row = document.createElement('label');
    row.className = 'ordinance';
    row.title = o.blurb;
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.addEventListener('change', () => {
      city().ordinances[o.id] = box.checked;
      onToggle();
    });
    const text = document.createElement('span');
    text.textContent = o.label;
    const cost = document.createElement('span');
    cost.className = 'cost';
    cost.textContent = `§${o.cost}`;
    row.append(box, text, cost);
    return row;
  }

  function renderOrdinances(): void {
    ordinanceList.innerHTML = '';
    for (const o of allOrdinances()) ordinanceList.appendChild(buildOrdinanceRow(o));
  }

  renderOrdinances();

  const disasterList = panel.querySelector('#disaster-list') as HTMLElement;
  for (const kind of ['tornado', 'hurricane', 'pandemic'] as DisasterKind[]) {
    const btn = document.createElement('button');
    btn.textContent = { tornado: '🌪 Tornado', hurricane: '🌀 Hurricane', pandemic: '🦠 Pandemic' }[
      kind
    ];
    btn.addEventListener('click', () => onDisaster(kind));
    disasterList.appendChild(btn);
  }

  let lastRender = 0;
  const syncBoxes = () => {
    const boxes = ordinanceList.querySelectorAll<HTMLInputElement>('input');
    allOrdinances().forEach((o, i) => {
      const box = boxes[i];
      if (!box) return; // a runtime-loaded pack can add more ordinances than we have checkboxes for
      box.checked = city().ordinances[o.id];
    });
  };

  const handle = panelHandle(panel, () => {
    syncBoxes();
    lastRender = 0; // force a fresh make-up read
  });

  return {
    toggle: handle.toggle,
    open: handle.open,
    close: handle.close,
    isOpen: handle.isOpen,
    update(c: CityState, now: number) {
      if (!handle.isOpen() || now - lastRender < 1000) return;
      lastRender = now;
      const b = tierBreakdown(c);
      const pop = b.wealth[1] + b.wealth[2] + b.wealth[3];
      const jobs = b.industry.ag + b.industry.dirty + b.industry.manu + b.industry.tech;
      const pct = (n: number, total: number) =>
        total === 0 ? '—' : `${Math.round((n / total) * 100)}%`;
      tierPanel.innerHTML = `
        <div class="tier-row"><span>Residents §/§§/§§§</span><span>${pct(b.wealth[1], pop)} · ${pct(b.wealth[2], pop)} · ${pct(b.wealth[3], pop)}</span></div>
        <div class="tier-row"><span>Farm jobs</span><span>${pct(b.industry.ag, jobs)}</span></div>
        <div class="tier-row"><span>Dirty industry</span><span>${pct(b.industry.dirty, jobs)}</span></div>
        <div class="tier-row"><span>Manufacturing</span><span>${pct(b.industry.manu, jobs)}</span></div>
        <div class="tier-row"><span>High-tech</span><span>${pct(b.industry.tech, jobs)}</span></div>
        <div class="tier-row"><span>Education</span><span>${Math.round(c.eduLevel * 100)}%</span></div>
      `;
    },
    /** Re-sync checkboxes after loading a different city. */
    syncBoxes,
    /** Re-render the ordinance rows from the registry (a mod was enabled/edited). */
    rebuildOrdinances() {
      renderOrdinances();
      syncBoxes();
    },
  };
}
