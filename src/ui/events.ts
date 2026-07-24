/** Pure per-tick event detection: diff the city against a snapshot and
 * name the cues to play. No audio, no DOM — main.ts feeds the result
 * to sound.playEvent. */

import { CityState } from '../sim/types';
import type { EventId } from './sound';

export interface EventSnapshot {
  tornado: boolean;
  hurricane: boolean;
  pandemic: boolean;
  burning: number;
  brownouts: number;
  noticeCount: number;
}

function burningCount(city: CityState): number {
  let n = 0;
  for (const t of city.tiles) if (t.burning > 0) n++;
  return n;
}

export function freshSnapshot(city: CityState): EventSnapshot {
  return {
    tornado: city.disasters.tornado !== null,
    hurricane: city.disasters.hurricaneTicks > 0,
    pandemic: city.disasters.pandemicMonths > 0,
    burning: burningCount(city),
    brownouts: city.brownouts,
    noticeCount: city.notices.length,
  };
}

const LOSS_RE = /burned to the ground|flattened|wrecked/;
const CRIME_RE = /burglar|vandal|robber|theft/i;

export function detectEvents(
  prev: EventSnapshot,
  city: CityState,
): { events: EventId[]; next: EventSnapshot } {
  const next = freshSnapshot(city);
  const events: EventId[] = [];
  if (next.tornado && !prev.tornado) events.push('tornado');
  if (next.hurricane && !prev.hurricane) events.push('hurricane');
  if (next.pandemic && !prev.pandemic) events.push('pandemic');
  if (next.burning > prev.burning) events.push('fire-start');
  if (next.brownouts > 0 && prev.brownouts === 0) events.push('brownout');
  if (next.noticeCount > prev.noticeCount) {
    const fresh = city.notices.slice(prev.noticeCount);
    if (fresh.some((n) => LOSS_RE.test(n))) events.push('building-lost');
    if (fresh.some((n) => CRIME_RE.test(n))) events.push('crime');
  }
  return { events, next };
}
