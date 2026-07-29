import { describe, expect, test } from 'vitest';
import { zoomAbout } from '../src/render/camera';
import { clampZoom, TILE_H, TILE_W } from '../src/render/iso';
import { GRID } from '../src/sim/types';

/** Desktop-ish viewport: big enough that the 0.5 zoom floor applies. */
const VIEW_W = 1600;
const VIEW_H = 900;

/** World position sitting under a given canvas point. */
const worldUnder = (cam: { x: number; y: number; zoom: number }, px: number, py: number) => ({
  x: cam.x + px / cam.zoom,
  y: cam.y + py / cam.zoom,
});

describe('zoomAbout', () => {
  test('the world point under the anchor does not move', () => {
    const cam = { x: 100, y: 50, zoom: 1 };
    const before = worldUnder(cam, 200, 120);
    zoomAbout(cam, 2, 200, 120, VIEW_W, VIEW_H);
    const after = worldUnder(cam, 200, 120);
    expect(after.x).toBeCloseTo(before.x, 10);
    expect(after.y).toBeCloseTo(before.y, 10);
  });

  test('it holds for zooming out too, and away from the origin', () => {
    const cam = { x: -320.5, y: 940.25, zoom: 1.7 };
    const before = worldUnder(cam, 37, 811);
    zoomAbout(cam, 1 / 1.1, 37, 811, VIEW_W, VIEW_H);
    const after = worldUnder(cam, 37, 811);
    expect(after.x).toBeCloseTo(before.x, 10);
    expect(after.y).toBeCloseTo(before.y, 10);
  });

  test('a factor of 1 changes nothing', () => {
    const cam = { x: 12, y: 34, zoom: 0.8 };
    zoomAbout(cam, 1, 400, 300, VIEW_W, VIEW_H);
    expect(cam).toEqual({ x: 12, y: 34, zoom: 0.8 });
  });

  test('zoom is clamped in, and the anchor still holds at the clamp', () => {
    const cam = { x: 0, y: 0, zoom: 1 };
    const before = worldUnder(cam, 500, 250);
    zoomAbout(cam, 100, 500, 250, VIEW_W, VIEW_H);
    expect(cam.zoom).toBe(2); // the hard ceiling
    const after = worldUnder(cam, 500, 250);
    expect(after.x).toBeCloseTo(before.x, 10);
    expect(after.y).toBeCloseTo(before.y, 10);
  });

  test('zoom is clamped out to whatever clampZoom allows for the viewport', () => {
    const cam = { x: 0, y: 0, zoom: 1 };
    zoomAbout(cam, 0.0001, 500, 250, VIEW_W, VIEW_H);
    expect(cam.zoom).toBe(clampZoom(0, VIEW_W, VIEW_H));
    expect(cam.zoom).toBeGreaterThan(0);
  });

  test('a phone-shaped viewport may zoom out past the 0.5 floor, so the map still fits', () => {
    // The whole grid is GRID*TILE_W across; 390px cannot show that at 0.5.
    const phoneW = 390;
    const phoneH = 844;
    const floor = clampZoom(0, phoneW, phoneH);
    expect(floor).toBeLessThan(0.5);
    expect(floor).toBeCloseTo(Math.min(phoneW / (GRID * TILE_W), phoneH / (GRID * TILE_H)), 10);

    const cam = { x: 0, y: 0, zoom: 1 };
    zoomAbout(cam, 0.001, phoneW / 2, phoneH / 2, phoneW, phoneH);
    expect(cam.zoom).toBe(floor);
  });
});
