import { Density, DENSITY_COST_MULT, ToolId } from '../sim/types';
import { toolCost, ZONE_TOOLS } from '../sim/city';
import { OVERLAY_LABELS, OverlayId } from '../render/overlays';

export type ActiveTool = ToolId | 'query' | null;

const TOOLS: { id: ToolId | 'query'; label: string }[] = [
  { id: 'query', label: 'Query' },
  { id: 'bulldoze', label: 'Bulldoze' },
  { id: 'road', label: 'Road' },
  { id: 'zoneR', label: 'Residential' },
  { id: 'zoneC', label: 'Commercial' },
  { id: 'zoneI', label: 'Industrial' },
  { id: 'plant', label: 'Coal Plant' },
  { id: 'line', label: 'Power Line' },
  { id: 'park', label: 'Park' },
  { id: 'fire', label: 'Fire Station' },
  { id: 'police', label: 'Police Station' },
  { id: 'school', label: 'School' },
  { id: 'hospital', label: 'Hospital' },
  { id: 'terraWater', label: 'Water' },
  { id: 'terraForest', label: 'Forest' },
  { id: 'terraGrass', label: 'Level Land' },
  { id: 'terraRaise', label: 'Raise Land' },
  { id: 'terraLower', label: 'Lower Land' },
];

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

  const toolButtons = new Map<string, HTMLButtonElement>();
  let active: ActiveTool = null;
  let density: Density = 1;

  const costLabel = (id: ToolId | 'query') => (id === 'query' ? '' : `§${toolCost(id, density)}`);

  for (const { id, label } of TOOLS) {
    if (id === 'terraWater') {
      const section = document.createElement('div');
      section.className = 'section';
      section.textContent = 'Terrain · free until founded';
      el.appendChild(section);
    }
    const btn = document.createElement('button');
    btn.innerHTML = `<span>${label}</span><span class="cost">${costLabel(id)}</span>`;
    btn.addEventListener('click', () => {
      active = active === id ? null : id;
      for (const [tid, b] of toolButtons) b.classList.toggle('active', tid === active);
      onTool(active);
    });
    toolButtons.set(id, btn);
    el.appendChild(btn);
  }

  // density selector for zone tools
  const densitySection = document.createElement('div');
  densitySection.className = 'section';
  densitySection.textContent = 'Zone density';
  el.appendChild(densitySection);
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
    el.appendChild(btn);
  });
  densityButtons.get(1)!.classList.add('active');

  const section = document.createElement('div');
  section.className = 'section';
  section.textContent = 'Data views';
  el.appendChild(section);

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
    el.appendChild(btn);
  }

  return {
    /** Programmatically clear the active tool (e.g. on Esc). */
    clearTool() {
      active = null;
      for (const b of toolButtons.values()) b.classList.remove('active');
      onTool(null);
    },
  };
}
