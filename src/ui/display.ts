import { getSkin, setSkin, SKINS } from '../render/skins';
import { getWeatherFx, setWeatherFx } from '../render/fx';
import { getDayNight, setDayNight } from '../render/daynight';
import { RenderStyle, getRenderStyle, setRenderStyle } from '../render/renderstyle';
import { getSeasonFx, setSeasonFx } from '../render/seasonfx';

/** Config panel: presentation and audio preferences — city style,
 * weather visuals, music, lighting, and volume levels. No city state. */
export function buildDisplay(
  root: HTMLElement,
  music: {
    isOn(): boolean;
    toggle(): boolean;
    musicVolume: number;
    setMusicVolume(v: number): void;
  },
  sound: { sfxVolume: number; setSfxVolume(v: number): void },
  onToggle: () => void,
) {
  const panel = document.createElement('div');
  panel.id = 'display-panel';
  panel.className = 'panel hidden';
  panel.innerHTML = `
    <h3>Config</h3>
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
    <h4>Render style</h4>
    <div id="style-list"></div>
    <label class="ordinance" id="seasons-row" title="Vegetation follows the calendar: spring greens, autumn oranges, winter frost. Off keeps summer looks year-round (weather and the sim are unaffected).">
      <input type="checkbox" id="seasons-box"><span>Seasonal colors</span>
    </label>
    <h4>Volume</h4>
    <label class="volume-row" title="Tool clicks, event cues, and the ambient city hum.">
      <span>Effects</span>
      <input type="range" id="sfx-vol" min="0" max="100" step="5">
    </label>
    <label class="volume-row" title="The procedural soundtrack's level.">
      <span>Music</span>
      <input type="range" id="music-vol" min="0" max="100" step="5">
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

  const styleList = panel.querySelector('#style-list') as HTMLElement;
  const STYLES: { id: RenderStyle; label: string; blurb: string }[] = [
    { id: 'pixel', label: 'Pixel', blurb: 'Chunky retro sprite look — also the fastest.' },
    { id: 'smooth', label: 'Smooth', blurb: 'Plain full-resolution drawing.' },
    {
      id: 'realistic',
      label: 'Realistic',
      blurb: 'Soft shadows, grounded walls, deep water, atmospheric haze.',
    },
  ];
  const styleButtons: HTMLButtonElement[] = [];
  const syncStyles = () =>
    STYLES.forEach((st, i) => styleButtons[i].classList.toggle('active', getRenderStyle() === st.id));
  for (const st of STYLES) {
    const b = document.createElement('button');
    b.textContent = st.label;
    b.title = st.blurb;
    b.addEventListener('click', () => {
      setRenderStyle(st.id);
      syncStyles();
      onToggle();
    });
    styleButtons.push(b);
    styleList.appendChild(b);
  }
  syncStyles();

  const seasonsBox = panel.querySelector('#seasons-box') as HTMLInputElement;
  seasonsBox.checked = getSeasonFx();
  seasonsBox.addEventListener('change', () => {
    setSeasonFx(seasonsBox.checked);
    onToggle();
  });

  const sfxVol = panel.querySelector('#sfx-vol') as HTMLInputElement;
  sfxVol.value = String(Math.round(sound.sfxVolume * 100));
  sfxVol.addEventListener('input', () => {
    sound.setSfxVolume(Number(sfxVol.value) / 100);
  });
  const musicVol = panel.querySelector('#music-vol') as HTMLInputElement;
  musicVol.value = String(Math.round(music.musicVolume * 100));
  musicVol.addEventListener('input', () => {
    music.setMusicVolume(Number(musicVol.value) / 100);
  });

  return {
    toggle() {
      panel.classList.toggle('hidden');
    },
  };
}
