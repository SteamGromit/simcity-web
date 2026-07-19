import { CityState, GRID } from './types';

/** JSON can't hold Infinity; commute uses −1 on the wire. */
export function serialize(city: CityState): string {
  return JSON.stringify(city, (key, value) =>
    key === 'commute' && value === Infinity ? -1 : value,
  );
}

export function deserialize(json: string): CityState | null {
  try {
    const data = JSON.parse(json);
    if (!data || data.version !== 1) return null;
    if (!Array.isArray(data.tiles) || data.tiles.length !== GRID * GRID) return null;
    for (const t of data.tiles) {
      if (t.commute === -1) t.commute = Infinity;
    }
    return data as CityState;
  } catch {
    return null;
  }
}
