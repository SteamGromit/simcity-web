import { CityState } from '../sim/types';
import { WeatherKind } from '../sim/weather';
import { monthLabel } from './format';
import { panelHandle } from './panel';

const WEATHER_EMOJI: Record<WeatherKind, string> = {
  clear: '☀️',
  cloudy: '⛅',
  rain: '🌧️',
  snow: '❄️',
};

/** The panels the control bar can summon; the bar outlines whichever are open. */
export type PanelId = 'budget' | 'cityhall' | 'charts' | 'display' | 'file';

export interface HudActions {
  setSpeed(speed: 0 | 1 | 2 | 3): void;
  toggle(panel: Exclude<PanelId, 'budget'>): void;
  /** Which panels are open right now, read every frame to outline their buttons. */
  isOpen(panel: Exclude<PanelId, 'budget'>): boolean;
}

const SPEED_LABELS = ['⏸', '▶', '▶▶', '▶▶▶'];

const PANEL_BUTTONS: { id: Exclude<PanelId, 'budget'>; label: string; title: string }[] = [
  { id: 'cityhall', label: 'City Hall', title: 'Ordinances, city make-up, and tempting fate' },
  { id: 'charts', label: 'Charts', title: 'The city’s history, series by series' },
  { id: 'display', label: 'Config', title: 'Look, sound, and render style' },
  { id: 'file', label: 'File', title: 'New, save, load, and mods' },
];

export function buildHud(root: HTMLElement, city: () => CityState, actions: HudActions) {
  const el = document.createElement('div');
  el.id = 'hud';
  el.className = 'panel';
  el.innerHTML = `
    <span class="stat" id="funds"><span class="k">Funds</span><b>0</b></span>
    <span class="stat"><span class="k">Population</span><b id="pop">0</b></span>
    <span class="stat"><span class="k">Date</span><b id="date">Jan 2000</b></span>
    <canvas id="rci" width="66" height="44"></canvas>
    <span class="speed-group" id="speeds"></span>
    <button id="budget-btn" title="Tax rates and last month's ledger">Budget</button>
  `;
  root.appendChild(el);

  // One button per panel, each outlined while its panel is open.
  const panelButtons = new Map<Exclude<PanelId, 'budget'>, HTMLButtonElement>();
  for (const { id, label, title } of PANEL_BUTTONS) {
    const btn = document.createElement('button');
    btn.id = `${id}-btn`;
    btn.textContent = label;
    btn.title = title;
    btn.addEventListener('click', () => actions.toggle(id));
    panelButtons.set(id, btn);
    el.appendChild(btn);
  }

  const fundsEl = el.querySelector('#funds') as HTMLElement;
  const fundsVal = fundsEl.querySelector('b')!;
  const popEl = el.querySelector('#pop') as HTMLElement;
  const dateEl = el.querySelector('#date') as HTMLElement;
  const rci = (el.querySelector('#rci') as HTMLCanvasElement).getContext('2d')!;

  const speedsEl = el.querySelector('#speeds') as HTMLElement;
  const speedButtons: HTMLButtonElement[] = [];
  const showActiveSpeed = (i: number) =>
    speedButtons.forEach((b, j) => b.classList.toggle('active', j === i));
  SPEED_LABELS.forEach((label, i) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.title = ['Pause', 'Normal', 'Fast', 'Cheetah'][i];
    btn.addEventListener('click', () => {
      actions.setSpeed(i as 0 | 1 | 2 | 3);
      showActiveSpeed(i);
    });
    speedButtons.push(btn);
    speedsEl.appendChild(btn);
  });
  showActiveSpeed(1);

  // --- budget panel ---
  const budget = document.createElement('div');
  budget.id = 'budget-panel';
  budget.className = 'panel hidden';
  budget.innerHTML = `
    <h3>Budget &amp; Taxes</h3>
    ${(['r', 'c', 'i'] as const)
      .map(
        (s) => `
      <div class="tax-row">
        <span>${s.toUpperCase()}</span>
        <input type="range" min="0" max="20" step="1" data-sector="${s}">
        <span class="pct" data-pct="${s}">9%</span>
      </div>`,
      )
      .join('')}
    <div class="report" id="budget-report"></div>
  `;
  root.appendChild(budget);
  let renderedBudget: CityState['lastBudget'] | null = null;
  const budgetBtn = el.querySelector('#budget-btn') as HTMLButtonElement;
  const budgetPanel = panelHandle(budget, () => {
    renderedBudget = null; // force a fresh report render on open
  });
  budgetBtn.addEventListener('click', budgetPanel.toggle);

  const report = budget.querySelector('#budget-report') as HTMLElement;
  for (const input of budget.querySelectorAll<HTMLInputElement>('input[type=range]')) {
    const sector = input.dataset.sector as 'r' | 'c' | 'i';
    input.value = String(Math.round(city().taxes[sector] * 100));
    input.addEventListener('input', () => {
      city().taxes[sector] = Number(input.value) / 100;
      (budget.querySelector(`[data-pct="${sector}"]`) as HTMLElement).textContent =
        `${input.value}%`;
    });
  }

  function drawRci(c: CityState) {
    rci.clearRect(0, 0, 66, 44);
    const mid = 20;
    const colors = ['#4dc464', '#5b8ff0', '#e8cf4a'];
    [c.demand.r, c.demand.c, c.demand.i].forEach((d, i) => {
      const x = 8 + i * 20;
      const h = d * 16;
      rci.fillStyle = colors[i];
      if (h >= 0) rci.fillRect(x, mid - h, 12, Math.max(1, h));
      else rci.fillRect(x, mid, 12, -h);
    });
    rci.strokeStyle = '#5a6664';
    rci.beginPath();
    rci.moveTo(2, mid);
    rci.lineTo(64, mid);
    rci.stroke();
    rci.fillStyle = '#8b9793';
    rci.font = '600 9px "Arial Narrow", "Liberation Sans Narrow", sans-serif';
    ['R', 'C', 'I'].forEach((l, i) => rci.fillText(l, 12 + i * 20, 43));
  }

  return {
    update(c: CityState) {
      fundsVal.textContent = c.funds.toLocaleString();
      fundsEl.classList.toggle('deficit', c.funds < 0);
      popEl.textContent = c.population.toLocaleString();
      dateEl.textContent = `${monthLabel(c.month)} ${WEATHER_EMOJI[c.weather.kind]}`;
      drawRci(c);
      // the bar says what's on screen: an open panel keeps its button ringed
      budgetBtn.classList.toggle('open', budgetPanel.isOpen());
      for (const [id, btn] of panelButtons) btn.classList.toggle('open', actions.isOpen(id));
      if (budgetPanel.isOpen() && renderedBudget !== c.lastBudget) {
        renderedBudget = c.lastBudget;
        const b = c.lastBudget;
        report.innerHTML = `
          <div><span>Residential</span><span>+§${b.rIncome}</span></div>
          <div><span>Commercial</span><span>+§${b.cIncome}</span></div>
          <div><span>Industrial</span><span>+§${b.iIncome}</span></div>
          <div><span>Expenses</span><span>−§${b.expenses}</span></div>
          <div><b>Net</b><b>${b.net >= 0 ? '+' : '−'}§${Math.abs(b.net)}</b></div>
        `;
      }
    },
    /** Reflect a programmatic speed change (e.g. error-pause) in the buttons. */
    showActiveSpeed,
    /** Re-sync tax sliders after loading a different city. */
    syncTaxes(c: CityState) {
      for (const input of budget.querySelectorAll<HTMLInputElement>('input[type=range]')) {
        const sector = input.dataset.sector as 'r' | 'c' | 'i';
        input.value = String(Math.round(c.taxes[sector] * 100));
        (budget.querySelector(`[data-pct="${sector}"]`) as HTMLElement).textContent =
          `${input.value}%`;
      }
    },
  };
}
