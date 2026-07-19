import { COSTS, ToolId } from '../sim/types';
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
];

export function buildToolbar(
  root: HTMLElement,
  onTool: (tool: ActiveTool) => void,
  onOverlay: (overlay: OverlayId | null) => void,
) {
  const el = document.createElement('div');
  el.id = 'toolbar';
  el.className = 'panel';
  root.appendChild(el);

  const toolButtons = new Map<string, HTMLButtonElement>();
  let active: ActiveTool = null;

  for (const { id, label } of TOOLS) {
    const btn = document.createElement('button');
    const cost = id === 'query' ? '' : `§${COSTS[id]}`;
    btn.innerHTML = `<span>${label}</span><span class="cost">${cost}</span>`;
    btn.addEventListener('click', () => {
      active = active === id ? null : id;
      for (const [tid, b] of toolButtons) b.classList.toggle('active', tid === active);
      onTool(active);
    });
    toolButtons.set(id, btn);
    el.appendChild(btn);
  }

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
