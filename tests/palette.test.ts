import { describe, expect, test } from 'vitest';
import { ENV, SWATCHES, css, hsl, lit, material, materialOf, mix, swatch, swatchIds } from '../src/render/palette';
import { LIGHT } from '../src/render/sun';

const parse = (s: string) => {
  const m = /^hsl\(([-\d.]+) ([\d.]+)% ([\d.]+)%( \/ ([\d.]+))?\)$/.exec(s);
  if (!m) throw new Error(`unparseable colour: ${s}`);
  return { h: +m[1], s: +m[2], l: +m[3], a: m[5] === undefined ? 1 : +m[5] };
};

describe('css', () => {
  test('wraps hue and clamps saturation and lightness into range', () => {
    expect(parse(css(hsl(400, 120, 130))).h).toBe(40);
    expect(parse(css(hsl(-30, 50, 50))).h).toBe(330);
    expect(parse(css(hsl(0, -20, 200)))).toMatchObject({ s: 0, l: 100 });
  });

  test('carries alpha only when it is asked for', () => {
    expect(css(hsl(120, 50, 50))).not.toContain('/');
    expect(parse(css(hsl(120, 50, 50), 0.5)).a).toBe(0.5);
  });
});

describe('lit', () => {
  test('a brighter level makes a lighter colour, a dimmer one darker', () => {
    const base = hsl(210, 40, 50);
    expect(lit(base, LIGHT.roof).l).toBeGreaterThan(base.l);
    expect(lit(base, LIGHT.right).l).toBeLessThan(base.l);
  });

  test('the sunlit face of a box outranks the shaded one for any colour', () => {
    for (const h of [0, 60, 120, 200, 280, 340]) {
      const c = hsl(h, 45, 45);
      expect(lit(c, LIGHT.left).l).toBeGreaterThan(lit(c, LIGHT.right).l);
    }
  });

  test('highlights desaturate toward white while shadows keep their colour', () => {
    // this is what makes a lit surface read as lit rather than merely paler
    const c = hsl(30, 60, 50);
    expect(lit(c, 0.6).s).toBeGreaterThan(lit(c, 1.3).s);
  });

  test('never produces an unrenderable colour, at any level', () => {
    for (const level of [0, 0.2, 0.6, 1, 1.4, 3]) {
      for (const h of [0, 120, 240]) {
        const out = lit(hsl(h, 80, 50), level);
        expect(out.l).toBeGreaterThanOrEqual(0);
        expect(out.l).toBeLessThanOrEqual(100);
        expect(out.s).toBeGreaterThanOrEqual(0);
        expect(out.s).toBeLessThanOrEqual(100);
        expect(Number.isFinite(out.h)).toBe(true);
      }
    }
  });

  test('a level of 1 leaves the colour where it was', () => {
    const c = hsl(200, 40, 45);
    const out = lit(c, 1);
    expect(out.h).toBeCloseTo(c.h, 6);
    expect(out.s).toBeCloseTo(c.s, 6);
    expect(out.l).toBeCloseTo(c.l, 6);
  });
});

describe('mix', () => {
  test('the ends are the inputs', () => {
    const a = hsl(10, 20, 30);
    const b = hsl(200, 60, 70);
    expect(mix(a, b, 0)).toMatchObject({ s: 20, l: 30 });
    expect(mix(a, b, 1)).toMatchObject({ s: 60, l: 70 });
  });

  test('hue takes the short way round the wheel', () => {
    // 350 → 10 should pass through 0, not walk all the way down through 180
    const m = mix(hsl(350, 50, 50), hsl(10, 50, 50), 0.5);
    expect(((m.h % 360) + 360) % 360).toBeCloseTo(0, 6);
  });
});

describe('materials', () => {
  test('every kind produces trim lighter than its body, so detail reads', () => {
    const kinds = ['brick', 'render', 'concrete', 'glass', 'metal', 'timber', 'stone'] as const;
    for (const kind of kinds) {
      const m = material(kind, hsl(210, 30, 40));
      expect(m.trim.l).toBeGreaterThan(m.body.l);
      expect(m.grain).toBeGreaterThanOrEqual(0);
      expect(m.grain).toBeLessThanOrEqual(1);
      expect(m.sheen).toBeGreaterThanOrEqual(0);
      expect(m.sheen).toBeLessThanOrEqual(1);
    }
  });

  test('glass is the reflective one and brick the roughest', () => {
    const body = hsl(210, 30, 40);
    expect(material('glass', body).sheen).toBeGreaterThan(material('brick', body).sheen);
    expect(material('brick', body).grain).toBeGreaterThan(material('glass', body).grain);
  });

  test('the material keeps the body colour it was given', () => {
    const body = hsl(24, 44, 38);
    expect(material('brick', body).body).toBe(body);
  });
});

describe('the environment palette', () => {
  test('water reads deeper the further from shore', () => {
    expect(ENV.waterDeep.l).toBeLessThan(ENV.waterShallow.l);
  });

  test('cast shadows are blue-violet, never neutral grey', () => {
    // a grey shadow on green grass reads as dirt; a blue one reads as shade
    expect(ENV.shadow.s).toBeGreaterThan(20);
    expect(ENV.shadow.h).toBeGreaterThan(200);
    expect(ENV.shadow.h).toBeLessThan(280);
  });

  test('the sky is lighter at the horizon than overhead', () => {
    expect(ENV.skyHorizon.l).toBeGreaterThan(ENV.skyTop.l);
  });
});

describe('swatch library', () => {
  test('every family has at least three swatches', () => {
    for (const fam of ['brick', 'stone', 'render', 'siding', 'concrete', 'glass', 'metal'] as const) {
      expect(swatchIds(fam).length).toBeGreaterThanOrEqual(3);
    }
  });
  test('bodies stay under their saturation cap', () => {
    for (const sw of Object.values(SWATCHES)) {
      expect(sw.body.s).toBeLessThanOrEqual(sw.satCap);
      if (!['brick-red', 'siding-barn', 'metal-corten'].includes(sw.id)) expect(sw.satCap).toBe(28);
    }
  });
  test('unknown id throws', () => {
    expect(() => swatch('nope')).toThrow();
  });
  test('trim and glass follow a remapped body, roof follows the swatch', () => {
    const sw = swatch('render-cream');
    const remapped = hsl(300, 20, 40); // a Springfield-style hue wrap
    const m = materialOf(sw, remapped);
    expect(m.body).toEqual(remapped);
    expect(Math.abs(m.trim.h - remapped.h)).toBeLessThan(30);
    expect(m.trim.l).toBeGreaterThan(remapped.l);
    expect(m.roof).toEqual(sw.roof);
    expect(m.kind).toBe(sw.kind);
  });
  test('lit keeps sunlit warmer than shade and narrows the swing', () => {
    const c = hsl(30, 20, 50);
    const sun = lit(c, 1.1);
    const shade = lit(c, 0.64);
    expect(sun.l).toBeGreaterThan(shade.l);
    expect(sun.l - shade.l).toBeLessThan(30);
    expect(shade.h).toBeGreaterThan(c.h); // cools toward blue (hue rises from 30)
  });
});
