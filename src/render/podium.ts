/**
 * Generated massing for the tall lots: a podium the full footprint and a
 * tower standing on it, flush with the street on two sides and set back on
 * the two away from it. Units are the archetype's: normalised to the stage's
 * footprint budget, |ox| + w/2 ≤ 0.5. Pure, so the geometry is testable.
 */

import type { SubBox } from './archetypes';

export type PlanShape = 'square' | 'slab' | 'L' | 'chamfered';
export const PLAN_SHAPES: PlanShape[] = ['square', 'slab', 'L', 'chamfered'];

export interface PodiumTower {
  boxes: SubBox[];
  shape: PlanShape;
}

/** Half-extent of a box that runs from the flush edge `edge` (±0.5) inward by `len`. */
function run(edge: number, len: number): { c: number; half: number } {
  return { c: edge - Math.sign(edge) * (len / 2), half: len / 2 };
}

/**
 * `side` is the street's screen side (0 N −y, 1 E +x, 2 S +y, 3 W −x) or −1,
 * in which case the tower hugs the hidden north and west. The flush
 * street-axis end is the channels' choice, so a row of towers staggers.
 */
export function podiumTower(chan: () => number, side: number): PodiumTower {
  const shape = PLAN_SHAPES[Math.min(3, Math.floor(chan() * 4))];
  const podiumH = 0.2 + chan() * 0.1;
  const setA = 0.1 + chan() * 0.12; // set-back on the far street-axis end
  const setB = 0.1 + chan() * 0.12; // set-back on the side away from the street
  const endPick = chan() < 0.5 ? -1 : 1; // which street-axis end the tower is flush with
  const cham = 0.2 + chan() * 0.1;

  // the street axis: along x for a street north or south, along y for east or west
  const alongX = side === 0 || side === 2 || side < 0;
  // the flush edge toward the street, in the perpendicular axis
  const streetEdge = side === 2 ? 0.5 : side === 1 ? 0.5 : -0.5; // N and W (and none) are −0.5
  const perp = run(streetEdge, 1 - setB);
  const along = run(endPick * 0.5, 1 - setA);

  const box = (cAlong: number, hAlong: number, cPerp: number, hPerp: number, hf: number, extra: Partial<SubBox> = {}): SubBox =>
    alongX
      ? { ox: cAlong, oy: cPerp, f: 1, hf, w: hAlong * 2, d: hPerp * 2, ...extra }
      : { ox: cPerp, oy: cAlong, f: 1, hf, w: hPerp * 2, d: hAlong * 2, ...extra };

  const boxes: SubBox[] = [{ ox: 0, oy: 0, f: 1, hf: podiumH, w: 1, d: 1 }];
  switch (shape) {
    case 'square':
      boxes.push(box(along.c, along.half, perp.c, perp.half, 1));
      break;
    case 'slab': {
      // long along the street, half as deep
      const deep = run(streetEdge, (1 - setB) * 0.55);
      boxes.push(box(along.c, along.half, deep.c, deep.half, 1));
      break;
    }
    case 'L': {
      // the main slab along the street, a wing back along the flush end
      const deep = run(streetEdge, (1 - setB) * 0.5);
      boxes.push(box(along.c, along.half, deep.c, deep.half, 1));
      const wing = run(endPick * 0.5, (1 - setA) * 0.45);
      boxes.push(box(wing.c, wing.half, perp.c, perp.half, 0.82));
      break;
    }
    case 'chamfered':
      boxes.push(box(along.c, along.half, perp.c, perp.half, 1, { chamfer: cham }));
      break;
  }
  return { boxes, shape };
}
