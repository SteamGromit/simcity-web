import { BuildTool, CityState, Density, DENSITY_COST_MULT, ToolId } from '../sim/types';
import { toolCost, ZONE_TOOLS } from '../sim/city';
import { allBuildings, buildingByTool } from '../content/registry';
import type { BuildingDef } from '../content/types';
import { unlockedFor } from '../sim/content';
import { ROAD_CLASSES, roadClassOfTool } from '../sim/roads';
import { OVERLAY_LABELS, OverlayId } from '../render/overlays';
import { clampDensity, KEY_OF, OVERLAY_KEY_OF } from './shortcuts';
import { makeDraggable } from './drag';
import { flyoutPosition, shouldCloseDrawer } from './flyout';

export type ActiveTool = BuildTool | 'query' | null;

/** Tooltip for an authored building: what it costs and what it does. */
function describeAuthored(b: BuildingDef): string {
  const bits = [`§${b.cost}`];
  if (b.upkeep > 0) bits.push(`§${b.upkeep}/mo`);
  if (b.power) bits.push(`power +${b.power.capacity}`);
  if (b.service) bits.push(`${b.service.kind} coverage r${b.service.radius}`);
  if (b.transit) bits.push(`transit r${b.transit.radius}`);
  if (b.siting?.needsWater) bits.push('needs adjacent water');
  return bits.join(' · ');
}

/** Build-section entries; a string is a bundle id placed at that position. */
type BuildEntry = { id: ToolId | 'query'; label: string; title?: string } | { bundle: string };

const BUILD_TOOLS: BuildEntry[] = [
  { id: 'query', label: 'Query' },
  { id: 'bulldoze', label: 'Bulldoze' },
  { id: 'repair', label: 'Repair', title: 'Reset an old building\u2019s age; guards against collapse' },
  { bundle: 'roads' },
  { bundle: 'energy' },
  { id: 'line', label: 'Power Line' },
  { id: 'park', label: 'Park' },
];

interface Bundle {
  id: string;
  label: string;
  members: { id: ToolId; label: string; title?: string }[];
}

/**
 * Growth-gated tool families collapse behind one button; locked members stay
 * hidden until the city earns them. Unlock gating reads each member's
 * building definition from the content registry (src/content/packs/core.ts)
 * and evaluates it against the live CityState via unlockedFor, so the
 * thresholds live in one place instead of being duplicated here.
 */
const BUNDLES: Bundle[] = [
  {
    id: 'roads',
    label: 'Road',
    members: ROAD_CLASSES.map((r) => ({
      id: r.tool as ToolId,
      label: r.label,
      title: `${r.width} square${r.width === 1 ? '' : 's'} wide · ${r.blurb}`,
    })),
  },
  {
    id: 'energy',
    label: 'Power Plant',
    members: [
      { id: 'plant', label: 'Coal Plant' },
      { id: 'wind', label: 'Wind Turbine' },
      { id: 'solar', label: 'Solar Farm' },
      { id: 'hydro', label: 'Hydro Plant', title: 'Needs adjacent water' },
      { id: 'nuclear', label: 'Nuclear Plant' },
      {
        id: 'fusion',
        label: 'Cold Fusion',
        title: '4×4 · enormous, clean output — needs a Research University',
      },
    ],
  },
  {
    id: 'police',
    label: 'Police Station',
    members: [
      { id: 'police', label: 'Police Station' },
      { id: 'prison', label: 'Prison', title: 'Wide reach, but a grim neighbour' },
    ],
  },
  {
    id: 'waste',
    label: 'Waste',
    members: [
      { id: 'landfill', label: 'Landfill', title: 'Cheap and filthy' },
      { id: 'incinerator', label: 'Incinerator' },
      { id: 'recycling', label: 'Recycling Centre', title: 'Diverts a quarter of the stream' },
    ],
  },
  {
    id: 'transit',
    label: 'Transit Line',
    members: [
      { id: 'bus', label: 'Bus Line', title: 'Draw a route, then place stops' },
      { id: 'streetcar', label: 'Streetcar Line' },
      { id: 'monorail', label: 'Monorail Line' },
      { id: 'subway', label: 'Subway Line' },
      { id: 'rail', label: 'Rail Line' },
    ],
  },
];

/** Bundles are referenced by id: positional indices reshuffle silently when
 * a new family is added, and quietly hand a button the wrong flyout. */
function bundleById(id: string): Bundle {
  const found = BUNDLES.find((b) => b.id === id);
  if (!found) throw new Error(`no toolbar bundle "${id}"`);
  return found;
}

const ZONING_TOOLS: { id: ToolId; label: string }[] = [
  { id: 'zoneR', label: 'Residential' },
  { id: 'zoneC', label: 'Commercial' },
  { id: 'zoneI', label: 'Industrial' },
];

const CIVIC_TOOLS: { id: ToolId; label: string; title?: string }[] = [
  { id: 'fire', label: 'Fire Station' },
  { id: 'school', label: 'School' },
  { id: 'hospital', label: 'Hospital' },
  { id: 'pump', label: 'Water Pump' },
  { id: 'pipe', label: 'Water Pipe' },
];

const TERRA_TOOLS: { id: ToolId; label: string }[] = [
  { id: 'terraWater', label: 'Water' },
  { id: 'terraForest', label: 'Forest' },
  { id: 'terraGrass', label: 'Level Land' },
  { id: 'terraRaise', label: 'Raise Land' },
  { id: 'terraLower', label: 'Lower Land' },
];

const COLLAPSE_KEY = 'simcity.toolbar.';
const DENSITY_KEY = 'simcity.density.';
const DENSITY_LABELS = ['', 'Low', 'Medium', 'High'] as const;

/** A toolbar section; Task 4's detach logic extends this record. */
export interface ToolbarSection {
  wrap: HTMLElement;
  body: HTMLElement;
  header: HTMLElement;
  slug: string;
  title: string;
  /** Hidden order-keeper left in the toolbar while detached. */
  anchor?: HTMLElement;
  float?: HTMLElement;
}

export function buildToolbar(
  root: HTMLElement,
  onTool: (tool: ActiveTool) => void,
  onOverlay: (overlay: OverlayId | null) => void,
  onDensity: (density: Density) => void,
  getCity: () => CityState,
) {
  const el = document.createElement('div');
  el.id = 'toolbar';
  el.className = 'panel tool-panel';
  root.appendChild(el);

  const grip = document.createElement('div');
  grip.className = 'drag-grip';
  grip.textContent = '⠿ Tools';
  el.appendChild(grip);

  const toolButtons = new Map<string, HTMLButtonElement>();
  let active: ActiveTool = null;

  /** Last-used density per zone type, revived from storage. */
  const densities = new Map<ToolId, Density>();
  for (const id of ZONE_TOOLS) {
    densities.set(id, clampDensity(localStorage.getItem(DENSITY_KEY + id)));
  }
  const densityOf = (id: ToolId): Density => densities.get(id) ?? 1;
  const isZone = (id: ActiveTool): id is ToolId =>
    id !== null && id !== 'query' && (ZONE_TOOLS as readonly string[]).includes(id);

  const costLabel = (id: BuildTool | 'query') =>
    id === 'query' ? '' : `§${toolCost(id, isZone(id) ? densityOf(id) : 1)}`;

  // --- flyouts: one shared element, repositioned per anchor button ---
  //
  // It lives on <body>, not inside the toolbar. On the compact layout the
  // toolbar is a drawer slid off-screen with a transform, and a transform
  // makes its containing block — so a flyout parented anywhere inside it
  // rides the drawer out of view even when positioned `fixed`. That is what
  // made density and power-plant type unpickable on a phone.
  const flyout = document.createElement('div');
  flyout.id = 'density-flyout';
  flyout.className = 'panel hidden';
  document.body.appendChild(flyout);
  let flyoutFor: string | null = null;

  function closeFlyout() {
    flyout.classList.add('hidden');
    flyoutFor = null;
  }

  /**
   * Put the flyout beside its button in viewport coordinates, flipping to the
   * other side and pulling back from the edges rather than hanging off them —
   * the toolbar can be dragged anywhere, and on a narrow screen there may be
   * no room to the right at all.
   */
  function placeFlyout(anchor: HTMLElement) {
    const a = anchor.getBoundingClientRect();
    // a button inside a folded section has no box to hang anything off
    if (a.width === 0 && a.height === 0) {
      closeFlyout();
      return;
    }
    flyout.classList.remove('hidden');
    const f = flyout.getBoundingClientRect();
    const at = flyoutPosition(
      { left: a.left, top: a.top, width: a.width, height: a.height },
      { width: f.width, height: f.height },
      { width: window.innerWidth, height: window.innerHeight },
    );
    flyout.style.left = `${at.left}px`;
    flyout.style.top = `${at.top}px`;
  }

  /**
   * The compact layout slides the tools away once one is armed, so the map is
   * visible to build on. A click that opens a *flyout* has not finished
   * choosing yet, though — closing then would take the choices with it.
   */
  function settleDrawer() {
    if (shouldCloseDrawer(active, flyoutFor !== null)) {
      document.body.classList.remove('tools-open');
    }
  }

  // a flyout pinned to viewport coordinates is stale the moment the layout moves
  window.addEventListener('resize', () => closeFlyout());

  function syncZoneCosts() {
    for (const id of ZONE_TOOLS) {
      const zb = toolButtons.get(id);
      if (zb) (zb.querySelector('.cost') as HTMLElement).textContent = costLabel(id);
    }
  }

  function openFlyout(id: ToolId, anchor: HTMLButtonElement) {
    flyout.innerHTML = '';
    flyoutFor = id;
    ([1, 2, 3] as const).forEach((d) => {
      const btn = document.createElement('button');
      btn.innerHTML = `<span>${DENSITY_LABELS[d]}</span><span class="cost">×${DENSITY_COST_MULT[d]} §${toolCost(id, d)}</span>`;
      btn.classList.toggle('active', densityOf(id) === d);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        densities.set(id, d);
        localStorage.setItem(DENSITY_KEY + id, String(d));
        syncZoneCosts();
        if (active === id) onDensity(d);
        closeFlyout();
        settleDrawer();
      });
      flyout.appendChild(btn);
    });
    placeFlyout(anchor);
  }

  // clicking anywhere outside the flyout (or its zoning button) closes it
  document.addEventListener('pointerdown', (e) => {
    const t = e.target as HTMLElement;
    if (flyoutFor && !flyout.contains(t) && !t.closest('.zoning-btn') && !t.closest('.bundle-btn')) {
      closeFlyout();
    }
  });

  const bundleButtons: { id: string; btn: HTMLButtonElement; members: Set<BuildTool | 'query'> }[] =
    [];

  function syncActive() {
    for (const [tid, b] of toolButtons) b.classList.toggle('active', tid === active);
    for (const bb of bundleButtons) {
      bb.btn.classList.toggle('active', active !== null && bb.members.has(active));
    }
  }

  function applyTool(tool: ActiveTool) {
    active = tool;
    if (flyoutFor && flyoutFor !== active) closeFlyout();
    syncActive();
    if (isZone(tool)) onDensity(densityOf(tool));
    onTool(active);
  }

  function toolButton(
    id: BuildTool | 'query',
    label: string,
    parent: HTMLElement,
    /** Runs after the tool is armed and before the drawer decides to close,
     * so a button that also opens a flyout gets to open it first. */
    afterClick?: (btn: HTMLButtonElement) => void,
  ) {
    const btn = document.createElement('button');
    const shortcut = KEY_OF[id as ToolId];
    const key = shortcut ? `<span class="key">${shortcut}</span>` : '';
    btn.dataset.tool = id; // drives the locate-code spine in the stylesheet
    btn.innerHTML = `<span>${label}</span><span class="meta">${key}<span class="cost">${costLabel(id)}</span></span>`;
    btn.addEventListener('click', () => {
      applyTool(active === id ? null : id);
      afterClick?.(btn);
      settleDrawer();
    });
    toolButtons.set(id, btn);
    parent.appendChild(btn);
    return btn;
  }

  /**
   * Whether a bundle member is available yet, and how the UI should phrase the
   * wait if it isn't. Buildings answer from the content registry; the road
   * ladder answers from its own table, which is where its widths live too.
   */
  function memberUnlock(id: ToolId): { unlocked: boolean; label?: string } {
    const cls = roadClassOfTool(id);
    if (cls !== null) {
      const def = ROAD_CLASSES[cls];
      return { unlocked: getCity().population >= def.unlockPop, label: def.unlockLabel };
    }
    const def = buildingByTool(id);
    if (!def) return { unlocked: true };
    return { unlocked: unlockedFor(def, getCity()), label: def.unlock?.label };
  }

  /** Every bundle keeps a slot in the toolbar; what fills it depends on gating. */
  const bundleSlots: { bundle: Bundle; host: HTMLElement; signature: string }[] = [];

  function bundleSlot(bundle: Bundle, parent: HTMLElement) {
    const host = document.createElement('div');
    host.className = 'bundle-slot';
    parent.appendChild(host);
    bundleSlots.push({ bundle, host, signature: '' });
    renderBundle(bundleSlots[bundleSlots.length - 1]);
  }

  /**
   * Fill a bundle's slot.
   *
   * With only one member unlocked there is nothing to choose between, so the
   * slot renders that member as an ordinary tool button — one click to arm it,
   * not two. The moment a second member unlocks it becomes a bundle button
   * with a flyout. Either way the lowest member keeps its keyboard shortcut,
   * because shortcuts route through applyTool rather than through a button.
   */
  function renderBundle(slot: { bundle: Bundle; host: HTMLElement; signature: string }) {
    const { bundle, host } = slot;
    const open = bundle.members.filter((m) => memberUnlock(m.id).unlocked);
    const signature = open.map((m) => m.id).join(',');
    if (signature === slot.signature && host.childElementCount > 0) return;
    slot.signature = signature;

    if (flyoutFor === bundle.id) closeFlyout(); // its anchor is about to go
    host.innerHTML = '';
    for (const m of bundle.members) toolButtons.delete(m.id);
    const stale = bundleButtons.findIndex((b) => b.id === bundle.id);
    if (stale >= 0) bundleButtons.splice(stale, 1);

    const locked = bundle.members.find((m) => !memberUnlock(m.id).unlocked);
    const nextHint = locked
      ? `Next: ${locked.label} at ${memberUnlock(locked.id).label ?? 'a larger city'}`
      : '';

    if (open.length <= 1) {
      // fall back to the first member if the city somehow has none unlocked,
      // so the slot never renders empty and the shortcut always has a button
      const only = open[0] ?? bundle.members[0];
      const btn = toolButton(only.id, only.label, host);
      btn.title = [only.title, nextHint].filter(Boolean).join(' · ');
      syncActive();
      return;
    }

    const btn = document.createElement('button');
    btn.className = 'bundle-btn';
    btn.dataset.bundle = bundle.id;
    btn.innerHTML = `<span>${bundle.label}</span><span class="meta"><span class="cost">▸</span></span>`;
    btn.addEventListener('click', () => {
      if (flyoutFor === bundle.id) {
        closeFlyout();
        return;
      }
      flyout.innerHTML = '';
      flyoutFor = bundle.id;
      // Recomputed on every open rather than reusing what renderBundle saw:
      // a milestone can be crossed between the heartbeat that last drew this
      // button and the click that opens it, and the flyout must not be stale.
      const members = bundle.members.filter((m) => memberUnlock(m.id).unlocked);
      const stillLocked = bundle.members.find((m) => !memberUnlock(m.id).unlocked);
      for (const m of members) {
        const mb = document.createElement('button');
        mb.dataset.tool = m.id;
        mb.innerHTML = `<span>${m.label}</span><span class="cost">${costLabel(m.id)}</span>`;
        if (m.title) mb.title = m.title;
        mb.classList.toggle('active', active === m.id);
        mb.addEventListener('click', (e) => {
          e.stopPropagation();
          applyTool(active === m.id ? null : m.id);
          closeFlyout();
          settleDrawer();
        });
        flyout.appendChild(mb);
      }
      if (stillLocked) {
        const hint = document.createElement('div');
        hint.className = 'bundle-hint';
        hint.textContent = `${stillLocked.label} at ${memberUnlock(stillLocked.id).label ?? 'a larger city'}`;
        flyout.appendChild(hint);
      }
      placeFlyout(btn);
    });
    bundleButtons.push({ id: bundle.id, btn, members: new Set(bundle.members.map((m) => m.id)) });
    host.appendChild(btn);
    syncActive();
  }

  /** Re-evaluate every bundle's gating; cheap, and a no-op when nothing changed. */
  function refreshGating() {
    for (const slot of bundleSlots) renderBundle(slot);
    rebuildRewards();
    syncZoneCosts();
  }

  /** Zoning buttons open the density flyout beside them when activated. */
  function zoneButton(id: ToolId, label: string, parent: HTMLElement) {
    const btn = toolButton(id, label, parent, (b) => {
      if (active === id) openFlyout(id, b);
      else closeFlyout();
    });
    btn.classList.add('zoning-btn');
  }

  /** Collapsible section: the header toggles its body; state persists. */
  const sections: ToolbarSection[] = [];
  function section(slug: string, title: string): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'tool-section';
    const header = document.createElement('div');
    header.className = 'section collapsible';
    const headText = document.createElement('span');
    header.appendChild(headText);
    const body = document.createElement('div');
    body.className = 'section-body';
    const sync = (collapsed: boolean) => {
      body.classList.toggle('hidden', collapsed);
      headText.textContent = `${collapsed ? '▸' : '▾'} ${title}`;
    };
    header.addEventListener('click', () => {
      const collapsed = !body.classList.contains('hidden');
      localStorage.setItem(COLLAPSE_KEY + slug, collapsed ? '1' : '0');
      sync(collapsed);
    });
    sync(localStorage.getItem(COLLAPSE_KEY + slug) === '1');
    wrap.append(header, body);
    el.appendChild(wrap);
    sections.push({ wrap, body, header, slug, title });
    return body;
  }

  const buildBody = section('build', 'Build');
  for (const entry of BUILD_TOOLS) {
    if ('bundle' in entry) {
      bundleSlot(bundleById(entry.bundle), buildBody);
      continue;
    }
    const btn = toolButton(entry.id, entry.label, buildBody);
    if (entry.title) btn.title = entry.title;
  }

  const zoningBody = section('zoning', 'Zoning');
  for (const { id, label } of ZONING_TOOLS) zoneButton(id, label, zoningBody);

  const civicBody = section('civic', 'Civic & utilities');
  for (const { id, label, title } of CIVIC_TOOLS) {
    const btn = toolButton(id, label, civicBody);
    if (title) btn.title = title;
    if (id === 'fire') bundleSlot(bundleById('police'), civicBody);
    if (id === 'hospital') bundleSlot(bundleById('transit'), civicBody);
    if (id === 'pipe') bundleSlot(bundleById('waste'), civicBody);
  }

  const terraBody = section('terrain', 'Terrain · free until founded');
  for (const { id, label } of TERRA_TOOLS) toolButton(id, label, terraBody);

  // --- authored buildings ---
  // Built from the live registry rather than a fixed list, and rebuilt
  // whenever the mod store changes, so enabling a mod or saving a building
  // shows up here without a reload. Hidden entirely when no mod defines one.
  const modsBody = section('mods', 'Mods');
  const modsSection = sections[sections.length - 1];
  let modToolIds: string[] = [];

  function rebuildMods() {
    for (const id of modToolIds) toolButtons.delete(id);
    modToolIds = [];
    modsBody.innerHTML = '';

    const city = getCity();
    const authored = allBuildings().filter((b) => b.tool && !b.id.startsWith('core:'));

    for (const b of authored) {
      if (b.unlock && !unlockedFor(b, city)) continue; // hidden until earned
      const btn = toolButton(b.tool!, b.name, modsBody);
      btn.title = describeAuthored(b);
      modToolIds.push(b.tool!);
    }

    const nextLocked = authored.find((b) => b.unlock && !unlockedFor(b, city));
    if (nextLocked?.unlock) {
      const hint = document.createElement('div');
      hint.className = 'bundle-hint';
      hint.textContent = `${nextLocked.name} at ${nextLocked.unlock.label}`;
      modsBody.appendChild(hint);
    }

    modsSection.wrap.classList.toggle('hidden', authored.length === 0);
  }

  rebuildMods();

  // --- rewards ---
  // The mayor's office buys these, so they are not in the build palette: the
  // section lists what the city has earned, and what it is next in line for.
  // Rebuilt on the same heartbeat the bundles use, since a milestone can be
  // crossed at any moment.
  const rewardsBody = section('rewards', 'Rewards · earned');
  let rewardToolIds: string[] = [];
  let rewardSignature = '';

  function rebuildRewards() {
    const city = getCity();
    const all = allBuildings().filter((b) => b.reward && b.tool);
    const earned = all.filter((b) => unlockedFor(b, city));
    const signature = earned.map((b) => b.id).join(',');
    if (signature === rewardSignature && rewardsBody.childElementCount > 0) return;
    rewardSignature = signature;

    for (const id of rewardToolIds) toolButtons.delete(id);
    rewardToolIds = [];
    rewardsBody.innerHTML = '';

    for (const b of earned) {
      const btn = toolButton(b.tool!, b.name, rewardsBody);
      btn.dataset.reward = 'true';
      const size = b.size ?? 1;
      const bits = [`${size}×${size}`, `§${b.cost}`, `§${b.upkeep}/mo`];
      if (b.jobs) bits.push(`${b.jobs} jobs`);
      btn.title = bits.join(' · ');
      rewardToolIds.push(b.tool!);
    }

    const next = all.find((b) => !unlockedFor(b, city));
    if (next?.unlock) {
      const hint = document.createElement('div');
      hint.className = 'bundle-hint';
      hint.textContent = `${next.name} at ${next.unlock.label}`;
      rewardsBody.appendChild(hint);
    } else if (earned.length === 0) {
      const hint = document.createElement('div');
      hint.className = 'bundle-hint';
      hint.textContent = 'Nothing earned yet.';
      rewardsBody.appendChild(hint);
    }
    syncActive();
  }

  rebuildRewards();

  const viewsBody = section('views', 'Data views');
  const overlayButtons = new Map<string, HTMLButtonElement>();
  let overlay: OverlayId | null = null;
  function toggleOverlay(id: OverlayId) {
    overlay = overlay === id ? null : id;
    for (const [oid, b] of overlayButtons) b.classList.toggle('active', oid === overlay);
    onOverlay(overlay);
  }
  for (const id of Object.keys(OVERLAY_LABELS) as OverlayId[]) {
    const btn = document.createElement('button');
    const key = OVERLAY_KEY_OF[id] ? `<span class="key">${OVERLAY_KEY_OF[id]}</span>` : '';
    btn.dataset.view = id;
    btn.innerHTML = `<span>${OVERLAY_LABELS[id]}</span><span class="meta">${key}</span>`;
    btn.addEventListener('click', () => toggleOverlay(id));
    overlayButtons.set(id, btn);
    viewsBody.appendChild(btn);
  }

  // --- detachable sections ---
  const DETACH_SUFFIX = '.out';

  function setDetached(sec: ToolbarSection, out: boolean) {
    if (out && sec.float) return; // already floating — don't orphan the panel
    localStorage.setItem(COLLAPSE_KEY + sec.slug + DETACH_SUFFIX, out ? '1' : '0');
    if (out) {
      const float = document.createElement('div');
      float.className = 'panel tool-panel tool-float';
      const fgrip = document.createElement('div');
      fgrip.className = 'drag-grip';
      const ftitle = document.createElement('span');
      ftitle.textContent = `⠿ ${sec.title}`;
      const dock = document.createElement('button');
      dock.className = 'detach';
      dock.textContent = '⇲';
      dock.title = 'Return to toolbar';
      dock.addEventListener('click', () => setDetached(sec, false));
      fgrip.append(ftitle, dock);
      float.append(fgrip, sec.wrap);
      root.appendChild(float);
      makeDraggable(float, fgrip, `sec-${sec.slug}`);
      sec.float = float;
    } else {
      sec.anchor!.after(sec.wrap);
      sec.float?.remove();
      sec.float = undefined;
    }
  }

  for (const sec of sections) {
    const btn = document.createElement('button');
    btn.className = 'detach';
    btn.textContent = '⇱';
    btn.title = 'Pop section out';
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // don't also collapse the section
      setDetached(sec, true);
    });
    sec.header.appendChild(btn);
    sec.anchor = document.createElement('div');
    sec.anchor.className = 'hidden';
    sec.wrap.before(sec.anchor);
    if (localStorage.getItem(COLLAPSE_KEY + sec.slug + DETACH_SUFFIX) === '1') {
      setDetached(sec, true);
    }
  }

  return {
    /** Programmatically clear the active tool (e.g. on Esc). */
    clearTool() {
      applyTool(null);
    },
    /** Toggle a tool as if its button were clicked (keyboard shortcuts). */
    selectTool(tool: BuildTool | 'query') {
      applyTool(active === tool ? null : tool);
      settleDrawer();
    },
    /** Toggle a data view; keyboard and buttons share this path. */
    toggleOverlay,
    /** Re-read the registry's authored buildings (a mod changed). */
    rebuildMods,
    /** Re-check what the city has grown into; call as the population moves. */
    refreshGating,
    /** Drag handle and panel element, for movable-panel wiring. */
    grip,
    el,
    /** Sections and root, consumed by the detach wiring. */
    sections,
    root,
  };
}
