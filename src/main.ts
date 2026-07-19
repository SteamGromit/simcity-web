import './ui/style.css';
import { applyTool, canApply, mulberry32, newCity, simTick } from './sim/city';
import { idx } from './sim/grid';
import { deserialize, serialize } from './sim/save';
import { CityState, Zone } from './sim/types';
import { Renderer, ViewState } from './render/renderer';
import { OverlayId } from './render/overlays';
import { ActiveTool, buildToolbar } from './ui/toolbar';
import { buildHud } from './ui/hud';
import { buildQuery } from './ui/query';

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

let rand = mulberry32(city.seed + city.tick);
const renderer = new Renderer(canvas, city.seed);

const view: ViewState = { hover: null, hoverValid: true, overlay: null };
let activeTool: ActiveTool = null;

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
    hud.showActiveSpeed(0);
    toast(`Simulation paused: ${err instanceof Error ? err.message : err}`);
  }
}

// --- UI ---
const query = buildQuery(uiRoot);
const toolbar = buildToolbar(
  uiRoot,
  (tool) => {
    activeTool = tool;
    if (tool !== 'query') query.hide();
  },
  (overlay: OverlayId | null) => {
    view.overlay = overlay;
  },
);
const hud = buildHud(
  uiRoot,
  () => city,
  {
    setSpeed,
    save() {
      localStorage.setItem(SAVE_KEY, serialize(city));
      toast('City saved', 'info');
    },
    load() {
      const saved = localStorage.getItem(SAVE_KEY);
      const revived = saved ? deserialize(saved) : null;
      if (!revived) {
        toast('No valid save found');
        return;
      }
      city = revived;
      rand = mulberry32(city.seed + city.tick);
      renderer.reseed(city.seed);
      hud.syncTaxes(city);
      toast('City loaded', 'info');
      advisoryForUnprotectedCity();
    },
    newCity() {
      if (!window.confirm('Start a new city? Unsaved progress is lost.')) return;
      city = newCity(Date.now() % 2 ** 31);
      rand = mulberry32(city.seed);
      renderer.reseed(city.seed);
      hud.syncTaxes(city);
    },
  },
);
setSpeed(1);

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
  return canApply(city, tool, x, y);
}

let painting = false;
let lastPainted = -1;
let panning = false;
let spaceHeld = false;
let panStart = { x: 0, y: 0, camX: 0, camY: 0 };

function paintAt(x: number, y: number, firstClick: boolean) {
  if (!activeTool || activeTool === 'query') return;
  const res = applyTool(city, activeTool, x, y);
  if (!res.ok && firstClick && res.err !== 'tile occupied' && res.err !== 'nothing to bulldoze') {
    toast(res.err!);
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
  if (activeTool === 'query') {
    query.show(city, tile.x, tile.y, e.clientX, e.clientY);
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
  if (painting && tile && idx(tile.x, tile.y) !== lastPainted) {
    lastPainted = idx(tile.x, tile.y);
    paintAt(tile.x, tile.y, false);
  }
});

window.addEventListener('pointerup', () => {
  painting = false;
  panning = false;
  lastPainted = -1;
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const wx = renderer.camera.x + mx / renderer.camera.zoom;
  const wy = renderer.camera.y + my / renderer.camera.zoom;
  const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
  renderer.camera.zoom = Math.max(0.5, Math.min(2, renderer.camera.zoom * factor));
  renderer.camera.x = wx - mx / renderer.camera.zoom;
  renderer.camera.y = wy - my / renderer.camera.zoom;
});

window.addEventListener('keydown', (e) => {
  const pan = 60 / renderer.camera.zoom;
  switch (e.key) {
    case ' ':
      spaceHeld = true;
      e.preventDefault();
      break;
    case 'Escape':
      toolbar.clearTool();
      query.hide();
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
window.addEventListener('keyup', (e) => {
  if (e.key === ' ') spaceHeld = false;
});

window.addEventListener('resize', () => renderer.resize());

// Debug handle for automated playtests (harmless in normal play).
(window as unknown as Record<string, unknown>).__sim = {
  city: () => city,
  applyTool: (tool: Parameters<typeof applyTool>[1], x: number, y: number) =>
    applyTool(city, tool, x, y),
  tick: (n: number) => {
    for (let i = 0; i < n; i++) simTick(city, rand);
  },
};

// --- render loop ---
function frame() {
  if (city.notices.length > 0) {
    const n = city.notices.length;
    const last = city.notices[n - 1];
    toast(n === 1 ? last : `${last} (+${n - 1} more)`);
    city.notices.length = 0;
  }
  renderer.draw(city, view);
  hud.update(city);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
