import { idx } from './grid';
import { tilesWithin } from './grid';
import { CityState, FIRE_RISK, GRID, SERVICE_RADII, Zone } from './types';

const SERVICES: { zone: Zone; radius: number; field: 'fireCov' | 'policeCov' | 'schoolCov' }[] = [
  { zone: Zone.FireStation, radius: SERVICE_RADII.fire, field: 'fireCov' },
  { zone: Zone.PoliceStation, radius: SERVICE_RADII.police, field: 'policeCov' },
  { zone: Zone.School, radius: SERVICE_RADII.school, field: 'schoolCov' },
];

/**
 * Refresh service coverage: linear falloff from each powered station,
 * overlapping stations take the max. Run after updatePower.
 */
export function updateCoverage(city: CityState): void {
  for (const t of city.tiles) {
    t.fireCov = 0;
    t.policeCov = 0;
    t.schoolCov = 0;
  }
  for (let i = 0; i < city.tiles.length; i++) {
    const station = city.tiles[i];
    const service = SERVICES.find((s) => s.zone === station.zone);
    if (!service || !station.powered) continue;
    const x = i % GRID;
    const y = (i / GRID) | 0;
    for (const [nx, ny] of tilesWithin(x, y, service.radius)) {
      const d = Math.max(Math.abs(nx - x), Math.abs(ny - y));
      const cov = 1 - d / service.radius;
      const t = city.tiles[idx(nx, ny)];
      if (cov > t[service.field]) t[service.field] = cov;
    }
  }
}

/**
 * Monthly fire roll: developed buildings with zero fire coverage can burn
 * to the ground (back to bare zoned land). Pushes a notice per fire.
 */
export function fireRisk(city: CityState, rand: () => number): void {
  for (let i = 0; i < city.tiles.length; i++) {
    const t = city.tiles[i];
    const developable =
      t.zone === Zone.Residential || t.zone === Zone.Commercial || t.zone === Zone.Industrial;
    if (!developable || t.stage === 0 || t.abandoned || t.fireCov > 0) continue;
    if (rand() < FIRE_RISK) {
      t.stage = 0;
      const x = i % GRID;
      const y = (i / GRID) | 0;
      city.notices.push(`Fire! A building at (${x}, ${y}) burned down — no fire coverage.`);
    }
  }
}
