/**
 * Crime: the thing police coverage is finally for.
 *
 * Every developed lot carries a standing crime *rate* set by its conditions —
 * poverty above all, then crowding, joblessness, and the blight of abandoned
 * neighbours — cut down by police coverage and the Neighborhood Watch. The
 * rate drags land value and growth (never destroys, never gates), and rolls
 * each month into cosmetic incidents the player hears and sees.
 *
 * It mirrors fire (a field that rolls into an event) and garbage (pressure,
 * not destruction) rather than being its own kind of thing — the fourth
 * feature in that mold, and deliberately shaped like the others.
 */

import { modifier } from './content';
import { idx, neighbors4 } from './grid';
import { CityState, GRID, Zone } from './types';

/** Baseline propensity by what sits on the lot. Commerce draws thieves; a
 * factory floor barely registers. */
const BASE_BY_ZONE: Partial<Record<Zone, number>> = {
  [Zone.Residential]: 0.15,
  [Zone.Commercial]: 0.22,
  [Zone.Industrial]: 0.08,
};

/** Full police coverage removes this share of a tile's crime. */
const POLICE_CUT = 0.85;
/** Each abandoned or rubble-strewn neighbour adds this much. */
const BLIGHT_ADD = 0.04;
/** How fast the standing rate chases its target — a station calms a block
 * over several months rather than overnight. */
const EASE = 0.3;
/** A tile at 100% crime has about this chance of an incident in a month. */
const INCIDENT_SCALE = 0.06;
/** Frames an incident marker lingers. */
const FLASH_FRAMES = 90;

const NOTICES = [
  (x: number, y: number) => `Burglary reported at (${x}, ${y}).`,
  (x: number, y: number) => `Vandalism on the block at (${x}, ${y}).`,
  (x: number, y: number) => `A robbery was reported at (${x}, ${y}).`,
  (x: number, y: number) => `Car theft near (${x}, ${y}).`,
];

const isRCI = (zone: Zone): boolean =>
  zone === Zone.Residential || zone === Zone.Commercial || zone === Zone.Industrial;

/**
 * The crime rate a tile's conditions call for, before easing. Exported so the
 * Query panel and the tests read exactly what the pass computes.
 */
export function crimeTarget(city: CityState, i: number): number {
  const t = city.tiles[i];
  const zoneBase = BASE_BY_ZONE[t.zone];
  if (zoneBase === undefined || t.stage === 0) return 0;

  // Poverty dominates: a §§§ block is nearly clean, a collapsed one a magnet.
  const poverty = 0.3 + 1.7 * (1 - t.landValue);
  const crowding = 0.6 + 0.2 * t.density;
  let rate = zoneBase * poverty * crowding;

  // Residents with no reachable work run hotter.
  if (t.zone === Zone.Residential && !Number.isFinite(t.commute)) rate *= 1.6;

  // Broken windows: blighted neighbours spread it.
  const x = i % GRID;
  const y = (i / GRID) | 0;
  let blight = 0;
  for (const [nx, ny] of neighbors4(x, y)) {
    const n = city.tiles[idx(nx, ny)];
    if ((n.abandoned && n.stage > 0) || n.rubble > 0) blight += BLIGHT_ADD;
  }
  rate += blight;

  // Police presence, then the city-wide policy lever, both cut it.
  rate *= 1 - POLICE_CUT * Math.min(1, t.policeCov);
  rate *= modifier(city, 'crime.rate');

  return Math.max(0, Math.min(1, rate));
}

/** Monthly: ease every tile's standing rate toward what its conditions call
 * for, so change is visible over months rather than snapping. */
export function updateCrime(city: CityState): void {
  for (let i = 0; i < city.tiles.length; i++) {
    const t = city.tiles[i];
    if (!isRCI(t.zone) || t.stage === 0) {
      t.crime = 0;
      continue;
    }
    const goal = crimeTarget(city, i);
    t.crime += (goal - t.crime) * EASE;
    if (t.crime < 0.001) t.crime = 0;
  }
}

/** Monthly: roll each occupied lot against its own rate. A hit is a notice
 * and a brief marker — the sim pressure is the rate itself, this is the
 * feedback the player hears and sees. */
export function crimeIncidents(city: CityState, rand: () => number): void {
  for (let i = 0; i < city.tiles.length; i++) {
    const t = city.tiles[i];
    if (!isRCI(t.zone) || t.stage === 0 || t.abandoned) continue;
    if (t.crime <= 0) continue;
    if (rand() < t.crime * INCIDENT_SCALE) {
      const x = i % GRID;
      const y = (i / GRID) | 0;
      const pick = Math.floor(rand() * NOTICES.length) % NOTICES.length;
      city.notices.push(NOTICES[pick](x, y));
      t.crimeFlash = FLASH_FRAMES;
    }
  }
}

/** Highest crime rate anywhere developed — cheap read for the advisor/HUD. */
export function peakCrime(city: CityState): number {
  let peak = 0;
  for (const t of city.tiles) if (t.crime > peak) peak = t.crime;
  return peak;
}
