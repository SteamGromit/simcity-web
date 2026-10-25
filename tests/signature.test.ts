import { describe, expect, test } from 'vitest';
import { idx } from '../src/sim/grid';
import { Zone } from '../src/sim/types';
import { pickSignatures, SIGNATURE_ORDER, signatureAllows, signatureHeight } from '../src/render/signature';
import { makeCity, road, zone } from './helpers';

/** A town with several candidates for every kind. */
function town() {
  const city = makeCity();
  road(city, 5, 10, 60, 10);
  road(city, 5, 20, 60, 20);
  road(city, 5, 30, 60, 30);
  road(city, 10, 5, 10, 35); // a cross street, so (11, 9) and friends are corners
  for (let x = 11; x <= 20; x++) zone(city, x, 11, Zone.Residential, 2, 1); // churches
  for (let x = 21; x <= 30; x++) zone(city, x, 11, Zone.Residential, 3, 3); // mansions
  for (let x = 11; x <= 20; x++) zone(city, x, 9, Zone.Commercial, 1, 2); // pubs (11,9 is a corner)
  for (let x = 21; x <= 30; x++) zone(city, x, 9, Zone.Commercial, 3, 2); // clock
  for (let x = 31; x <= 40; x++) zone(city, x, 9, Zone.Commercial, 5, 2); // store
  for (let x = 11; x <= 20; x++) zone(city, x, 21, Zone.Industrial, 2, 'dirty'); // gasholder
  for (let x = 21; x <= 30; x++) zone(city, x, 21, Zone.Industrial, 1, 'ag'); // silos
  for (let x = 31; x <= 40; x++) zone(city, x, 21, Zone.Industrial, 3, 'manu'); // chimney
  for (const t of city.tiles) if (t.stage > 0) t.grew = 24;
  return city;
}
const corner = (i: number) => i === idx(11, 9) || i === idx(11, 11);

describe('signatures', () => {
  test('one lot per kind, every kind placed, stable across calls', () => {
    const city = town();
    const a = pickSignatures(city, 7, corner);
    const b = pickSignatures(city, 7, corner);
    expect([...a.entries()]).toEqual([...b.entries()]);
    const kinds = [...a.values()];
    expect(kinds.sort()).toEqual([...SIGNATURE_ORDER].sort());
    expect(new Set(kinds).size).toBe(SIGNATURE_ORDER.length);
    for (const [i, kind] of a) expect(signatureAllows(kind, city.tiles[i], corner(i))).toBe(true);
    // the pub needs the corner, and there is only one commercial corner
    const pub = [...a.entries()].find(([, k]) => k === 'pub')!;
    expect(pub[0]).toBe(idx(11, 9));
  });

  test('another seed picks differently; a lot that loses its condition is dropped at the next pick', () => {
    const city = town();
    const a = pickSignatures(city, 7, corner);
    const b = pickSignatures(city, 8, corner);
    expect([...a.keys()].some((k) => !b.has(k))).toBe(true);
    const church = [...a.entries()].find(([, k]) => k === 'church')![0];
    city.tiles[church].stage = 1;
    const c = pickSignatures(city, 7, corner);
    expect(c.get(church)).toBeUndefined();
    expect([...c.values()]).toContain('church');
  });

  test('the conditions', () => {
    const city = town();
    const t = (x: number, y: number) => city.tiles[idx(x, y)];
    expect(signatureAllows('church', t(12, 11), false)).toBe(true);
    expect(signatureAllows('church', t(22, 11), false)).toBe(false); // tier 3
    expect(signatureAllows('mansion', t(22, 11), false)).toBe(true);
    expect(signatureAllows('pub', t(12, 9), false)).toBe(false);
    expect(signatureAllows('pub', t(12, 9), true)).toBe(true);
    expect(signatureAllows('clock', t(22, 9), false)).toBe(true);
    expect(signatureAllows('store', t(32, 9), false)).toBe(true);
    expect(signatureAllows('gasholder', t(12, 21), false)).toBe(true);
    expect(signatureAllows('silos', t(22, 21), false)).toBe(true);
    expect(signatureAllows('chimney', t(32, 21), false)).toBe(true);
    expect(signatureAllows('chimney', t(22, 21), false)).toBe(false); // a farm
    t(12, 11).abandoned = true;
    expect(signatureAllows('church', t(12, 11), false)).toBe(false);
    t(13, 11).grew = 0; // still a building site
    expect(signatureAllows('church', t(13, 11), false)).toBe(false);
    for (const k of SIGNATURE_ORDER) expect(signatureHeight(k)).toBeGreaterThan(20);
  });
});
