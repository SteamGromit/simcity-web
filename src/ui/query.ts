import { idx } from '../sim/grid';
import { CityState, Zone } from '../sim/types';

const ZONE_NAMES: Record<Zone, string> = {
  [Zone.None]: 'Empty land',
  [Zone.Residential]: 'Residential',
  [Zone.Commercial]: 'Commercial',
  [Zone.Industrial]: 'Industrial',
  [Zone.Road]: 'Road',
  [Zone.PowerPlant]: 'Coal Plant',
  [Zone.PowerLine]: 'Power Line',
  [Zone.Park]: 'Park',
};

export function buildQuery(root: HTMLElement) {
  const el = document.createElement('div');
  el.id = 'query-panel';
  el.className = 'panel hidden';
  root.appendChild(el);

  return {
    show(city: CityState, x: number, y: number, clientX: number, clientY: number) {
      const t = city.tiles[idx(x, y)];
      const rows: [string, string][] = [['Tile', `${x}, ${y}`]];
      rows.push(['Type', ZONE_NAMES[t.zone] + (t.abandoned ? ' (abandoned)' : '')]);
      if (t.zone === Zone.Residential || t.zone === Zone.Commercial || t.zone === Zone.Industrial) {
        rows.push(['Stage', t.stage === 0 ? 'undeveloped' : String(t.stage)]);
        rows.push(['Powered', t.powered ? 'yes' : 'no']);
        rows.push(['Commute', Number.isFinite(t.commute) ? String(t.commute) : '—']);
      }
      if (t.zone === Zone.Road) {
        rows.push(['Traffic', String(t.traffic)]);
        if (t.wire) rows.push(['Power line', 'overhead']);
      }
      rows.push(['Land value', `${Math.round(t.landValue * 100)}%`]);
      rows.push(['Pollution', `${Math.round(t.pollution * 100)}%`]);

      el.innerHTML =
        `<h3>Tile info</h3>` +
        rows.map(([k, v]) => `<div><span>${k}</span><span class="val">${v}</span></div>`).join('');
      el.classList.remove('hidden');
      const pad = 12;
      el.style.left = `${Math.min(clientX + pad, window.innerWidth - 200)}px`;
      el.style.top = `${Math.min(clientY + pad, window.innerHeight - 220)}px`;
    },
    hide() {
      el.classList.add('hidden');
    },
  };
}
