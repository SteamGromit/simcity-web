import { getSkin, setSkin, SKINS } from '../render/skins';
import { getWeatherFx, setWeatherFx } from '../render/fx';
import { getDayNight, setDayNight } from '../render/daynight';

/** Display panel: presentation preferences only — city style, weather
 * visuals, music, and the day/night lighting cycle. No city state. */
export function buildDisplay(
  root: HTMLElement,
  music: { isOn(): boolean; toggle(): boolean },
  onToggle: () => void,
) {
  const panel = document.createElement('div');
  panel.id = 'display-panel';
  panel.className = 'panel hidden';
  panel.innerHTML = `
    <h3>Display</h3>
    <h4>City style</h4>
    <div id="skin-list"></div>
    <label class="ordinance" id="weatherfx-row" title="Rain, snow, and cloud visuals. The simulation (and hurricane rain) is unaffected.">
      <input type="checkbox" id="weatherfx-box"><span>Weather effects</span>
    </label>
    <label class="ordinance" id="music-row" title="Procedural soundtrack that follows your city's biome, season, weather, and growth. M mutes everything.">
      <input type="checkbox" id="music-box"><span>Music</span>
    </label>
    <label class="ordinance" id="daynight-row" title="90-second visual day/night cycle: night wash, window glow, streetlights. Off keeps permanent daylight.">
      <input type="checkbox" id="daynight-box"><span>Day/night lighting</span>
    </label>
  `;
  root.appendChild(panel);

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

  const musicBox = panel.querySelector('#music-box') as HTMLInputElement;
  musicBox.checked = music.isOn();
  musicBox.addEventListener('change', () => {
    music.toggle();
    musicBox.checked = music.isOn();
    onToggle();
  });

  const dnBox = panel.querySelector('#daynight-box') as HTMLInputElement;
  dnBox.checked = getDayNight();
  dnBox.addEventListener('change', () => {
    setDayNight(dnBox.checked);
    localStorage.setItem('simcity.daynight', dnBox.checked ? '1' : '0');
    onToggle();
  });

  return {
    toggle() {
      panel.classList.toggle('hidden');
    },
  };
}
