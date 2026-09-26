import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { causticSprite, paintWater } from '../src/render/ground';
import { shorelineLots } from '../src/render/reflections';
import { tileGeom } from '../src/render/iso';
import { clearSprites, setCanvasFactory, spriteStats } from '../src/render/spritecache';
import { Terrain, Zone } from '../src/sim/types';
import { idx } from '../src/sim/grid';
import { makeCity, zone } from './helpers';
import { strictCtx, stubCanvasFactory } from './stubctx';

describe('water', () => {
  beforeEach(() => {
    setCanvasFactory(stubCanvasFactory().factory);
    clearSprites();
  });
  afterEach(() => setCanvasFactory(null));
  test('eight caustic frames, each its own sprite', () => {
    for (let f = 0; f < 8; f++) causticSprite(f);
    expect(spriteStats().count).toBe(8);
  });
  test('paintWater at the map corner never reads out of bounds and blits two sprites', () => {
    const { ctx, trace } = strictCtx();
    expect(() => paintWater(ctx, tileGeom(0, 0, 0), 0, 0, 0, 1234, 1)).not.toThrow();
    expect(trace.filter((t) => t.startsWith('drawImage')).length).toBe(2);
  });
});

describe('shorelineLots', () => {
  test('finds a lot with water on a screen-near side, and only those', () => {
    const city = makeCity();
    zone(city, 10, 10, Zone.Residential, 2);
    city.tiles[idx(10, 11)].terrain = Terrain.Water; // grid +y: screen-near at quarter 0
    zone(city, 20, 20, Zone.Residential, 2);
    city.tiles[idx(20, 19)].terrain = Terrain.Water; // grid −y: the far side at quarter 0
    const at0 = shorelineLots(city, 0).map((s) => s.i);
    expect(at0).toContain(idx(10, 10));
    expect(at0).not.toContain(idx(20, 20));
    const at2 = shorelineLots(city, 2).map((s) => s.i);
    expect(at2).toContain(idx(20, 20));
    expect(at2).not.toContain(idx(10, 10));
  });
  test('a one-tile pond in the corner does not crash', () => {
    const city = makeCity();
    city.tiles[idx(0, 0)].terrain = Terrain.Water;
    zone(city, 1, 0, Zone.Residential, 2);
    expect(() => shorelineLots(city, 1)).not.toThrow();
    expect(() => shorelineLots(city, 3)).not.toThrow();
  });
});
