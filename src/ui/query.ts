import { buildingBySlot } from '../content/registry';
import { collapseChance } from '../sim/safety';
import { entityFor, variantAt } from '../sim/entities';
import { idx } from '../sim/grid';
import { tierLabel } from '../sim/tierstats';
import { CityState, ROAD_CAPACITY, Terrain, Zone } from '../sim/types';

const ZONE_NAMES: Record<Zone, string> = {
  [Zone.None]: 'Empty land',
  [Zone.Residential]: 'Residential',
  [Zone.Commercial]: 'Commercial',
  [Zone.Industrial]: 'Industrial',
  [Zone.Road]: 'Road',
  [Zone.PowerPlant]: 'Coal Plant',
  [Zone.PowerLine]: 'Power Line',
  [Zone.Park]: 'Park',
  [Zone.FireStation]: 'Fire Station',
  [Zone.PoliceStation]: 'Police Station',
  [Zone.School]: 'School',
  [Zone.Hospital]: 'Hospital',
  [Zone.BusStop]: 'Bus Stop',
  [Zone.WaterPump]: 'Water Pump',
  [Zone.WaterPipe]: 'Water Pipe',
  [Zone.SolarPlant]: 'Solar Farm',
  [Zone.WindTurbine]: 'Wind Turbine',
  [Zone.HydroPlant]: 'Hydro Plant',
  [Zone.NuclearPlant]: 'Nuclear Plant',
  [Zone.StreetcarStop]: 'Streetcar Stop',
  [Zone.MonorailStation]: 'Monorail Station',
  [Zone.SubwayStation]: 'Subway Station',
  [Zone.RailTerminal]: 'Rail Terminal',
  [Zone.Landfill]: 'Landfill',
  [Zone.Incinerator]: 'Incinerator',
  [Zone.RecyclingCentre]: 'Recycling Centre',
  [Zone.Prison]: 'Prison',
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
      if (t.zone === Zone.None && t.terrain !== Terrain.Grass) {
        rows.push(['Type', t.terrain === Terrain.Water ? 'Water' : 'Forest']);
      } else if (t.zone === Zone.Road && t.terrain === Terrain.Water) {
        rows.push(['Type', 'Bridge']);
      } else {
        // A slot the core doesn't know is authored content; name it from the
        // registry, or say plainly that its pack isn't loaded.
        const def = buildingBySlot(t.zone);
        const name = ZONE_NAMES[t.zone] ?? def?.name ?? 'Unknown (mod not loaded)';
        rows.push(['Type', name + (t.abandoned ? ' (abandoned)' : '')]);
      }
      if (t.elevation > 0) rows.push(['Elevation', String(t.elevation)]);
      if (t.zone === Zone.Residential || t.zone === Zone.Commercial || t.zone === Zone.Industrial) {
        if (t.burning > 0) rows.push(['Status', '🔥 ON FIRE']);
        const business =
          t.stage > 0 && !t.abandoned
            ? entityFor(t.zone, t.tier, t.stage, variantAt(city.seed, idx(x, y)))
            : null;
        if (business) rows.push(['Business', business.name]);
        rows.push(['Density', ['', 'Low', 'Medium', 'High'][t.density]]);
        if (t.stage > 0) rows.push(['Tier', tierLabel(t.zone, t.tier)]);
        rows.push(['Stage', t.stage === 0 ? 'undeveloped' : String(t.stage)]);
        rows.push(['Powered', t.powered ? 'yes' : 'no']);
        rows.push(['Watered', t.watered ? 'yes' : 'no']);
        rows.push(['Commute', Number.isFinite(t.commute) ? String(t.commute) : '—']);
        rows.push(['Fire cover', `${Math.round(t.fireCov * 100)}%`]);
        rows.push(['Police cover', `${Math.round(t.policeCov * 100)}%`]);
        rows.push(['School cover', `${Math.round(t.schoolCov * 100)}%`]);
        rows.push(['Health cover', `${Math.round(t.healthCov * 100)}%`]);
        rows.push(['Bus access', t.busCov > 0 ? 'yes' : 'no']);
        rows.push(['Refuse pickup', t.garbageCov > 0 ? 'yes' : 'no']);
        if (t.garbage > 0.005) rows.push(['Rubbish', `${Math.round(t.garbage * 100)}%`]);
        rows.push(['Crime', `${Math.round(t.crime * 100)}%`]);
        const years = Math.floor(t.age / 12);
        rows.push(['Age', years === 1 ? '1 year' : `${years} years`]);
        const risk = collapseChance(city, idx(x, y));
        rows.push(['Condition', risk > 0 ? 'at risk — repair it' : years >= 80 ? 'aging' : 'sound']);
      }
      if (t.zone === Zone.Road) {
        if (t.accident > 0) rows.push(['Status', '🚧 accident — road blocked']);
        rows.push(['Traffic', String(Math.round(t.traffic))]);
        rows.push(['Congestion', `${Math.round(Math.min(1, t.traffic / (ROAD_CAPACITY * 2)) * 100)}%`]);
        if (t.wire) rows.push(['Power line', 'overhead']);
        if (t.pipe) rows.push(['Water main', 'buried']);
      }
      // What an authored building does, read off its definition.
      const authored = buildingBySlot(t.zone);
      if (authored?.visual) {
        if (authored.power) rows.push(['Power', `+${authored.power.capacity}`]);
        if (authored.service) {
          rows.push(['Service', `${authored.service.kind} · radius ${authored.service.radius}`]);
        }
        if (authored.transit) rows.push(['Transit', `radius ${authored.transit.radius}`]);
        if (authored.upkeep > 0) rows.push(['Upkeep', `§${authored.upkeep}/mo`]);
        rows.push(['Powered', t.powered ? 'yes' : 'no']);
      }

      if (
        t.zone === Zone.FireStation ||
        t.zone === Zone.PoliceStation ||
        t.zone === Zone.School ||
        t.zone === Zone.Hospital ||
        t.zone === Zone.BusStop ||
        t.zone === Zone.WaterPump ||
        t.zone === Zone.PowerPlant
      ) {
        rows.push(['Powered', t.powered ? 'yes' : 'no']);
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
