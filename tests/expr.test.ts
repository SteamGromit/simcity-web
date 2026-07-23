import { describe, expect, test } from 'vitest';
import { compile } from '../src/content/expr';

const KEYS = ['population', 'funds', 'eduLevel'] as const;

/** Compile-and-run helper; throws if compilation failed. */
function run(src: string, ctx: Record<string, number> = {}): number {
  const r = compile(src, KEYS);
  if (!r.ok) throw new Error(r.error);
  return r.expr.eval(ctx);
}

describe('expression language', () => {
  test('evaluates arithmetic with correct precedence', () => {
    expect(run('2 + 3 * 4')).toBe(14);
    expect(run('(2 + 3) * 4')).toBe(20);
    expect(run('10 - 2 - 3')).toBe(5); // left associative
  });

  test('reads identifiers from the context', () => {
    expect(run('population', { population: 2000 })).toBe(2000);
    expect(run('population / 2', { population: 2000 })).toBe(1000);
  });

  test('comparisons and logic yield 0 or 1', () => {
    expect(run('population >= 2000', { population: 2000 })).toBe(1);
    expect(run('population >= 2000', { population: 1999 })).toBe(0);
    expect(run('population >= 2000 && eduLevel > 0.5', { population: 5000, eduLevel: 0.6 })).toBe(1);
    expect(run('population >= 2000 && eduLevel > 0.5', { population: 5000, eduLevel: 0.4 })).toBe(0);
    expect(run('population > 10 || funds > 10', { population: 0, funds: 50 })).toBe(1);
  });

  test('unary minus and not', () => {
    expect(run('-5 + 8')).toBe(3);
    expect(run('!0')).toBe(1);
    expect(run('!7')).toBe(0);
  });

  test('a missing context key reads as 0', () => {
    expect(run('population', {})).toBe(0);
  });

  test('division and modulo by zero yield 0, never NaN or Infinity', () => {
    expect(run('5 / 0')).toBe(0);
    expect(run('5 % 0')).toBe(0);
  });

  test('rejects an identifier outside the allowed list', () => {
    const r = compile('populaton >= 10', KEYS);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('populaton');
  });

  test('rejects malformed input without throwing', () => {
    for (const bad of ['2 +', '(2 + 3', ')', '2 3', '', '$$']) {
      const r = compile(bad, KEYS);
      expect(r.ok).toBe(false);
    }
  });

  test('rejects function-call and assignment syntax', () => {
    expect(compile('alert(1)', KEYS).ok).toBe(false);
    expect(compile('population = 5', KEYS).ok).toBe(false);
  });
});
