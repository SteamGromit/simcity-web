import { Density, DENSITY_COST_MULT, ToolId } from '../sim/types';
import { toolCost, ZONE_TOOLS } from '../sim/city';
import { OVERLAY_LABELS, OverlayId } from '../render/overlays';
import { clampDensity, KEY_OF, OVERLAY_KEY_OF } from './shortcuts';
import { makeDraggable } from './drag';

export type ActiveTool = ToolId | 'query' | null;

const BUILD_TOOLS: { id: ToolId | 'query'; label: string; title?: string }[] = [
  { id: 'query', label: 'Query' },
  { id: 'bulldoze', label: 'Bulldoze' },
  { id: 'road', label: 'Road' },
  { id: 'plant', label: 'Coal Plant' },
  { id: 'wind', label: 'Wind Turbine', title: 'Unlocks at population 2,000' },
  { id: 'solar', label: 'Solar Farm', title: 'Unlocks at population 5,000' },
  { id: 'hydro', label: 'Hydro Plant', title: 'Unlocks at population 10,000 · needs adjacent water' },
  { id: 'nuclear', label: 'Nuclear Plant', title: 'Unlocks at population 25,000' },
  { id: 'line', label: 'Power Line' },
  { id: 'park', label: 'Park' },
];

const ZONING_TOOLS: { id: ToolId; label: string }[] = [
  { id: 'zoneR', label: 'Residential' },
  { id: 'zoneC', label: 'Commercial' },
  { id: 'zoneI', label: 'Industrial' },
];

const CIVIC_TOOLS: { id: ToolId; label: string; title?: string }[] = [
  { id: 'fire', label: 'Fire Station' },
  { id: 'police', label: 'Police Station' },
  { id: 'school', label: 'School' },
  { id: 'hospital', label: 'Hospital' },
  { id: 'bus', label: 'Bus Line', title: 'Draw a route, then place stops' },
  { id: 'streetcar', label: 'Streetcar Line', title: 'Unlocks at population 5,000' },
  { id: 'monorail', label: 'Monorail Line', title: 'Unlocks at population 15,000' },
  { id: 'subway', label: 'Subway Line', title: 'Unlocks at population 30,000' },
  { id: 'rail', label: 'Rail Line', title: 'Unlocks at population 50,000' },
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
    id !== null && id !== 'query' && (ZONE_TOOLS as readonly ToolId[]).includes(id);

  const costLabel = (id: ToolId | 'query') =>
    id === 'query' ? '' : `§${toolCost(id, isZone(id) ? densityOf(id) : 1)}`;

  // --- density flyout: one shared element, repositioned per zoning button ---
  const flyout = document.createElement('div');
  flyout.id = 'density-flyout';
  flyout.className = 'panel hidden';
  el.appendChild(flyout);
  let flyoutFor: ToolId | null = null;

  function closeFlyout() {
    flyout.classList.add('hidden');
    flyoutFor = null;
  }

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
      });
      flyout.appendChild(btn);
    });
    // to the right of the button, inside whichever panel hosts the section
    const host = (anchor.closest('.tool-panel') as HTMLElement) ?? el;
    host.appendChild(flyout);
    flyout.style.left = `${anchor.offsetLeft + anchor.offsetWidth + 6}px`;
    flyout.style.top = `${anchor.offsetTop}px`;
    flyout.classList.remove('hidden');
  }

  // clicking anywhere outside the flyout (or its zoning button) closes it
  document.addEventListener('pointerdown', (e) => {
    const t = e.target as HTMLElement;
    if (flyoutFor && !flyout.contains(t) && !t.closest('.zoning-btn')) closeFlyout();
  });

  function applyTool(tool: ActiveTool) {
    active = tool;
    if (flyoutFor && flyoutFor !== active) closeFlyout();
    for (const [tid, b] of toolButtons) b.classList.toggle('active', tid === active);
    if (isZone(tool)) onDensity(densityOf(tool));
    onTool(active);
  }

  function toolButton(id: ToolId | 'query', label: string, parent: HTMLElement) {
    const btn = document.createElement('button');
    const key = KEY_OF[id] ? `<span class="key">${KEY_OF[id]}</span>` : '';
    btn.innerHTML = `<span>${label}</span><span class="meta">${key}<span class="cost">${costLabel(id)}</span></span>`;
    btn.addEventListener('click', () => applyTool(active === id ? null : id));
    toolButtons.set(id, btn);
    parent.appendChild(btn);
    return btn;
  }

  /** Zoning buttons open the density flyout beside them when activated. */
  function zoneButton(id: ToolId, label: string, parent: HTMLElement) {
    const btn = toolButton(id, label, parent);
    btn.classList.add('zoning-btn');
    // toolButton's own click handler already toggled the tool; this one
    // only manages the flyout, so registration order matters: it runs after.
    btn.addEventListener('click', () => {
      if (active === id) openFlyout(id, btn);
      else closeFlyout();
    });
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
  for (const { id, label, title } of BUILD_TOOLS) {
    const btn = toolButton(id, label, buildBody);
    if (title) btn.title = title;
  }

  const zoningBody = section('zoning', 'Zoning');
  for (const { id, label } of ZONING_TOOLS) zoneButton(id, label, zoningBody);

  const civicBody = section('civic', 'Civic & utilities');
  for (const { id, label, title } of CIVIC_TOOLS) {
    const btn = toolButton(id, label, civicBody);
    if (title) btn.title = title;
  }

  const terraBody = section('terrain', 'Terrain · free until founded');
  for (const { id, label } of TERRA_TOOLS) toolButton(id, label, terraBody);

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
    selectTool(tool: ToolId | 'query') {
      applyTool(active === tool ? null : tool);
    },
    /** Toggle a data view; keyboard and buttons share this path. */
    toggleOverlay,
    /** Drag handle and panel element, for movable-panel wiring. */
    grip,
    el,
    /** Sections and root, consumed by the detach wiring. */
    sections,
    root,
  };
}
