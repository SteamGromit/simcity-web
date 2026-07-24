import { beforeEach, describe, expect, test } from 'vitest';
import { createModStore, type StorageLike } from '../src/ui/modstore';
import { resetRegistry } from '../src/content/registry';
import { ensureCoreContent, modifier } from '../src/sim/content';
import { newCity } from '../src/sim/city';
import { collectBudget } from '../src/sim/budget';

function fakeStorage(): StorageLike {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

describe('an authored ordinance affects the sim', () => {
  beforeEach(() => {
    resetRegistry();
    ensureCoreContent();
  });

  test('modifier() reflects the authored multiplier, budget charges its cost', () => {
    const store = createModStore(fakeStorage());
    const m = store.create('Eco');
    store.addOrdinance(m.pack.id, {
      label: 'Carbon Tax',
      blurb: 'x',
      cost: 50,
      effects: [{ key: 'pollution.industry', value: 0.5 }],
    });

    const city = newCity(1);
    expect(modifier(city, 'pollution.industry')).toBe(1);

    const before = collectBudget({ ...city }).expenses;
    city.ordinances['eco:carbon-tax'] = true;
    expect(modifier(city, 'pollution.industry')).toBe(0.5);
    const after = collectBudget({ ...city }).expenses;
    expect(after - before).toBe(50);
  });
});
