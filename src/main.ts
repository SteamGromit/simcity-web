import './ui/style.css';
import { applyTool, applyToolLine, canApply, mulberry32, newCity, simTick } from './sim/city';
import { roadLine } from './sim/grid';
import { spawnDisaster } from './sim/disasters';
import { idx } from './sim/grid';
import { deserialize, serialize } from './sim/save';
import { CityState, Density, Zone } from './sim/types';
import { Renderer, ViewState } from './render/renderer';
import { clampZoom } from './render/iso';
import { OverlayId } from './render/overlays';
import { ActiveTool, buildToolbar } from './ui/toolbar';
import { buildHud } from './ui/hud';
import { buildQuery } from './ui/query';
import { buildCharts } from './ui/charts';
import { buildMinimap } from './ui/minimap';
import { buildCityHall } from './ui/cityhall';
import { buildDisplay } from './ui/display';
import { makeDraggable } from './ui/drag';
import {
  HALO_RADII,
  isFormControl,
  LINE_TOOLS,
  OVERLAY_KEYS,
  RECT_TOOLS,
  TOOL_KEYS,
} from './ui/shortcuts';
import { setSkin } from './render/skins';
import { setWeatherFx } from './render/fx';
import { setDayNight } from './render/daynight';
import { buildHelp, buildTipBar } from './ui/help';
import { buildTransitWizard } from './ui/transitwizard';
import { adviseTips } from './sim/tips';
import { ambientLevel, createSoundPlayer, soundFor, UI_SOUNDS } from './ui/sound';
import { createMusicPlayer } from './ui/music';

const SAVE_KEY = 'simcity.save';
const SPEED_MS = [0, 250, 83, 28];

const canvas = document.getElementById('city') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui') as HTMLElement;

let city: CityState = (() => {
  const saved = localStorage.getItem(SAVE_KEY);
  if (saved) {
    const revived = deserialize(saved);
    if (revived) return revived;
  }
  return newCity(Date.now() % 2 ** 31);
})();

setSkin(localStorage.getItem('simcity.skin') ?? 'classic');
setWeatherFx(localStorage.getItem('simcity.weatherfx') !== '0');
setDayNight(localStorage.getItem('simcity.daynight') === '1');
let rand = mulberry32(city.seed + city.tick);
const renderer = new Renderer(canvas, city.seed);

const view: ViewState = {
  hover: null,
  hoverValid: true,
  overlay: null,
  rect: null,
  line: null,
  lineTool: null,
  halo: null,
  transitDraft: null,
};
let activeTool: ActiveTool = null;
let activeDensity: Density = 1;

// --- toast ---
const toastEl = document.createElement('div');
toastEl.id = 'toast';
uiRoot.appendChild(toastEl);
let toastTimer = 0;
function toast(msg: string, kind: 'error' | 'info' = 'error') {
  toastEl.textContent = msg;
  toastEl.classList.toggle('info', kind === 'info');
  toastEl.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(
    () => toastEl.classList.remove('show'),
    kind === 'error' ? 4000 : 2200,
  );
}

// --- sim loop ---
let timer = 0;
function setSpeed(speed: 0 | 1 | 2 | 3) {
  renderer.simSpeed = speed;
  window.clearInterval(timer);
  if (SPEED_MS[speed] > 0) {
    timer = window.setInterval(tickSafely, SPEED_MS[speed]);
  }
}
function tickSafely() {
  try {
    simTick(city, rand);
  } catch (err) {
    window.clearInterval(timer);
    renderer.simSpeed = 0;
    hud.showActiveSpeed(0);
    toast(`Simulation paused: ${err instanceof Error ? err.message : err}`);
  }
}

// --- sound --- (before the UI: Display reads the music pref as it builds)
const sound = createSoundPlayer();
const music = createMusicPlayer(sound);

// --- UI ---
const query = buildQuery(uiRoot);
/** ToolIds that now open the transit wizard instead of placing tiles. */
const TRANSIT_LINE_TOOLS: Partial<Record<string, Zone>> = {
  bus: Zone.BusStop,
  streetcar: Zone.StreetcarStop,
  monorail: Zone.MonorailStation,
  subway: Zone.SubwayStation,
  rail: Zone.RailTerminal,
};
const toolbar = buildToolbar(
  uiRoot,
  (tool) => {
    const lineMode = tool ? TRANSIT_LINE_TOOLS[tool] : undefined;
    if (lineMode !== undefined) {
      toolbar.clearTool();
      activeTool = null;
      wizard.open(lineMode);
      return;
    }
    activeTool = tool;
    syncHalo();
    if (tool !== 'query') query.hide();
    if (tool) sound.play(UI_SOUNDS.select);
  },
  (overlay: OverlayId | null) => {
    view.overlay = overlay;
  },
  (density: Density) => {
    activeDensity = density;
  },
);
const wizard = buildTransitWizard(
  uiRoot,
  () => city,
  (draft) => {
    view.transitDraft = draft;
  },
  () => {
    toast('Transit line opened', 'info');
    sound.play(UI_SOUNDS.info);
  },
  (msg) => {
    toast(msg);
    sound.play(UI_SOUNDS.error);
  },
);
const charts = buildCharts(uiRoot, () => city);
const minimap = buildMinimap(uiRoot, (wx, wy) => {
  renderer.camera.x = wx - canvas.clientWidth / 2 / renderer.camera.zoom;
  renderer.camera.y = wy - canvas.clientHeight / 2 / renderer.camera.zoom;
});
const cityHall = buildCityHall(
  uiRoot,
  () => city,
  () => sound.play(UI_SOUNDS.select),
  (kind) => {
    spawnDisaster(city, kind, rand);
    sound.play(UI_SOUNDS.alarm);
  },
);
const display = buildDisplay(
  uiRoot,
  { isOn: () => music.on, toggle: () => music.toggle() },
  () => sound.play(UI_SOUNDS.select),
);
const hud = buildHud(
  uiRoot,
  () => city,
  {
    setSpeed,
    toggleCharts: () => charts.toggle(),
    toggleCityHall: () => cityHall.toggle(),
    toggleDisplay: () => display.toggle(),
    save() {
      localStorage.setItem(SAVE_KEY, serialize(city));
      toast('City saved', 'info');
      sound.play(UI_SOUNDS.info);
    },
    load() {
      const saved = localStorage.getItem(SAVE_KEY);
      const revived = saved ? deserialize(saved) : null;
      if (!revived) {
        toast('No valid save found');
        sound.play(UI_SOUNDS.error);
        return;
      }
      city = revived;
      rand = mulberry32(city.seed + city.tick);
      renderer.reseed(city.seed);
      minimap.invalidate();
      hud.syncTaxes(city);
      cityHall.syncBoxes();
      toast('City loaded', 'info');
      sound.play(UI_SOUNDS.info);
      advisoryForUnprotectedCity();
    },
    newCity() {
      if (!window.confirm('Start a new city? Unsaved progress is lost.')) return;
      city = newCity(Date.now() % 2 ** 31);
      rand = mulberry32(city.seed);
      renderer.reseed(city.seed);
      minimap.invalidate();
      hud.syncTaxes(city);
    },
  },
);
setSpeed(1);

makeDraggable(toolbar.el, toolbar.grip, 'toolbar');
for (const [sel, key] of [
  ['#hud', 'hud'],
  ['#budget-panel', 'budget'],
  ['#charts-panel', 'charts'],
  ['#cityhall-panel', 'cityhall'],
  ['#display-panel', 'display'],
  ['#help-panel', 'help'],
] as const) {
  const panel = document.querySelector<HTMLElement>(sel);
  if (!panel) continue;
  const handle = panel.querySelector<HTMLElement>('h3') ?? panel;
  makeDraggable(panel, handle, key);
}

const help = buildHelp(uiRoot);
const tipBar = buildTipBar(uiRoot);
tipBar.update(adviseTips(city));
window.setInterval(() => {
  tipBar.update(adviseTips(city));
  sound.setAmbient(ambientLevel(city.population));
  music.update(city);
}, 2000);

const muteBtn = document.createElement('button');
muteBtn.id = 'mute-btn';
function syncMuteBtn() {
  muteBtn.textContent = sound.muted ? '🔇' : '🔊';
  muteBtn.title = sound.muted ? 'Unmute (M)' : 'Mute (M)';
}
muteBtn.addEventListener('click', () => {
  sound.toggleMute();
  music.update(city);
  syncMuteBtn();
});
syncMuteBtn();
uiRoot.appendChild(muteBtn);

/** Saves from before civic services existed have no fire protection — warn once. */
function advisoryForUnprotectedCity() {
  const hasStation = city.tiles.some((t) => t.zone === Zone.FireStation);
  const hasBuildings = city.tiles.some(
    (t) =>
      t.stage > 0 &&
      (t.zone === Zone.Residential || t.zone === Zone.Commercial || t.zone === Zone.Industrial),
  );
  if (hasBuildings && !hasStation) {
    city.notices.push('Advisory: buildings without fire coverage can burn — build fire stations.');
  }
}
advisoryForUnprotectedCity();

// --- input ---
function toolAllowed(tool: ActiveTool, x: number, y: number): boolean {
  if (!tool || tool === 'query') return true;
  return canApply(city, tool, x, y, activeDensity);
}

/** Show the coverage footprint while a service tool hovers the map. */
function syncHalo() {
  const radius = activeTool && activeTool !== 'query' ? HALO_RADII[activeTool] : undefined;
  view.halo = radius && view.hover ? { x: view.hover.x, y: view.hover.y, radius } : null;
}

let painting = false;
let lastPainted = -1;
let rectAnchor: { x: number; y: number } | null = null;
let lineAnchor: { x: number; y: number } | null = null;
let panning = false;
let spaceHeld = false;
let panStart = { x: 0, y: 0, camX: 0, camY: 0 };

function applyRect(rect: { x0: number; y0: number; x1: number; y1: number }) {
  if (!activeTool || activeTool === 'query') return;
  let applied = 0;
  let broke = false;
  for (let y = Math.min(rect.y0, rect.y1); y <= Math.max(rect.y0, rect.y1); y++) {
    for (let x = Math.min(rect.x0, rect.x1); x <= Math.max(rect.x0, rect.x1); x++) {
      const res = applyTool(city, activeTool, x, y, activeDensity);
      if (res.ok) applied++;
      else if (res.err === 'not enough funds') broke = true;
    }
  }
  if (applied > 0) sound.play(soundFor(activeTool));
  if (broke) {
    toast('Ran out of funds before finishing');
    sound.play(UI_SOUNDS.error);
  }
}

function paintAt(x: number, y: number, firstClick: boolean) {
  if (!activeTool || activeTool === 'query') return;
  const res = applyTool(city, activeTool, x, y, activeDensity);
  if (res.ok) {
    sound.play(soundFor(activeTool), 70);
  } else if (firstClick && res.err !== 'tile occupied' && res.err !== 'nothing to bulldoze') {
    toast(res.err!);
    sound.play(UI_SOUNDS.error);
  }
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.button === 1 || (e.button === 0 && spaceHeld)) {
    panning = true;
    panStart = { x: e.clientX, y: e.clientY, camX: renderer.camera.x, camY: renderer.camera.y };
    e.preventDefault();
    return;
  }
  if (e.button !== 0) return;
  const tile = renderer.pick(e.clientX, e.clientY);
  if (!tile) return;
  if (wizard.isOpen()) {
    wizard.clickTile(tile.x, tile.y);
    return;
  }
  if (activeTool === 'query') {
    query.show(city, tile.x, tile.y, e.clientX, e.clientY);
    return;
  }
  if (activeTool && RECT_TOOLS.has(activeTool)) {
    rectAnchor = tile;
    view.rect = { x0: tile.x, y0: tile.y, x1: tile.x, y1: tile.y };
    return;
  }
  if (activeTool && LINE_TOOLS.has(activeTool)) {
    // line tools draw as an adjustable line: drag to aim, release to build
    lineAnchor = tile;
    view.line = [[tile.x, tile.y]];
    view.lineTool = activeTool;
    return;
  }
  painting = true;
  lastPainted = idx(tile.x, tile.y);
  paintAt(tile.x, tile.y, true);
});

canvas.addEventListener('pointermove', (e) => {
  if (panning) {
    renderer.camera.x = panStart.camX - (e.clientX - panStart.x) / renderer.camera.zoom;
    renderer.camera.y = panStart.camY - (e.clientY - panStart.y) / renderer.camera.zoom;
    return;
  }
  const tile = renderer.pick(e.clientX, e.clientY);
  view.hover = tile;
  view.hoverValid = tile ? toolAllowed(activeTool, tile.x, tile.y) : true;
  syncHalo();
  if (wizard.isOpen() && tile) wizard.hoverTile(tile.x, tile.y);
  if (rectAnchor && tile) {
    view.rect = { x0: rectAnchor.x, y0: rectAnchor.y, x1: tile.x, y1: tile.y };
  }
  if (lineAnchor && tile) {
    view.line = roadLine(lineAnchor.x, lineAnchor.y, tile.x, tile.y);
  }
  if (painting && tile && idx(tile.x, tile.y) !== lastPainted) {
    lastPainted = idx(tile.x, tile.y);
    paintAt(tile.x, tile.y, false);
  }
});

window.addEventListener('pointerup', (e) => {
  // releasing over UI chrome cancels the pending shape (Esc also works)
  if (rectAnchor && view.rect && e.target === canvas) applyRect(view.rect);
  if (lineAnchor && view.line && view.lineTool && e.target === canvas) {
    const { applied, brokeFunds } = applyToolLine(city, view.lineTool, view.line, activeDensity);
    if (applied > 0) sound.play(soundFor(view.lineTool));
    if (brokeFunds) {
      toast('Ran out of funds before finishing');
      sound.play(UI_SOUNDS.error);
    }
  }
  rectAnchor = null;
  view.rect = null;
  lineAnchor = null;
  view.line = null;
  view.lineTool = null;
  painting = false;
  panning = false;
  lastPainted = -1;
});

canvas.addEventListener('dblclick', () => {
  if (wizard.isOpen()) wizard.dblClick();
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const wx = renderer.camera.x + mx / renderer.camera.zoom;
  const wy = renderer.camera.y + my / renderer.camera.zoom;
  const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
  renderer.camera.zoom = clampZoom(renderer.camera.zoom * factor, rect.width, rect.height);
  renderer.camera.x = wx - mx / renderer.camera.zoom;
  renderer.camera.y = wy - my / renderer.camera.zoom;
});

const rotateKeys = new Set<string>();

window.addEventListener('keydown', (e) => {
  if (isFormControl(e.target)) return; // a focused slider owns its arrow keys
  const pan = 60 / renderer.camera.zoom;
  switch (e.key) {
    case 'q':
    case 'Q':
      rotateKeys.add('q');
      break;
    case 'e':
    case 'E':
      rotateKeys.add('e');
      break;
    case ' ':
      spaceHeld = true;
      e.preventDefault();
      break;
    case 'Escape':
      if (wizard.isOpen()) wizard.cancel();
      rectAnchor = null;
      view.rect = null;
      lineAnchor = null;
      view.line = null;
      view.lineTool = null;
      toolbar.clearTool();
      query.hide();
      help.hide();
      break;
    case 'h':
    case '?':
      help.toggle();
      break;
    case 'm':
    case 'M':
      sound.toggleMute();
      music.update(city);
      syncMuteBtn();
      break;
    case 'ArrowUp':
      renderer.camera.y -= pan;
      break;
    case 'ArrowDown':
      renderer.camera.y += pan;
      break;
    case 'ArrowLeft':
      renderer.camera.x -= pan;
      break;
    case 'ArrowRight':
      renderer.camera.x += pan;
      break;
  }
});
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (isFormControl(e.target)) return;
  if (e.shiftKey) {
    // Shift is the data-views hold-key; shifted presses never reach tools
    const overlayKey = OVERLAY_KEYS[e.key.toLowerCase()];
    if (overlayKey) toolbar.toggleOverlay(overlayKey);
    return;
  }
  const tool = TOOL_KEYS[e.key.toLowerCase()];
  if (tool) toolbar.selectTool(tool);
});

window.addEventListener('keyup', (e) => {
  if (e.key === ' ') spaceHeld = false;
  if (e.key === 'q' || e.key === 'Q') rotateKeys.delete('q');
  if (e.key === 'e' || e.key === 'E') rotateKeys.delete('e');
});
window.addEventListener('blur', () => {
  // keyups are lost on focus change; don't leave the camera spinning
  rotateKeys.clear();
  spaceHeld = false;
});

window.addEventListener('resize', () => renderer.resize());

// Debug handle for automated playtests (harmless in normal play).
(window as unknown as Record<string, unknown>).__sim = {
  city: () => city,
  applyTool: (tool: Parameters<typeof applyTool>[1], x: number, y: number, density?: Density) =>
    applyTool(city, tool, x, y, density ?? 1),
  tick: (n: number) => {
    for (let i = 0; i < n; i++) simTick(city, rand);
  },
  rotate: (rad: number) => renderer.rotateBy(rad),
};

// --- render loop ---
const ROTATE_SPEED = 1.4; // radians per second while Q/E held
let lastFrameTime = 0;
function frame(now: number) {
  const dt = lastFrameTime === 0 ? 0.016 : Math.min(0.1, (now - lastFrameTime) / 1000);
  lastFrameTime = now;
  if (rotateKeys.has('q')) renderer.rotateBy(-ROTATE_SPEED * dt);
  if (rotateKeys.has('e')) renderer.rotateBy(ROTATE_SPEED * dt);
  if (city.notices.length > 0) {
    const n = city.notices.length;
    const last = city.notices[n - 1];
    toast(n === 1 ? last : `${last} (+${n - 1} more)`);
    sound.play(UI_SOUNDS.alarm);
    city.notices.length = 0;
  }
  renderer.draw(city, view);
  hud.update(city);
  cityHall.update(city, now);
  charts.update(city);
  minimap.update(city, renderer.camera, canvas);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
