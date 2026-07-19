import { describe, expect, test } from 'vitest';
import { HISTORY_MAX } from '../src/sim/types';
import { mulberry32, newCity, simTick } from '../src/sim/city';
import { deserialize, serialize } from '../src/sim/save';

describe('monthly history', () => {
  test('one sample per month, population and funds', () => {
    const city = newCity(1);
    const rand = mulberry32(1);
    for (let i = 0; i < 8 * 5; i++) simTick(city, rand); // 5 months
    expect(city.history.pop).toHaveLength(5);
    expect(city.history.funds).toHaveLength(5);
    expect(city.history.funds[4]).toBe(city.funds);
  });

  test('history is capped', () => {
    const city = newCity(1);
    city.history.pop = Array(HISTORY_MAX).fill(0);
    city.history.funds = Array(HISTORY_MAX).fill(0);
    const rand = mulberry32(1);
    for (let i = 0; i < 8; i++) simTick(city, rand);
    expect(city.history.pop).toHaveLength(HISTORY_MAX);
    expect(city.history.funds).toHaveLength(HISTORY_MAX);
  });

  test('an oversized saved history is capped on revive', () => {
    const city = newCity(1);
    const mangled = JSON.parse(serialize(city));
    mangled.history = {
      pop: Array(HISTORY_MAX * 10).fill(1),
      funds: Array(HISTORY_MAX * 10).fill(2),
    };
    const revived = deserialize(JSON.stringify(mangled));
    expect(revived!.history.pop).toHaveLength(HISTORY_MAX);
    expect(revived!.history.funds).toHaveLength(HISTORY_MAX);
  });

  test('history round-trips through saves; junk history degrades to empty', () => {
    const city = newCity(1);
    const rand = mulberry32(1);
    for (let i = 0; i < 16; i++) simTick(city, rand);
    expect(deserialize(serialize(city))).toEqual(city);
    const junk = JSON.parse(serialize(city));
    junk.history = 'nope';
    expect(deserialize(JSON.stringify(junk))!.history).toEqual({ pop: [], funds: [] });
  });
});
