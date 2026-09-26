/**
 * Roofs that are roofs.
 *
 * A pitched roof used to be two triangles in a slightly different colour
 * sitting exactly on the wall line. Here the eave overhangs the wall, the
 * slopes carry shingle courses, the ridge has a cap, a gable end shows the
 * wall material under a bargeboard, and some roofs carry a dormer or a
 * chimney with a cap. A flat roof is a gravel deck with a parapet that
 * shades it, then plant: HVAC with fan grilles and ducts, a hatch, a tank on
 * legs, vents, skylights, the occasional mast. Tall towers keep their crowns.
 *
 * The pure placement functions — `placeRoofProps`, `chimneyHeight`,
 * `eaveOutline`, `ridgeOf` — are shared with the ambient pass and the tests;
 * their geometry is what a hearth wisp rises from.
 */

import { hash2 } from './noise';
import { Hsl, css, hsl, lit, material, mix } from './palette';
import {
  Material,
  centre,
  diamond,
  fill,
  halfExtent,
  inset,
  parapet,
  prism,
  raise,
  roofTone,
} from './massing';
import { LIGHT, Pt, wallLight } from './sun';
import type { PropKind, RoofStyle } from './archetypes';

// ---------------------------------------------------------------------------
// Pure geometry
// ---------------------------------------------------------------------------

/** Where roof props land — the pure half of roofKit, shared with the ambient
 * pass so a hearth wisp rises from exactly the chimney the bake drew. */
export function placeRoofProps(
  kinds: PropKind[],
  roof: Pt[],
  seed: number,
): { kind: PropKind; x: number; y: number; k: number }[] {
  const cx = (roof[0][0] + roof[2][0]) / 2;
  const cy = (roof[1][1] + roof[3][1]) / 2;
  const [hw, hh] = halfExtent(roof);
  const out: { kind: PropKind; x: number; y: number; k: number }[] = [];
  let k = 0;
  for (const kind of kinds) {
    // Most lots carry their props; a mast is the exception. Antennas on every
    // tower turned downtown into a pin cushion, so only about one in five gets
    // one and the rest take their silhouette from the crown instead.
    const chance = kind === 'antenna' ? 0.2 : kind === 'helipad' ? 0.6 : 0.82;
    if (hash2(k, 9, seed) > chance) {
      k++;
      continue;
    }
    const u = hash2(k, 1, seed) * 1.1 - 0.55;
    const v = hash2(k, 2, seed) * 1.1 - 0.55;
    const s = Math.min(1, 0.72 / (Math.abs(u) + Math.abs(v) + 1e-6));
    out.push({ kind, x: cx + u * s * hw, y: cy + v * s * hh, k: k++ });
  }
  return out;
}

/** The baked chimney prism's height for placement index k (post-increment,
 * as the original inline code read it). Shared by roofKit's chimney case and
 * hearthTip so the wisp can never drift off the baked stack. */
export function chimneyHeight(kPost: number, seed: number): number {
  return 9 + hash2(kPost, 5, seed) * 4;
}

/** The roof polygon grown outward by `px` on every edge, for an eave that
 * overhangs the wall. Grown from the centroid, so it is turn-independent. */
export function eaveOutline(roof: Pt[], px: number): Pt[] {
  if (px <= 0) return roof.slice();
  const [cx, cy] = centre(roof);
  return roof.map(([x, y]) => {
    const dx = x - cx;
    const dy = y - cy;
    const d = Math.hypot(dx, dy) || 1;
    // the ground plane is squashed 2:1, so a step "outward" is half as tall
    return [x + (dx / d) * px, y + (dy / d) * px * 0.55] as Pt;
  });
}

/** Indices of the two opposite edges the ridge runs between: the pair whose
 * midpoints are furthest apart, so the ridge lies along the longer plan axis. */
function ridgeEdges(roof: Pt[]): [number, number] {
  const mids: Pt[] = roof.map((p, i) => {
    const q = roof[(i + 1) % roof.length];
    return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  });
  let best: [number, number] = [0, Math.floor(mids.length / 2) % mids.length];
  let bestD = -1;
  for (let i = 0; i < mids.length; i++) {
    const j = (i + Math.floor(mids.length / 2)) % mids.length;
    const d = Math.hypot(mids[i][0] - mids[j][0], mids[i][1] - mids[j][1]);
    if (d > bestD + 1e-9) {
      bestD = d;
      best = [i, j];
    }
  }
  return best;
}

/** Ridge endpoints across the longer plan axis, lifted by `rise`. `shrink` is
 * how far each end is pulled in from the eave: 0 for a gable (the ridge
 * reaches the end wall), about a quarter for a hip. */
export function ridgeOf(roof: Pt[], rise: number, shrink = 0.28): [Pt, Pt] {
  const [cx, cy] = centre(roof);
  const [i, j] = ridgeEdges(roof);
  const mid = (k: number): Pt => {
    const p = roof[k];
    const q = roof[(k + 1) % roof.length];
    return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  };
  const mi = mid(i);
  const mj = mid(j);
  return [
    [mi[0] + (cx - mi[0]) * shrink, mi[1] + (cy - mi[1]) * shrink - rise],
    [mj[0] + (cx - mj[0]) * shrink, mj[1] + (cy - mj[1]) * shrink - rise],
  ];
}

// ---------------------------------------------------------------------------
// Roofing
// ---------------------------------------------------------------------------

/** What a pitched roof can be covered in. A street of identical terracotta is
 * the giveaway that a town was generated; real ones mix shingle, slate, tile
 * and standing-seam metal. */
export const ROOFING: Hsl[] = [
  hsl(220, 6, 38), // asphalt shingle, grey
  hsl(24, 14, 36), // asphalt shingle, brown
  hsl(212, 10, 34), // slate
  hsl(14, 40, 44), // terracotta
  hsl(30, 10, 52), // concrete tile
  hsl(150, 14, 36), // standing-seam green
  hsl(6, 36, 38), // standing-seam red
  hsl(210, 6, 56), // standing-seam grey
];

/** Membrane/gravel speckle and a drain stain over a flat deck, clipped to it. */
export function gravelSpeckle(ctx: CanvasRenderingContext2D, deck: Pt[], tone: Hsl, seed: number): void {
  const [cx, cy] = centre(deck);
  const [hw, hh] = halfExtent(deck);
  if (hw < 2 || hh < 1) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(deck[0][0], deck[0][1]);
  for (let i = 1; i < deck.length; i++) ctx.lineTo(deck[i][0], deck[i][1]);
  ctx.closePath();
  ctx.clip();
  const n = Math.min(160, Math.round(hw * hh * 0.09));
  for (let k = 0; k < n; k++) {
    const u = hash2(k, 1, seed) * 2 - 1;
    const v = hash2(k, 2, seed) * 2 - 1;
    if (Math.abs(u) + Math.abs(v) > 0.96) continue;
    ctx.fillStyle = css(lit(tone, LIGHT.roof * (hash2(k, 3, seed) > 0.5 ? 0.82 : 1.12)), 0.45);
    ctx.fillRect(cx + u * hw, cy + v * hh, 1.1, 0.8);
  }
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(4, hw * 0.5));
  g.addColorStop(0, 'rgba(10, 14, 26, 0.18)');
  g.addColorStop(1, 'rgba(10, 14, 26, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - hw, cy - hh, hw * 2, hh * 2);
  ctx.restore();
}

/**
 * The roof form a plan can actually carry. The pitched forms are cut for a
 * four-cornered plan that is roughly square: a chamfered mass has no ridge to
 * speak of, and a long slab under a gable grows an absurd triangle at each
 * end — both take a flat top. Callers that dress the wall for a roof (the
 * eave shadow, the hatch) ask this rather than the archetype, so a demoted
 * roof never leaves the shadow of an eave it does not have.
 */
export function effectiveRoofStyle(roof: Pt[], style: RoofStyle): RoofStyle {
  if (roof.length !== 4) return style === 'parapet' ? 'parapet' : 'flat';
  const ex = Math.hypot(roof[1][0] - roof[0][0], roof[1][1] - roof[0][1]);
  const ey = Math.hypot(roof[2][0] - roof[1][0], roof[2][1] - roof[1][1]);
  const aspect = Math.max(ex, ey) / Math.max(1e-6, Math.min(ex, ey));
  if (aspect > 1.9 && style !== 'sawtooth') return style === 'parapet' ? 'parapet' : 'flat';
  return style;
}

/** Whether a roof form has a deck a hatch can open onto. */
export function wantsHatch(style: RoofStyle): boolean {
  return style === 'flat' || style === 'parapet';
}

/** A roof polygon as a path, for clipping. */
function pathOf(ctx: CanvasRenderingContext2D, pts: Pt[]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

/**
 * Pitched, sawtooth and parapet roof caps over the main mass. `mat` is the
 * wall material, used for gable ends and fascias; without it the body colour
 * stands in.
 */
export function roofCap(
  ctx: CanvasRenderingContext2D,
  roof: Pt[],
  styleIn: RoofStyle,
  body: Hsl,
  seed: number,
  mat?: Material,
): void {
  const [cx, cy] = centre(roof);
  // How steep a pitch gets is a function of how wide the roof is, so it has
  // to be measured rather than read off a corner index — turned half a circle
  // the indexed version went negative and pitched every ridge downwards.
  const [rhw] = halfExtent(roof);
  const style = effectiveRoofStyle(roof, styleIn);
  const tile = ROOFING[Math.floor(hash2(seed, 6, 331) * ROOFING.length)];
  const trim = mat?.trim ?? hsl(40, 8, 80);
  const wall = mat?.body ?? body;

  if (style === 'gabled' || style === 'hipped') {
    const rise = Math.min(14, 5 + rhw * 0.34);
    const eave = eaveOutline(roof, 2.6);
    const [ri, rj] = ridgeEdges(eave);
    const [a, b] = ridgeOf(eave, rise, style === 'gabled' ? 0 : 0.28);
    // fascia: the eave edge seen as a thin lit board along the visible edges
    for (let i = 0; i < 4; i++) {
      const p = eave[i];
      const q = eave[(i + 1) % 4];
      if (q[0] - p[0] >= -1e-9) continue;
      fill(
        ctx,
        [p, q, [q[0], q[1] - 1.6], [p[0], p[1] - 1.6]],
        css(lit(trim, wallLight(p[0], p[1], q[0], q[1]))),
      );
    }
    const lifted = raise(eave, 1.6);
    const slopes: { pts: Pt[]; level: number; isEnd: boolean }[] = [];
    for (let i = 0; i < 4; i++) {
      const p = lifted[i];
      const q = lifted[(i + 1) % 4];
      const isEnd = i === ri || i === rj;
      const facing = q[0] - p[0] < -1e-9;
      // the slope over a screen-left edge takes the sun; over a screen-right
      // edge it turns away; back slopes face the sky
      const level = facing
        ? wallLight(p[0], p[1], q[0], q[1]) === LIGHT.left
          ? LIGHT.roof * 1.0
          : LIGHT.roof * 0.78
        : LIGHT.roof * 0.9;
      const dqa = Math.hypot(q[0] - a[0], q[1] - a[1]);
      const dqb = Math.hypot(q[0] - b[0], q[1] - b[1]);
      const nearQ = dqa < dqb ? a : b;
      const nearP = dqa < dqb ? b : a;
      if (isEnd) {
        const dpa = Math.hypot(p[0] - a[0], p[1] - a[1]);
        const dpb = Math.hypot(p[0] - b[0], p[1] - b[1]);
        slopes.push({ pts: [p, q, dpa + dqa < dpb + dqb ? a : b], level, isEnd: true });
      } else {
        slopes.push({ pts: [p, q, nearQ, nearP], level, isEnd: false });
      }
    }
    // back slopes first: sort by the mean screen y of the slope
    const meanY = (pts: Pt[]) => pts.reduce((m, p) => m + p[1], 0) / pts.length;
    slopes.sort((s, t) => meanY(s.pts) - meanY(t.pts));
    for (const s of slopes) {
      if (style === 'gabled' && s.isEnd) {
        // a gable end: the wall carries on up under a bargeboard
        const p = s.pts[0];
        const q = s.pts[1];
        const wl = q[0] - p[0] < -1e-9 ? wallLight(p[0], p[1], q[0], q[1]) : LIGHT.ambient;
        fill(ctx, s.pts, css(lit(wall, wl * 0.98)));
        ctx.strokeStyle = css(lit(trim, wl));
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(p[0], p[1]);
        ctx.lineTo(s.pts[2][0], s.pts[2][1]);
        ctx.lineTo(q[0], q[1]);
        ctx.stroke();
        continue;
      }
      fill(ctx, s.pts, css(lit(tile, s.level)));
      if (s.pts.length === 4) {
        // courses: lines parallel to the eave edge, stepping up the slope
        ctx.save();
        pathOf(ctx, s.pts);
        ctx.clip();
        ctx.strokeStyle = css(lit(tile, s.level * 0.78), 0.55);
        ctx.lineWidth = 0.7;
        const [p, q, r, t] = s.pts;
        const steps = Math.max(3, Math.round(rise / 1.6));
        for (let k = 1; k < steps; k++) {
          const f = k / steps;
          ctx.beginPath();
          ctx.moveTo(p[0] + (t[0] - p[0]) * f, p[1] + (t[1] - p[1]) * f);
          ctx.lineTo(q[0] + (r[0] - q[0]) * f, q[1] + (r[1] - q[1]) * f);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
    ctx.strokeStyle = css(lit(tile, LIGHT.roof * 1.25));
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
    if (hash2(seed, 21, 77) > 0.7) {
      // a dormer on the slope nearest the viewer
      const dx = (a[0] + b[0]) / 2;
      const dy = (a[1] + b[1]) / 2 + rise * 0.55;
      fill(
        ctx,
        [
          [dx - 3, dy + 2],
          [dx + 3, dy + 2],
          [dx + 3, dy - 3],
          [dx, dy - 5],
          [dx - 3, dy - 3],
        ],
        css(lit(wall, LIGHT.left)),
      );
      ctx.fillStyle = css(lit(hsl(206, 24, 30), LIGHT.left * 1.2));
      ctx.fillRect(dx - 1.6, dy - 2.4, 3.2, 3);
    }
    return;
  }
  if (style === 'mansard' && roof.length === 4) {
    // a steep lower slope with dormers, then a near-flat top — the extra
    // storey a Paris or Brooklyn street gets out of its roofline
    const steep = Math.min(7.5, 3.5 + rhw * 0.15);
    const slate = mix(body, hsl(222, 8, 28), 0.66);
    const top = inset(raise(roof, steep), 0.74);
    for (let i = 0; i < 4; i++) {
      const a = roof[i];
      const b = roof[(i + 1) % 4];
      if (b[0] - a[0] >= -1e-9) continue;
      fill(
        ctx,
        [a, b, top[(i + 1) % 4], top[i]],
        css(lit(slate, wallLight(a[0], a[1], b[0], b[1]) * 1.05)),
      );
    }
    // dormer windows punched into the steep face
    const [fa, fb] = [roof[2], roof[3]];
    for (let k = 0; k < 3; k++) {
      const t = (k + 0.5) / 3;
      const px = fa[0] + (fb[0] - fa[0]) * t;
      const py = fa[1] + (fb[1] - fa[1]) * t - steep * 0.45;
      ctx.fillStyle = css(lit(slate, LIGHT.left * 1.3));
      ctx.fillRect(px - 2.6, py - 3.4, 5.2, 3.8);
      ctx.fillStyle = css(lit(hsl(206, 24, 30), LIGHT.left * 1.2));
      ctx.fillRect(px - 1.7, py - 2.8, 3.4, 2.6);
    }
    const deck = mix(body, hsl(220, 6, 34), 0.62);
    fill(ctx, top, css(lit(deck, LIGHT.roof)));
    gravelSpeckle(ctx, top, deck, seed);
    return;
  }
  if (style === 'sawtooth') {
    const teeth = 3;
    const q = (t: number, s: number): Pt => {
      const top: Pt = [
        roof[0][0] + (roof[1][0] - roof[0][0]) * t,
        roof[0][1] + (roof[1][1] - roof[0][1]) * t,
      ];
      const bot: Pt = [
        roof[3][0] + (roof[2][0] - roof[3][0]) * t,
        roof[3][1] + (roof[2][1] - roof[3][1]) * t,
      ];
      return [top[0] + (bot[0] - top[0]) * s, top[1] + (bot[1] - top[1]) * s];
    };
    const shell = mix(body, hsl(206, 6, 46), 0.55);
    for (let k = 0; k < teeth; k++) {
      const t0 = k / teeth;
      const t1 = (k + 1) / teeth;
      const a = q(t0, 0);
      const b = q(t0, 1);
      const c = q(t1, 1);
      const d = q(t1, 0);
      // the glazed north light, then the sloped deck over it
      fill(
        ctx,
        [a, b, [b[0], b[1] - 4], [a[0], a[1] - 4]],
        css(lit(hsl(198, 30, 52), LIGHT.left * 1.1)),
      );
      fill(ctx, [[a[0], a[1] - 4], [b[0], b[1] - 4], c, d], css(lit(shell, LIGHT.roof * 0.94)));
    }
    return;
  }
  if (style === 'parapet') {
    const deck = mat ? roofTone(mat) : mix(body, hsl(220, 6, 34), 0.62);
    gravelSpeckle(ctx, inset(roof, 0.86), deck, seed);
    parapet(ctx, roof, material('concrete', mix(body, hsl(210, 6, 62), 0.5)), 2.4, deck);
    return;
  }
  // 'flat' — prism() already capped it; dress the deck and add a drip edge
  gravelSpeckle(ctx, roof, mat ? roofTone(mat) : mix(body, hsl(220, 6, 34), 0.62), seed);
  ctx.strokeStyle = css(lit(body, LIGHT.roof * 1.25), 0.6);
  ctx.lineWidth = 1;
  pathOf(ctx, roof);
  ctx.stroke();
  void cx;
  void cy;
}

/**
 * What a tall building does at the top. A skyline of identical flat caps is
 * the thing that most makes a procedural city look procedural, so anything
 * over about six storeys takes one of four crowns from its seed: a setback
 * box, a stepped ziggurat, a sloped cap, or a plain machine floor.
 */
export function towerCrown(
  ctx: CanvasRenderingContext2D,
  roof: Pt[],
  mat: Material,
  body: Hsl,
  seed: number,
): Pt[] {
  const style = Math.floor(hash2(seed, 3, 517) * 4);
  if (style === 0) {
    // a single setback: one smaller box standing on the roof
    gravelSpeckle(ctx, roof, roofTone(mat), seed);
    const q = inset(roof, 0.66);
    const r = prism(ctx, q, 12, mat, { seed, windows: 'ribbon', groundAo: false });
    parapet(ctx, r.roof, material('concrete', mix(body, hsl(212, 6, 60), 0.5)), 1.6);
    return r.roof;
  }
  if (style === 1) {
    // stepped: three shrinking boxes, the classic setback skyscraper
    let top = roof;
    for (let k = 0; k < 3; k++) {
      const r = prism(ctx, inset(top, 0.76), 8 - k * 1.6, mat, {
        seed: seed + k,
        windows: 'ribbon',
        groundAo: false,
      });
      top = r.roof;
    }
    parapet(ctx, top, material('concrete', mix(body, hsl(212, 6, 62), 0.5)), 1.4);
    return top;
  }
  if (style === 2 && roof.length === 4) {
    // a shallow hipped cap in roofing, not wall colour — pulling the wall
    // material up over a steep pyramid read as a gold tent on the skyline
    const rise = 8;
    const deck = mix(roofTone(mat), hsl(214, 10, 30), 0.5);
    parapet(ctx, roof, material('concrete', mix(body, hsl(212, 6, 58), 0.5)), 1.6);
    const lifted = raise(roof, 1.6);
    const a: Pt = [(lifted[0][0] + lifted[3][0]) / 2, (lifted[0][1] + lifted[3][1]) / 2 - rise];
    const b: Pt = [(lifted[1][0] + lifted[2][0]) / 2, (lifted[1][1] + lifted[2][1]) / 2 - rise];
    fill(ctx, [lifted[1], lifted[2], b], css(lit(deck, LIGHT.right)));
    fill(ctx, [lifted[3], lifted[2], b, a], css(lit(deck, LIGHT.left)));
    fill(ctx, [lifted[0], lifted[1], b, a], css(lit(deck, LIGHT.roof)));
    ctx.strokeStyle = css(lit(deck, LIGHT.roof * 1.3));
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
    return [a, b, b, a];
  }
  // plain machine floor with a heavy cornice
  gravelSpeckle(ctx, inset(roof, 0.86), roofTone(mat), seed);
  parapet(ctx, roof, material('concrete', mix(body, hsl(210, 8, 56), 0.55)), 3);
  return roof;
}

// ---------------------------------------------------------------------------
// Plant
// ---------------------------------------------------------------------------

/** Rooftop furniture, drawn on the lifted roof quad. */
export function roofKit(
  ctx: CanvasRenderingContext2D,
  roof: Pt[],
  kinds: PropKind[],
  body: Hsl,
  seed: number,
  h: number,
  hatch = true,
): void {
  const cx = (roof[0][0] + roof[2][0]) / 2;
  const cy = (roof[1][1] + roof[3][1]) / 2;
  // measured, not read off corner indices: a quarter turn moves which corner
  // is which, and props scattered by a zeroed extent all pile on the centre
  const [hw, hh] = halfExtent(roof);
  const metal = material('metal', hsl(210, 4, 66));
  const grille = 'rgba(30, 36, 44, 0.6)';
  for (const { kind, x, y, k } of placeRoofProps(kinds, roof, seed)) {
    switch (kind) {
      case 'acUnit': {
        const q = diamond(x, y, 5, 2.5);
        prism(ctx, q, 4, metal, { seed, groundAo: false });
        ctx.fillStyle = grille;
        for (let f = -1; f <= 1; f++) ctx.fillRect(x - 3 + f * 2.4, y - 5.6, 1.2, 2.6);
        // the fan on top: a dark disc with a lit rim
        ctx.fillStyle = 'rgba(24, 28, 36, 0.7)';
        ctx.beginPath();
        ctx.ellipse(x - 0.6, y - 4.3, 2.2, 1.1, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(230, 234, 240, 0.5)';
        ctx.lineWidth = 0.6;
        ctx.stroke();
        if (hash2(k, 13, seed) > 0.5) {
          // a second, smaller unit and the duct joining them
          const x2 = x + 6.5;
          const y2 = y + 1.2;
          ctx.fillStyle = css(lit(metal.body, LIGHT.right));
          ctx.fillRect(x + 2, y - 3.2, 4.5, 1.8);
          prism(ctx, diamond(x2, y2, 3.2, 1.6), 3, metal, { seed: seed + 1, groundAo: false });
        }
        break;
      }
      case 'vent': {
        const q = diamond(x, y, 3.4, 1.7);
        prism(ctx, q, 3, metal, { seed, groundAo: false });
        // a cowl over the top
        ctx.fillStyle = css(lit(metal.body, LIGHT.roof * 1.08));
        ctx.beginPath();
        ctx.ellipse(x, y - 3.4, 3, 1.4, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'waterTower': {
        ctx.strokeStyle = css(lit(hsl(26, 20, 34), LIGHT.right));
        ctx.lineWidth = 1.2;
        for (const dx of [-3.4, -1.6, 1.6, 3.4]) {
          ctx.beginPath();
          ctx.moveTo(x + dx, y + (Math.abs(dx) < 2 ? 1.2 : 0));
          ctx.lineTo(x + dx * 0.6, y - 8);
          ctx.stroke();
        }
        const tank = hsl(30, 22, 44);
        ctx.fillStyle = 'rgba(10, 14, 26, 0.4)';
        ctx.fillRect(x - 4.6, y - 9, 9.2, 1.2);
        ctx.fillStyle = css(lit(tank, LIGHT.right));
        ctx.fillRect(x - 4.6, y - 16, 9.2, 8);
        ctx.fillStyle = css(lit(tank, LIGHT.left * 1.12));
        ctx.fillRect(x - 4.6, y - 16, 3.4, 8);
        // hoops
        ctx.fillStyle = 'rgba(10, 14, 26, 0.3)';
        for (const yy of [-14, -11]) ctx.fillRect(x - 4.6, y + yy, 9.2, 0.5);
        fill(
          ctx,
          [
            [x - 5, y - 16],
            [x + 5, y - 16],
            [x, y - 21],
          ],
          css(lit(tank, LIGHT.roof * 0.9)),
        );
        break;
      }
      case 'antenna': {
        // the original code read k post-increment; hearthTip mirrors this via hit.k + 1
        const th = 11 + hash2(k + 1, 4, seed) * 9 + h * 0.06;
        ctx.strokeStyle = 'rgba(196, 204, 214, 0.95)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y - th);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(196, 204, 214, 0.55)';
        ctx.lineWidth = 0.7;
        for (const dx of [-4, 4]) {
          ctx.beginPath();
          ctx.moveTo(x, y - th * 0.72);
          ctx.lineTo(x + dx, y);
          ctx.stroke();
        }
        ctx.fillStyle = '#ff5a4a';
        ctx.fillRect(x - 1, y - th - 2, 2, 2);
        break;
      }
      case 'chimney': {
        const q = diamond(x, y, 2.4, 1.2);
        // k post-increment, as the original inline code read it — see chimneyHeight
        const ch = chimneyHeight(k + 1, seed);
        prism(ctx, q, ch, material('brick', mix(body, hsl(14, 34, 34), 0.7)), {
          seed,
          groundAo: false,
        });
        // a cap: a lighter slab a hair wider than the stack
        ctx.fillStyle = css(lit(hsl(30, 6, 62), LIGHT.roof));
        ctx.fillRect(x - 2.9, y - ch - 1.4, 5.8, 1.4);
        break;
      }
      case 'tank': {
        const c = hsl(200, 8, 62);
        ctx.fillStyle = css(lit(c, LIGHT.right));
        ctx.beginPath();
        ctx.ellipse(x, y - 4, 5, 4.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = css(lit(c, LIGHT.roof));
        ctx.beginPath();
        ctx.ellipse(x - 1.2, y - 5.6, 3.4, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        // a ladder up the shaded side
        ctx.strokeStyle = 'rgba(30, 34, 44, 0.6)';
        ctx.lineWidth = 0.6;
        for (let yy = y - 1; yy > y - 8; yy -= 1.4) {
          ctx.beginPath();
          ctx.moveTo(x + 3.2, yy);
          ctx.lineTo(x + 4.8, yy);
          ctx.stroke();
        }
        break;
      }
      case 'helipad': {
        const pad = diamond(x, y, 7, 3.5);
        fill(ctx, pad, css(lit(hsl(220, 6, 34), LIGHT.roof)));
        ctx.strokeStyle = 'rgba(230, 214, 96, 0.9)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(x, y, 4.6, 2.3, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(230, 214, 96, 0.9)';
        ctx.fillRect(x - 2.2, y - 1.7, 1.2, 3.4);
        ctx.fillRect(x + 1, y - 1.7, 1.2, 3.4);
        ctx.fillRect(x - 1, y - 0.5, 2, 1);
        break;
      }
      case 'skylight': {
        for (let f = -1; f <= 1; f++) {
          const q = diamond(x + f * 5, y + f * 2.5, 3, 1.5);
          fill(ctx, q, 'rgba(150, 190, 220, 0.75)');
          ctx.strokeStyle = 'rgba(226, 238, 248, 0.6)';
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(x + f * 5 - 3, y + f * 2.5);
          ctx.lineTo(x + f * 5, y + f * 2.5 - 1.5);
          ctx.stroke();
        }
        break;
      }
      default:
        break;
    }
  }
  if (hatch && h > 26 && hash2(seed, 31, 5) > 0.45) {
    // a roof hatch — only where there is a deck to open onto
    prism(ctx, diamond(cx - hw * 0.3, cy - hh * 0.2, 3, 1.5), 3, metal, { seed, groundAo: false });
  }
  // a stair penthouse on anything with a real roof to reach
  if (h > 40) {
    const q = diamond(cx + hw * 0.24, cy + hh * 0.18, Math.max(5, hw * 0.24), Math.max(2.6, hh * 0.24));
    prism(ctx, q, 7, material('concrete', mix(body, hsl(216, 5, 44), 0.6)), { seed, groundAo: false });
  }
}

/**
 * A horizontal pipe run between two points: a shadow under it, a two-tone
 * cylinder, and a flange ring at each end. The works are strung together
 * with these, which is most of what says "works" rather than "shed".
 */
export function pipeRun(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, r: number, body: Hsl): void {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len < 1 || r <= 0) return;
  ctx.save();
  ctx.translate(a[0], a[1]);
  ctx.rotate(Math.atan2(dy, dx));
  ctx.fillStyle = 'rgba(20, 24, 40, 0.28)';
  ctx.fillRect(0, r * 0.4, len, r * 1.2);
  ctx.fillStyle = css(lit(body, LIGHT.right));
  ctx.fillRect(0, -r, len, r * 2);
  ctx.fillStyle = css(lit(body, LIGHT.roof * 1.05));
  ctx.fillRect(0, -r, len, r * 0.8);
  ctx.fillStyle = css(lit(body, LIGHT.roof * 0.7));
  for (const x of [0, len - r * 1.2]) ctx.fillRect(x, -r * 1.3, r * 1.2, r * 2.6);
  ctx.restore();
}
