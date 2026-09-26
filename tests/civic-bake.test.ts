import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { drawBuilding } from '../src/render/buildings';
import { setViewAngle, tileGeom } from '../src/render/iso';
import { clearSprites, setCanvasFactory, spriteStats } from '../src/render/spritecache';
import { ensureCoreContent } from '../src/sim/content';
import { Zone } from '../src/sim/types';
import { strictCtx, stubCanvasFactory } from './stubctx';

const CIVIC = [
  Zone.FireStation,
  Zone.PoliceStation,
  Zone.Hospital,
  Zone.School,
  Zone.Prison,
  Zone.BusStop,
  Zone.StreetcarStop,
  Zone.MonorailStation,
  Zone.SubwayStation,
  Zone.RailTerminal,
  Zone.RecyclingCentre,
  Zone.Incinerator,
  Zone.WaterPump,
  Zone.PowerPlant,
  Zone.SolarPlant,
  Zone.HydroPlant,
  Zone.NuclearPlant,
  Zone.WindTurbine,
];

describe('civic bake', () => {
  beforeEach(() => {
    ensureCoreContent();
    setCanvasFactory(stubCanvasFactory().factory);
    clearSprites();
  });
  afterEach(() => {
    setCanvasFactory(null);
    setViewAngle(0);
  });
  test('a civic building bakes once and blits after', () => {
    const { ctx, trace } = strictCtx();
    const before = spriteStats().bakes;
    drawBuilding(ctx, tileGeom(4, 4, 0), Zone.FireStation, 0, 2, false, true, 0.5, 0, 1);
    drawBuilding(ctx, tileGeom(4, 4, 0), Zone.FireStation, 0, 2, false, true, 0.5, 0, 1);
    expect(spriteStats().bakes - before).toBe(1);
    expect(trace.filter((t) => t.startsWith('drawImage')).length).toBe(2);
  });
  test('losing power changes the sprite', () => {
    const { ctx } = strictCtx();
    const before = spriteStats().bakes;
    drawBuilding(ctx, tileGeom(4, 4, 0), Zone.PoliceStation, 0, 2, false, true, 0.5, 0, 1);
    drawBuilding(ctx, tileGeom(4, 4, 0), Zone.PoliceStation, 0, 2, false, false, 0.5, 0, 1);
    expect(spriteStats().bakes - before).toBe(2);
  });
  test('at night a powered civic building adds a glow blit under lighter', () => {
    const { ctx, trace } = strictCtx();
    drawBuilding(ctx, tileGeom(4, 4, 0), Zone.Hospital, 0, 2, false, true, 0.5, 0.9, 1);
    expect(trace.some((t) => t === 'globalCompositeOperation=lighter')).toBe(true);
    expect(trace.filter((t) => t.startsWith('drawImage')).length).toBe(2);
  });
  test('a park bakes per season', () => {
    const { ctx } = strictCtx();
    const before = spriteStats().bakes;
    drawBuilding(ctx, tileGeom(4, 4, 0), Zone.Park, 0, 2, false, true, 0.3, 0, 1, 1, 'summer');
    drawBuilding(ctx, tileGeom(4, 4, 0), Zone.Park, 0, 2, false, true, 0.3, 0, 1, 1, 'summer');
    const summer = spriteStats().bakes - before;
    drawBuilding(ctx, tileGeom(4, 4, 0), Zone.Park, 0, 2, false, true, 0.3, 0, 1, 1, 'winter');
    expect(spriteStats().bakes - before).toBeGreaterThan(summer);
    expect(summer).toBeGreaterThanOrEqual(1);
  });
  test('every civic zone bakes at every quarter without a negative radius', () => {
    for (const q of [0, 1, 2, 3]) {
      setViewAngle((q * Math.PI) / 2);
      for (const z of CIVIC) {
        clearSprites();
        expect(() =>
          drawBuilding(strictCtx().ctx, tileGeom(4, 4, 0), z, 0, 2, false, true, 0.5, 0.5, 2),
        ).not.toThrow();
      }
    }
  });
});
