/**
 * Lots, not tiles.
 *
 * Every building used to stand on a tinted diamond with a garden path. A real
 * building stands on a *plot*: a sidewalk along the street, a lawn with mow
 * lines, a driveway to a garage, a fence or hedge down one side, a car; or a
 * parking lot with painted bays; or a fenced yard with pallets and tanks.
 * The ground is the half of the picture a box-on-grass has none of.
 *
 * The layout is a pure function of the lot and which screen side its road is
 * on. Canonical layouts are authored with the road on side 2 (the lower-left
 * edge) and rotated into place, so the same plot turns with the camera and
 * the driveway always meets the street. The painter bakes it into its own
 * tile-sized sprite — not the building's, or every house would bake four
 * times over — blitted in the ground pass so cast shadows fall on it.
 */

import { idx, inBounds } from '../sim/grid';
import { frontage } from '../sim/roads';
import { normalizeTier } from '../sim/tiers';
import { CityState, Stage, Tier, Zone } from '../sim/types';
import { hash2 } from './noise';

export type LotGround = 'lawn' | 'paving' | 'asphalt' | 'gravel' | 'plaza' | 'field' | 'xeriscape';

export type FeatureKind =
  | 'sidewalk'
  | 'driveway'
  | 'path'
  | 'fence'
  | 'hedge'
  | 'bed'
  | 'mailbox'
  | 'car'
  | 'bays'
  | 'lamp'
  | 'sign'
  | 'dumpster'
  | 'planter'
  | 'bench'
  | 'container'
  | 'pallets'
  | 'tank'
  | 'truck'
  | 'tree'
  | 'shrub'
  | 'kerb'
  | 'rows';

/**
 * Tile-fraction coordinates: u along grid x, v along grid y, both −0.5..0.5
 * over the whole block; `w`/`d` are extents along u/v; `along` is the screen
 * side (0..3) a linear feature runs beside; `n` a count for repeated things.
 */
export interface Feature {
  kind: FeatureKind;
  u: number;
  v: number;
  w?: number;
  d?: number;
  along?: number;
  n?: number;
}

export interface LotLayout {
  ground: LotGround;
  features: Feature[];
}

/** Screen-side directions in grid steps at rest: 0 north, 1 east, 2 south, 3 west. */
const SIDE_DIRS: [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/**
 * Which screen side (0..3) the nearest frontage road is on, or −1 when there
 * is none within two tiles. A quarter turn moves grid side k to screen side
 * k+q — the same rule `rotateMask` applies to road connectivity.
 */
export function roadSideOf(city: CityState, x: number, y: number, quarter: number): number {
  for (let r = 1; r <= 2; r++) {
    for (let k = 0; k < 4; k++) {
      const [dx, dy] = SIDE_DIRS[k];
      const nx = x + dx * r;
      const ny = y + dy * r;
      if (!inBounds(nx, ny)) continue;
      if (frontage(city.tiles[idx(nx, ny)])) return (k + ((quarter % 4) + 4)) % 4;
    }
  }
  return -1;
}

/** One quarter turn in tile space: (u, v) → (−v, u); extents swap; the side steps on. */
export function rotateFeature(f: Feature, turns: number): Feature {
  let out: Feature = { ...f };
  const n = ((turns % 4) + 4) % 4;
  for (let t = 0; t < n; t++) {
    const next: Feature = { ...out, u: -out.v, v: out.u };
    delete next.w;
    delete next.d;
    if (out.d !== undefined) next.w = out.d;
    if (out.w !== undefined) next.d = out.w;
    if (out.along !== undefined) next.along = (out.along + 1) % 4;
    out = next;
  }
  return out;
}

type Fam = 'R1' | 'R2' | 'R3' | 'C1' | 'C2' | 'C3' | 'ag' | 'dirty' | 'manu' | 'tech';

function famOf(zone: Zone, tier: Tier): Fam {
  const t = normalizeTier(zone, tier);
  if (zone === Zone.Industrial) return t as Fam;
  return `${zone === Zone.Residential ? 'R' : 'C'}${t}` as Fam;
}

/** Canonical layouts: road on side 2, i.e. the v = +0.5 edge. */
function canonical(fam: Fam, stage: Stage, bucket: number, desert: boolean): LotLayout {
  const r = (k: number) => hash2(bucket, k, 1234 + stage);
  const F: Feature[] = [];
  const sidewalk = (): void => {
    F.push({ kind: 'sidewalk', u: 0, v: 0.46, w: 1, d: 0.08, along: 2 });
  };

  // ---- residential --------------------------------------------------------
  if (fam === 'R1' || fam === 'R2' || fam === 'R3') {
    if (stage <= 3) {
      sidewalk();
      const gx = r(1) > 0.5 ? 0.3 : -0.3; // which side the garage is on
      F.push({ kind: 'driveway', u: gx, v: 0.22, w: 0.16, d: 0.56, along: 2 });
      F.push({ kind: 'path', u: -gx * 0.35, v: 0.3, w: 0.08, d: 0.34, along: 2 });
      if (r(2) > 0.4) F.push({ kind: 'car', u: gx, v: 0.34, w: 0.12, d: 0.2, along: 2 });
      F.push({
        kind: fam === 'R3' ? 'hedge' : r(3) > 0.5 ? 'fence' : 'hedge',
        u: gx > 0 ? -0.47 : 0.47,
        v: 0,
        w: 0.05,
        d: 0.9,
        along: gx > 0 ? 3 : 1,
      });
      F.push({ kind: 'bed', u: -gx * 0.35, v: 0.42, w: 0.2, d: 0.06 });
      F.push({ kind: 'mailbox', u: -gx * 0.35 + 0.08, v: 0.47, w: 0.02, d: 0.02 });
      const trees = fam === 'R3' ? 2 : fam === 'R2' ? 1 + (r(4) > 0.6 ? 1 : 0) : r(4) > 0.5 ? 1 : 0;
      for (let k = 0; k < trees; k++) {
        F.push({ kind: 'tree', u: (r(5 + k) - 0.5) * 0.7, v: -0.38 + r(8 + k) * 0.2 });
      }
      F.push({ kind: 'shrub', u: -gx * 0.35 - 0.1, v: 0.38 });
      return { ground: desert ? 'xeriscape' : 'lawn', features: F };
    }
    if (stage <= 5) {
      sidewalk();
      F.push({ kind: 'kerb', u: 0, v: 0.42, w: 1, d: 0.02, along: 2 });
      F.push({ kind: 'planter', u: -0.36, v: 0.4, w: 0.12, d: 0.06 });
      F.push({ kind: 'planter', u: 0.36, v: 0.4, w: 0.12, d: 0.06 });
      F.push({ kind: 'dumpster', u: 0.4, v: -0.42, w: 0.1, d: 0.08 });
      if (r(2) > 0.5) F.push({ kind: 'car', u: -0.1, v: 0.38, w: 0.12, d: 0.2, along: 2 });
      F.push({ kind: 'tree', u: -0.42, v: -0.3 });
      return { ground: 'paving', features: F };
    }
    // towers stand on a plaza
    sidewalk();
    F.push({ kind: 'planter', u: -0.38, v: 0.36, w: 0.14, d: 0.08 });
    F.push({ kind: 'planter', u: 0.38, v: 0.36, w: 0.14, d: 0.08 });
    F.push({ kind: 'bench', u: 0, v: 0.4, w: 0.12, d: 0.03, along: 2 });
    F.push({ kind: 'lamp', u: 0.44, v: 0.44 });
    F.push({ kind: 'tree', u: -0.4, v: 0.3 });
    return { ground: 'plaza', features: F };
  }

  // ---- commercial ---------------------------------------------------------
  if (fam === 'C1' || fam === 'C2' || fam === 'C3') {
    if (fam === 'C1' && stage <= 3) {
      sidewalk();
      const n = 4 + Math.floor(r(1) * 3);
      F.push({ kind: 'bays', u: 0, v: 0.26, w: 0.84, d: 0.24, along: 2, n });
      const cars = 1 + Math.floor(r(2) * Math.min(4, n - 1));
      for (let k = 0; k < cars; k++) {
        F.push({
          kind: 'car',
          u: -0.36 + (k / (n - 1)) * 0.72 + (r(9 + k) - 0.5) * 0.02,
          v: 0.26,
          w: 0.1,
          d: 0.18,
          along: 2,
        });
      }
      F.push({ kind: 'lamp', u: 0.44, v: 0.24 });
      F.push({ kind: 'sign', u: -0.44, v: 0.44 });
      F.push({ kind: 'dumpster', u: 0.42, v: -0.42, w: 0.1, d: 0.08 });
      return { ground: 'asphalt', features: F };
    }
    if (stage <= 5) {
      sidewalk();
      F.push({ kind: 'kerb', u: 0, v: 0.42, w: 1, d: 0.02, along: 2 });
      if (r(2) > 0.4) F.push({ kind: 'truck', u: 0.2, v: 0.36, w: 0.14, d: 0.22, along: 2 });
      F.push({ kind: 'planter', u: -0.4, v: 0.4, w: 0.1, d: 0.06 });
      F.push({ kind: 'dumpster', u: -0.42, v: -0.42, w: 0.1, d: 0.08 });
      return { ground: 'paving', features: F };
    }
    sidewalk();
    F.push({ kind: 'planter', u: -0.4, v: 0.34, w: 0.14, d: 0.08 });
    F.push({ kind: 'planter', u: 0.4, v: 0.34, w: 0.14, d: 0.08 });
    F.push({ kind: 'bench', u: -0.2, v: 0.4, w: 0.12, d: 0.03, along: 2 });
    F.push({ kind: 'lamp', u: 0.44, v: 0.44 });
    if (r(3) > 0.5) F.push({ kind: 'car', u: 0.1, v: 0.42, w: 0.1, d: 0.16, along: 2 });
    F.push({ kind: 'tree', u: 0.42, v: 0.2 });
    return { ground: 'plaza', features: F };
  }

  // ---- industrial ---------------------------------------------------------
  if (fam === 'ag') {
    F.push({ kind: 'rows', u: 0, v: 0, w: 1, d: 1, n: r(1) > 0.5 ? 0 : 1 });
    F.push({ kind: 'fence', u: 0, v: 0.47, w: 0.96, d: 0.04, along: 2 });
    F.push({ kind: 'path', u: 0.3, v: 0.3, w: 0.08, d: 0.4, along: 2 });
    return { ground: 'field', features: F };
  }
  F.push({ kind: 'fence', u: 0, v: 0.47, w: 0.96, d: 0.04, along: 2 });
  F.push({ kind: 'fence', u: -0.47, v: 0, w: 0.04, d: 0.96, along: 3 });
  F.push({ kind: 'driveway', u: 0.3, v: 0.25, w: 0.2, d: 0.5, along: 2 });
  if (r(1) > 0.4) F.push({ kind: 'truck', u: 0.3, v: 0.3, w: 0.14, d: 0.24, along: 2 });
  F.push({ kind: 'pallets', u: -0.36, v: 0.36, w: 0.14, d: 0.1 });
  if (fam !== 'tech') F.push({ kind: 'container', u: -0.34, v: -0.34, w: 0.22, d: 0.1, along: 3 });
  if (fam === 'dirty') F.push({ kind: 'tank', u: 0.38, v: -0.34, w: 0.12, d: 0.12 });
  F.push({ kind: 'lamp', u: 0.44, v: 0.44 });
  return { ground: fam === 'tech' ? 'paving' : fam === 'manu' ? 'asphalt' : 'gravel', features: F };
}

/**
 * The plot for a lot, turned so its driveway meets the road on screen side
 * `side` (−1: no road in reach, which lays it out as if the road were on the
 * near-left edge). A block is laid out over its whole footprint in the same
 * −0.5..0.5 space, so `size` only matters to the painter.
 */
export function layoutLot(
  zone: Zone,
  tier: Tier,
  stage: Stage,
  bucket: number,
  size: number,
  side: number,
  desert: boolean,
): LotLayout {
  void size;
  const base = canonical(famOf(zone, tier), stage, bucket, desert);
  const turns = ((((side < 0 ? 2 : side) - 2) % 4) + 4) % 4;
  return { ground: base.ground, features: base.features.map((f) => rotateFeature(f, turns)) };
}
