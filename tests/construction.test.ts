import { describe, expect, test } from 'vitest';
import { buildStateFor } from '../src/render/construction';

describe('buildStateFor', () => {
  test('a frame for a fresh house, a concrete frame for a fresh block, nothing once the months pass', () => {
    expect(buildStateFor(1, 0)).toBe(1);
    expect(buildStateFor(2, 2)).toBe(1);
    expect(buildStateFor(2, 3)).toBe(0);
    expect(buildStateFor(3, 4)).toBe(2);
    expect(buildStateFor(3, 5)).toBe(0);
    expect(buildStateFor(7, 0)).toBe(2);
    expect(buildStateFor(0, 0)).toBe(0);
    expect(buildStateFor(5, 24)).toBe(0);
  });
});
