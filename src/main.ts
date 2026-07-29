import './ui/style.css';
import { registerPack } from './content/registry';
import {
  applyTool,
  applyToolLine,
  canApply,
  mulberry32,
  newCity,
  simTick,
  toolLineCells,
} from './sim/city';
import { roadLine } from './sim/grid';
import { spawnDisaster } from './sim/disasters';
import { idx } from './sim/grid';
import { createSaveStore, type SaveMeta } from './ui/savestore';
import { CityState, Density, Zone } from './sim/types';
import { Renderer, ViewState } from './render/renderer';
import { zoomAbout } from './render/camera';
import { pinchFrame, pinchPan, pinchZoomFactor, type PinchFrame } from './ui/gestures';
import { OverlayId } from './render/overlays';
import { ActiveTool, buildToolbar } from './ui/toolbar';
import { buildHud } from './ui/hud';
import { buildQuery } from './ui/query';
import { buildCharts } from './ui/charts';
import { buildMinimap } from './ui/minimap';
import { buildViewControls } from './ui/viewcontrols';
import { buildCityHall } from './ui/cityhall';
import { buildDisplay } from './ui/display';
import { createModStore } from './ui/modstore';
import { buildModsPanel } from './ui/mods';
import { makeDraggable } from './ui/drag';
import {
  haloFor,
  isFormControl,
  LINE_TOOLS,
  OVERLAY_KEYS,
  RECT_TOOLS,
  TOOL_KEYS,
} from './ui/shortcuts';
import { setSkin } from './render/skins';
import { setWeatherFx } from './render/fx';
import { setDayNight } from './render/daynight';
import { buildHelp, createAdvisorFeed } from './ui/help';
import { buildEventLog, type EventKind } from './ui/eventlog';
import { buildFileMenu } from './ui/filemenu';
import { monthLabel } from './ui/format';
import { buildTransitWizard } from './ui/transitwizard';
import { detectEvents, freshSnapshot } from './ui/events';
import { adviseTips } from './sim/tips';
import { ambientLevel, createSoundPlayer, soundFor, UI_SOUNDS } from './ui/sound';
import { createMusicPlayer } from './ui/music';

const SPEED_MS = [0, 250, 83, 28];

const canvas = document.getElementById('city') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui') as HTMLElement;

// Constructing the store migrates the one pre-v0.55 save into a named slot,
// so an upgrading player's city is waiting for them in the list.
const saveStore = createSaveStore(localStorage);

/** Which saved city the player is currently in, so Save overwrites it. */
let currentSave: SaveMeta | null = null;

/** Boot into the most recently saved city if there is one; the File menu
 * opens over it either way, so nothing is loaded behind the player's back. */
let city: CityState = (() => {
  const latest = saveStore.list()[0];
  if (latest) {
    const revived = saveStore.load(latest.slug);
    if (revived) {
      currentSave = latest;
      return revived;
    }
  }
  return newCity(Date.now() % 2 ** 31);
})();

setSkin(localStorage.getItem('simcity.skin') ?? 'classic');
setWeatherFx(localStorage.getItem('simcity.weatherfx') !== '0');
setDayNight(localStorage.getItem('simcity.daynight') === '1');
let rand = mulberry32(city.seed + city.tick);
const renderer = new Renderer(canvas, city.seed);

/**
 * Debug hook for the mod pipeline, matching the localStorage.simcity.nightlock
 * convention. There is no player-facing mod manager yet; this is how the
 * untrusted path gets exercised. Returns errors rather than throwing.
 */
(window as unknown as Record<string, unknown>).__simcity = {
  loadPack(input: string | object) {
    const raw = typeof input === 'string' ? JSON.parse(input) : input;
    const result = registerPack(raw);
    if (result.ok) renderer.reseed(city.seed); // pick up any new content
    return result;
  },
  /** Read-only camera snapshot. The touch and zoom paths have no other visible
   * output — they only move this — so tests and the console watch it here. */
  camera: () => ({ ...renderer.camera }),
};

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

// --- the one running feed ---
// Everything the city has to say lands here: rejected actions, event notices,
// and the advisors. It replaced the centre toast and the bottom-left tip strip,
// which both appeared unbidden over whatever you were building.
const eventLog = buildEventLog(uiRoot);
function toast(msg: string, kind: 'error' | 'info' = 'error') {
  eventLog.push(msg, kind, monthLabel(city.month));
}
function notify(msg: string, kind: EventKind) {
  eventLog.push(msg, kind, monthLabel(city.month));
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
    const r = detectEvents(eventSnap, city);
    eventSnap = r.next;
    for (const ev of r.events) sound.playEvent(ev);
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
let eventSnap = freshSnapshot(city);

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
// Built before any panel that reads the content registry: constructing the
// store registers every enabled mod, so the toolbar's Mods section and City
// Hall's ordinance rows both see authored content on the very first paint.
const modStore = createModStore(localStorage);
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
    // On a narrow screen the tools are a drawer over the map: once one is
    // armed, get out of the way so the player can see where to put it.
    if (tool) document.body.classList.remove('tools-open');
  },
  (overlay: OverlayId | null) => {
    view.overlay = overlay;
  },
  (density: Density) => {
    activeDensity = density;
  },
  () => city,
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
buildViewControls(uiRoot, {
  zoomIn: () => zoomStep(1.25),
  zoomOut: () => zoomStep(1 / 1.25),
  toggleTools: () => document.body.classList.toggle('tools-open'),
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
  {
    isOn: () => music.on,
    toggle: () => music.toggle(),
    get musicVolume() {
      return music.musicVolume;
    },
    setMusicVolume: (v: number) => music.setMusicVolume(v),
  },
  {
    get sfxVolume() {
      return sound.sfxVolume;
    },
    setSfxVolume: (v: number) => sound.setSfxVolume(v),
  },
  () => sound.play(UI_SOUNDS.select),
);
const modsPanel = buildModsPanel(uiRoot, modStore, { toast });
modStore.onChange(() => {
  cityHall.rebuildOrdinances();
  toolbar.rebuildMods();
  renderer.reseed(city.seed); // newly-registered buildings need per-tile variants
});

const fileMenu = buildFileMenu(uiRoot, saveStore, {
  city: () => city,
  adopt(next, meta) {
    currentSave = meta;
    adoptCity(next);
    notify(`Loaded “${meta.name}”`, 'info');
    sound.play(UI_SOUNDS.info);
    advisoryForUnprotectedCity();
  },
  newCity() {
    currentSave = null;
    adoptCity(newCity(Date.now() % 2 ** 31));
    notify('A new city awaits', 'info');
  },
  openMods: () => modsPanel.open(),
  notify(msg, kind) {
    notify(msg, kind);
    sound.play(kind === 'error' ? UI_SOUNDS.error : UI_SOUNDS.info);
  },
});

const PANELS = {
  cityhall: cityHall,
  charts,
  display,
  file: fileMenu,
} as const;

const hud = buildHud(
  uiRoot,
  () => city,
  {
    setSpeed,
    toggle: (panel) => PANELS[panel].toggle(),
    isOpen: (panel) => PANELS[panel].isOpen(),
  },
);
setSpeed(1);

/** Swap in a different city and re-point everything that caches from it. */
function adoptCity(next: CityState) {
  city = next;
  rand = mulberry32(city.seed + city.tick);
  eventSnap = freshSnapshot(city);
  renderer.reseed(city.seed);
  minimap.invalidate();
  hud.syncTaxes(city);
  cityHall.syncBoxes();
  toolbar.refreshGating();
  advisorFeed.update([]); // a different city's complaints are not this one's
}

makeDraggable(toolbar.el, toolbar.grip, 'toolbar');
for (const [sel, key] of [
  ['#hud', 'hud'],
  ['#budget-panel', 'budget'],
  ['#charts-panel', 'charts'],
  ['#cityhall-panel', 'cityhall'],
  ['#display-panel', 'display'],
  ['#mods-panel', 'mods'],
  ['#file-panel', 'file'],
  ['#help-panel', 'help'],
] as const) {
  const panel = document.querySelector<HTMLElement>(sel);
  if (!panel) continue;
  const handle = panel.querySelector<HTMLElement>('h3') ?? panel;
  makeDraggable(panel, handle, key);
}

const help = buildHelp(uiRoot);
// The advisors speak into the log, once per complaint — and again if a
// complaint clears and later comes back.
const advisorFeed = createAdvisorFeed((tip) => notify(tip.text, 'advisor'));
advisorFeed.update(adviseTips(city));
window.setInterval(() => {
  advisorFeed.update(adviseTips(city));
  toolbar.refreshGating(); // the city may have grown into a wider road or a cleaner plant
  sound.setAmbient(ambientLevel(city.population));
  music.update(city);
}, 2000);

// The front door: choose which city to carry on with, or start a fresh one,
// rather than having the game quietly decide for you.
fileMenu.setCurrent(currentSave);
fileMenu.open();

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

/** Show what a tool would reach — coverage, the ground it claims, and where
 * it spoils the area. */
function syncHalo() {
  const usable = activeTool && activeTool !== 'query' ? activeTool : null;
  const spec = usable ? haloFor(usable) : null;
  view.halo =
    spec && view.hover
      ? { x: view.hover.x, y: view.hover.y, radius: spec.radius, blight: spec.blight, size: spec.size }
      : null;
}

let painting = false;
let lastPainted = -1;
let rectAnchor: { x: number; y: number } | null = null;
let lineAnchor: { x: number; y: number } | null = null;
/** The aimed centre-line, before a wide road class widens it into a corridor.
 * `view.line` holds the widened preview; this is what actually gets built. */
let lineSpine: [number, number][] | null = null;
let panning = false;
let spaceHeld = false;
let panStart = { x: 0, y: 0, camX: 0, camY: 0 };

/** Live touch points by pointerId. A pinch needs both fingers tracked at once,
 * which a single pointer event cannot tell us. */
const touches = new Map<number, { x: number; y: number }>();
/** The previous frame of an in-progress two-finger gesture, or null. */
let pinch: PinchFrame | null = null;

const touchPoints = () => [...touches.values()];

/** Drop any half-drawn shape. Called when a gesture takes over from a build,
 * and on every pointerup once the shape has had its chance to apply. */
function cancelPendingBuild() {
  rectAnchor = null;
  view.rect = null;
  lineAnchor = null;
  lineSpine = null;
  view.line = null;
  view.lineTool = null;
  painting = false;
  lastPainted = -1;
}

/** Zoom by a fixed step about the middle of the canvas — what the on-screen
 * +/- buttons do, and the only zoom available without a wheel or a pinch. */
function zoomStep(factor: number) {
  const rect = canvas.getBoundingClientRect();
  zoomAbout(renderer.camera, factor, rect.width / 2, rect.height / 2, rect.width, rect.height);
}

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

/** Tiles a pending drag line would cover — widened for the wide road classes. */
function previewCells(tool: NonNullable<ActiveTool>, spine: [number, number][]): [number, number][] {
  return toolLineCells(tool, spine).map((c) => [c.x, c.y] as [number, number]);
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
  if (e.pointerType === 'touch') {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2) {
      // A second finger means the player wants to move the map, not build.
      // Abandon whatever the first finger started — otherwise a pinch would
      // leave a stray road preview behind, or pave on release.
      cancelPendingBuild();
      panning = false;
      const [a, b] = touchPoints();
      pinch = pinchFrame(a, b);
      return;
    }
    if (touches.size > 2) return;
    // One finger with nothing selected pans, so the map is explorable before
    // picking a tool. With a tool up, one finger builds and two fingers move.
    if (!activeTool) {
      panning = true;
      panStart = { x: e.clientX, y: e.clientY, camX: renderer.camera.x, camY: renderer.camera.y };
      return;
    }
  }
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
    lineSpine = [[tile.x, tile.y]];
    view.line = previewCells(activeTool, lineSpine);
    view.lineTool = activeTool;
    return;
  }
  painting = true;
  lastPainted = idx(tile.x, tile.y);
  paintAt(tile.x, tile.y, true);
});

canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && touches.size >= 2) {
      const [a, b] = touchPoints();
      const next = pinchFrame(a, b);
      const rect = canvas.getBoundingClientRect();
      // Drag by however far the midpoint moved, then scale about where it
      // ended up — so the map stays pinned under both fingers.
      const pan = pinchPan(pinch, next);
      renderer.camera.x -= pan.x / renderer.camera.zoom;
      renderer.camera.y -= pan.y / renderer.camera.zoom;
      zoomAbout(
        renderer.camera,
        pinchZoomFactor(pinch, next),
        next.center.x - rect.left,
        next.center.y - rect.top,
        rect.width,
        rect.height,
      );
      pinch = next;
      return;
    }
  }
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
  if (lineAnchor && tile && view.lineTool) {
    lineSpine = roadLine(lineAnchor.x, lineAnchor.y, tile.x, tile.y);
    view.line = previewCells(view.lineTool, lineSpine);
  }
  if (painting && tile && idx(tile.x, tile.y) !== lastPainted) {
    lastPainted = idx(tile.x, tile.y);
    paintAt(tile.x, tile.y, false);
  }
});

function endPointer(e: PointerEvent) {
  if (e.pointerType === 'touch') {
    touches.delete(e.pointerId);
    // Lifting one finger of a pinch ends the gesture rather than handing the
    // map to the finger still down, which would make it jump.
    if (touches.size < 2) pinch = null;
  }
  // releasing over UI chrome cancels the pending shape (Esc also works)
  if (rectAnchor && view.rect && e.target === canvas) applyRect(view.rect);
  if (lineAnchor && lineSpine && view.lineTool && e.target === canvas) {
    const { applied, brokeFunds } = applyToolLine(city, view.lineTool, lineSpine, activeDensity);
    if (applied > 0) sound.play(soundFor(view.lineTool));
    if (brokeFunds) {
      toast('Ran out of funds before finishing');
      sound.play(UI_SOUNDS.error);
    }
  }
  cancelPendingBuild();
  panning = false;
}

window.addEventListener('pointerup', endPointer);
// iOS raises pointercancel when the system claims the touch (a call, the
// app switcher, an edge swipe). Without this the finger stays in the map.
window.addEventListener('pointercancel', endPointer);

canvas.addEventListener('dblclick', () => {
  if (wizard.isOpen()) wizard.dblClick();
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
  zoomAbout(
    renderer.camera,
    factor,
    e.clientX - rect.left,
    e.clientY - rect.top,
    rect.width,
    rect.height,
  );
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
      lineSpine = null;
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
    // every notice reaches the log now, rather than the last one plus a count
    for (const n of city.notices) notify(n, 'alert');
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
