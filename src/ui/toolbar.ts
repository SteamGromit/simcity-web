import { Density, DENSITY_COST_MULT, ToolId } from '../sim/types';
import { toolCost, ZONE_TOOLS } from '../sim/city';
import { OVERLAY_LABELS, OverlayId } from '../render/overlays';
import { KEY_OF } from './shortcuts';

export type ActiveTool = ToolId | 'query' | null;

const BUILD_TOOLS: { id: ToolId | 'query'; label: string }[] = [
  { id: 'query', label: 'Query' },
  { id: 'bulldoze', label: 'Bulldoze' },
  { id: 'road', label: 'Road' },
  { id: 'zoneR', label: 'Residential' },
  { id: 'zoneC', label: 'Commercial' },
  { id: 'zoneI', label: 'Industrial' },
  { id: 'plant', label: 'Coal Plant' },
  { id: 'line', label: 'Power Line' },
  { id: 'park', label: 'Park' },
];

const CIVIC_TOOLS: { id: ToolId; label: string }[] = [
  { id: 'fire', label: 'Fire Station' },
  { id: 'police', label: 'Police Station' },
  { id: 'school', label: 'School' },
  { id: 'hospital', label: 'Hospital' },
  { id: 'bus', label: 'Bus Stop' },
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

export function buildToolbar(
  root: HTMLElement,
  onTool: (tool: ActiveTool) => void,
  onOverlay: (overlay: OverlayId | null) => void,
  onDensity: (density: Density) => void,
) {
  const el = document.createElement('div');
  el.id = 'toolbar';
  el.className = 'panel';
  root.appendChild(el);

  const grip = document.createElement('div');
  grip.className = 'drag-grip';
  grip.textContent = '⠿ Tools';
  el.appendChild(grip);

  const toolButtons = new Map<string, HTMLButtonElement>();
  let active: ActiveTool = null;
  let density: Density = 1;

  const costLabel = (id: ToolId | 'query') => (id === 'query' ? '' : `§${toolCost(id, density)}`);

  /** Collapsible section: the header toggles its body; state persists. */
  function section(slug: string, title: string): HTMLElement {
    const header = document.createElement('div');
    header.className = 'section collapsible';
    const body = document.createElement('div');
    body.className = 'section-body';
    const sync = (collapsed: boolean) => {
      body.classList.toggle('hidden', collapsed);
      header.textContent = `${collapsed ? '▸' : '▾'} ${title}`;
    };
    header.addEventListener('click', () => {
      const collapsed = !body.classList.contains('hidden');
      localStorage.setItem(COLLAPSE_KEY + slug, collapsed ? '1' : '0');
      sync(collapsed);
    });
    sync(localStorage.getItem(COLLAPSE_KEY + slug) === '1');
    el.appendChild(header);
    el.appendChild(body);
    return body;
  }

  function applyTool(tool: ActiveTool) {
    active = tool;
    for (const [tid, b] of toolButtons) b.classList.toggle('active', tid === active);
    onTool(active);
  }

  function toolButton(id: ToolId | 'query', label: string, parent: HTMLElement) {
    const btn = document.createElement('button');
    const key = KEY_OF[id] ? `<span class="key">${KEY_OF[id]}</span>` : '';
    btn.innerHTML = `<span>${label}</span><span class="meta">${key}<span class="cost">${costLabel(id)}</span></span>`;
    btn.addEventListener('click', () => applyTool(active === id ? null : id));
    toolButtons.set(id, btn);
    parent.appendChild(btn);
  }

  const buildBody = section('build', 'Build');
  for (const { id, label } of BUILD_TOOLS) toolButton(id, label, buildBody);

  const civicBody = section('civic', 'Civic & utilities');
  for (const { id, label } of CIVIC_TOOLS) toolButton(id, label, civicBody);

  const terraBody = section('terrain', 'Terrain · free until founded');
  for (const { id, label } of TERRA_TOOLS) toolButton(id, label, terraBody);

  const densityBody = section('density', 'Zone density');
  const densityButtons = new Map<Density, HTMLButtonElement>();
  ([1, 2, 3] as const).forEach((d) => {
    const btn = document.createElement('button');
    btn.innerHTML = `<span>${['', 'Low', 'Medium', 'High'][d]}</span><span class="cost">×${DENSITY_COST_MULT[d]}</span>`;
    btn.addEventListener('click', () => {
      density = d;
      for (const [dd, b] of densityButtons) b.classList.toggle('active', dd === d);
      for (const id of ZONE_TOOLS) {
        const zb = toolButtons.get(id);
        if (zb) (zb.querySelector('.cost') as HTMLElement).textContent = costLabel(id);
      }
      onDensity(d);
    });
    densityButtons.set(d, btn);
    densityBody.appendChild(btn);
  });
  densityButtons.get(1)!.classList.add('active');

  const viewsBody = section('views', 'Data views');
  const overlayButtons = new Map<string, HTMLButtonElement>();
  let overlay: OverlayId | null = null;
  for (const id of Object.keys(OVERLAY_LABELS) as OverlayId[]) {
    const btn = document.createElement('button');
    btn.innerHTML = `<span>${OVERLAY_LABELS[id]}</span>`;
    btn.addEventListener('click', () => {
      overlay = overlay === id ? null : id;
      for (const [oid, b] of overlayButtons) b.classList.toggle('active', oid === overlay);
      onOverlay(overlay);
    });
    overlayButtons.set(id, btn);
    viewsBody.appendChild(btn);
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
    /** Drag handle and panel element, for movable-panel wiring. */
    grip,
    el,
  };
}
