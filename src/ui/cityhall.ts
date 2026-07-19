import { CityState, DisasterKind, ORDINANCES } from '../sim/types';
import { getSkin, setSkin, SKINS } from '../render/skins';
import { getWeatherFx, setWeatherFx } from '../render/fx';
import { adviseTips } from '../sim/tips';

/** City Hall: the advisor board (every active tip) and ordinance toggles. */
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
    <h4>Advisors</h4>
    <ul id="advisor-list"></ul>
    <h4>Ordinances · monthly cost</h4>
    <div id="ordinance-list"></div>
    <h4>Disasters · tempt fate</h4>
    <div id="disaster-list"></div>
    <h4>City style</h4>
    <div id="skin-list"></div>
    <h4>Display</h4>
    <label class="ordinance" id="weatherfx-row" title="Rain, snow, and cloud visuals. The simulation (and hurricane rain) is unaffected.">
      <input type="checkbox" id="weatherfx-box"><span>Weather effects</span>
    </label>
  `;
  root.appendChild(panel);

  const advisorList = panel.querySelector('#advisor-list') as HTMLElement;
  const ordinanceList = panel.querySelector('#ordinance-list') as HTMLElement;

  for (const o of ORDINANCES) {
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
    ordinanceList.appendChild(row);
  }

  const disasterList = panel.querySelector('#disaster-list') as HTMLElement;
  for (const kind of ['tornado', 'hurricane', 'pandemic'] as DisasterKind[]) {
    const btn = document.createElement('button');
    btn.textContent = { tornado: '🌪 Tornado', hurricane: '🌀 Hurricane', pandemic: '🦠 Pandemic' }[
      kind
    ];
    btn.addEventListener('click', () => onDisaster(kind));
    disasterList.appendChild(btn);
  }

  const skinList = panel.querySelector('#skin-list') as HTMLElement;
  const skinButtons: HTMLButtonElement[] = [];
  const syncSkins = () =>
    SKINS.forEach((sk, i) => skinButtons[i].classList.toggle('active', getSkin().id === sk.id));
  for (const sk of SKINS) {
    const btn = document.createElement('button');
    btn.textContent = sk.label;
    btn.title = sk.blurb;
    btn.addEventListener('click', () => {
      setSkin(sk.id);
      localStorage.setItem('simcity.skin', sk.id);
      syncSkins();
      onToggle();
    });
    skinButtons.push(btn);
    skinList.appendChild(btn);
  }
  syncSkins();

  const fxBox = panel.querySelector('#weatherfx-box') as HTMLInputElement;
  fxBox.checked = getWeatherFx();
  fxBox.addEventListener('change', () => {
    setWeatherFx(fxBox.checked);
    localStorage.setItem('simcity.weatherfx', fxBox.checked ? '1' : '0');
    onToggle();
  });

  let lastTipRender = 0;
  const syncBoxes = () => {
    const boxes = ordinanceList.querySelectorAll<HTMLInputElement>('input');
    ORDINANCES.forEach((o, i) => {
      boxes[i].checked = city().ordinances[o.id];
    });
  };

  return {
    toggle() {
      panel.classList.toggle('hidden');
      if (!panel.classList.contains('hidden')) {
        syncBoxes();
        lastTipRender = 0; // force a fresh advisor list
      }
    },
    update(c: CityState, now: number) {
      if (panel.classList.contains('hidden') || now - lastTipRender < 1000) return;
      lastTipRender = now;
      const tips = adviseTips(c);
      advisorList.innerHTML = tips.length
        ? tips.map((t) => `<li>${t.text}</li>`).join('')
        : '<li class="quiet">No complaints — the city hums along.</li>';
    },
    /** Re-sync checkboxes after loading a different city. */
    syncBoxes,
  };
}
