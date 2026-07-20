import { describe, expect, test } from 'vitest';
import { channels } from '../src/render/archetypes';

describe('channels', () => {
  test('same variant yields the same stream', () => {
    const a = channels(0.375);
    const b = channels(0.375);
    for (let i = 0; i < 8; i++) expect(a()).toBe(b());
  });

  test('different variants diverge', () => {
    const a = channels(0.2);
    const b = channels(0.8);
    expect([a(), a(), a()]).not.toEqual([b(), b(), b()]);
  });

  test('values stay in [0, 1)', () => {
    for (const seed of [0, 0.001, 0.5, 0.9999]) {
      const c = channels(seed);
      for (let i = 0; i < 100; i++) {
        const v = c();
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    }
  });
});
