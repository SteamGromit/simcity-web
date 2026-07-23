import { transitUnlockLabel, transitUnlocked } from '../sim/transit';
import {
  LINE_COLORS,
  buildLine,
  lineCost,
  rasterizePath,
  validPathTile,
  validStopSite,
} from '../sim/transitlines';
import { CityState, Zone } from '../sim/types';
import { makeDraggable } from './drag';

/** Live preview the renderer draws while the wizard is open. */
export interface TransitDraftView {
  color: string;
  path: [number, number][];
  stops: [number, number][];
  /** Rasterized segment from the last vertex to the hovered tile. */
  pending: [number, number][] | null;
}

export interface TransitWizard {
  open(mode: Zone): void;
  isOpen(): boolean;
  clickTile(x: number, y: number): void;
  dblClick(): void;
  hoverTile(x: number, y: number): void;
  cancel(): void;
}

const MODE_NAMES: Partial<Record<Zone, string>> = {
  [Zone.BusStop]: 'Bus Line',
  [Zone.StreetcarStop]: 'Streetcar Line',
  [Zone.MonorailStation]: 'Monorail Line',
  [Zone.SubwayStation]: 'Subway Line',
  [Zone.RailTerminal]: 'Rail Line',
};

const ROUTE_HELP =
  'Click tiles to draw the route; double-click to finish it. Surface lines cannot cross water.';
const STOPS_HELP =
  'Click tiles on or beside the route to place stops (click again to remove). Empty land or unbuilt zones only. Then press Done.';

/**
 * The transit-line wizard: route phase → stops phase → Done builds the
 * line atomically through sim/transitlines. Canvas input is routed here
 * by main.ts while the panel is open.
 */
export function buildTransitWizard(
  root: HTMLElement,
  getCity: () => CityState,
  onDraft: (draft: TransitDraftView | null) => void,
  onBuilt: (mode: Zone) => void,
  onError: (msg: string) => void,
): TransitWizard {
  const panel = document.createElement('div');
  panel.id = 'transit-wizard';
  panel.className = 'panel hidden';
  panel.innerHTML = `
    <h3 id="tw-title">Transit Line</h3>
    <p id="tw-help"></p>
    <div id="tw-colors"></div>
    <p id="tw-cost"></p>
    <p id="tw-error"></p>
    <div id="tw-actions">
      <button id="tw-done">Done</button>
      <button id="tw-cancel">Cancel</button>
    </div>
  `;
  root.appendChild(panel);
  makeDraggable(panel, panel.querySelector('h3') as HTMLElement, 'transit-wizard');

  const title = panel.querySelector('#tw-title') as HTMLElement;
  const help = panel.querySelector('#tw-help') as HTMLElement;
  const colorsEl = panel.querySelector('#tw-colors') as HTMLElement;
  const costEl = panel.querySelector('#tw-cost') as HTMLElement;
  const errorEl = panel.querySelector('#tw-error') as HTMLElement;

  let mode: Zone = Zone.BusStop;
  let phase: 'route' | 'stops' = 'route';
  let vertices: [number, number][] = [];
  let stops: [number, number][] = [];
  let color = LINE_COLORS[1];
  let open = false;

  const swatches: HTMLButtonElement[] = [];
  for (const c of LINE_COLORS) {
    const b = document.createElement('button');
    b.className = 'tw-swatch';
    b.style.background = c;
    b.addEventListener('click', () => {
      color = c;
      syncSwatches();
      pushDraft();
    });
    colorsEl.appendChild(b);
    swatches.push(b);
  }
  function syncSwatches() {
    swatches.forEach((b, i) => b.classList.toggle('selected', LINE_COLORS[i] === color));
  }

  function path(): [number, number][] {
    return rasterizePath(vertices);
  }

  function pushDraft(pending: [number, number][] | null = null) {
    onDraft(open ? { color, path: path(), stops, pending } : null);
  }

  function sync(err = '') {
    title.textContent = MODE_NAMES[mode] ?? 'Transit Line';
    help.textContent = phase === 'route' ? ROUTE_HELP : STOPS_HELP;
    const cost = lineCost(mode, path(), stops);
    costEl.textContent = `Cost so far: §${cost.toLocaleString('en-US')} (${path().length} track tiles, ${stops.length} stops)`;
    errorEl.textContent = err;
    syncSwatches();
  }

  function close() {
    open = false;
    panel.classList.add('hidden');
    pushDraft();
  }

  panel.querySelector('#tw-cancel')!.addEventListener('click', () => close());
  panel.querySelector('#tw-done')!.addEventListener('click', () => {
    if (phase === 'route') {
      sync('Finish the route first (double-click the map).');
      return;
    }
    if (stops.length === 0) {
      sync('Add at least one stop.');
      return;
    }
    const city = getCity();
    const draft = { mode, color, path: path(), stops };
    if (!buildLine(city, draft)) {
      sync(`Costs §${lineCost(mode, draft.path, stops).toLocaleString('en-US')} — not enough funds.`);
      return;
    }
    onBuilt(mode);
    close();
  });

  return {
    open(m: Zone) {
      const city = getCity();
      if (!transitUnlocked(m, city) && m !== Zone.BusStop) {
        onError(`${MODE_NAMES[m]} unlocks at ${transitUnlockLabel(m) ?? 'a larger population'}`);
        return;
      }
      mode = m;
      phase = 'route';
      vertices = [];
      stops = [];
      color = LINE_COLORS[1];
      open = true;
      panel.classList.remove('hidden');
      sync();
      pushDraft();
    },
    isOpen: () => open,
    clickTile(x: number, y: number) {
      const city = getCity();
      if (phase === 'route') {
        const last = vertices[vertices.length - 1];
        if (last && last[0] === x && last[1] === y) return; // dblclick's second hit
        if (last) {
          const seg = rasterizePath([last, [x, y]]);
          if (!seg.every(([px, py]) => validPathTile(city, mode, px, py))) {
            sync('The route cannot cross water.');
            return;
          }
        } else if (!validPathTile(city, mode, x, y)) {
          sync('The route cannot start on water.');
          return;
        }
        vertices.push([x, y]);
        sync();
        pushDraft();
        return;
      }
      const at = stops.findIndex(([sx, sy]) => sx === x && sy === y);
      if (at >= 0) {
        stops.splice(at, 1);
        sync();
        pushDraft();
        return;
      }
      if (!validStopSite(city, path(), x, y)) {
        sync('Stops need clear ground on or beside the route.');
        return;
      }
      stops.push([x, y]);
      sync();
      pushDraft();
    },
    dblClick() {
      if (phase !== 'route') return;
      if (vertices.length < 2) {
        sync('A route needs at least two points.');
        return;
      }
      phase = 'stops';
      sync();
      pushDraft();
    },
    hoverTile(x: number, y: number) {
      if (!open || phase !== 'route' || vertices.length === 0) return;
      const last = vertices[vertices.length - 1];
      pushDraft(rasterizePath([last, [x, y]]));
    },
    cancel: () => close(),
  };
}
