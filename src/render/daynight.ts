/** One full day-night cycle in wall-clock milliseconds. Purely visual —
 * the ambience keeps rolling even while the sim is paused, like the
 * automata. */
export const DAY_CYCLE_MS = 90_000;

/** Debug hook: `localStorage.simcity.nightlock = "0.9"` pins the clock
 * (used by automated screenshots); absent in normal play. */
const store = typeof localStorage !== 'undefined' ? localStorage : null;
const lockRaw = store?.getItem('simcity.nightlock');
const nightLock = lockRaw !== null && lockRaw !== undefined ? parseFloat(lockRaw) : null;

/** 0 at high noon, 1 at midnight, smooth in between with longer days. */
export function nightFactor(timeMs: number): number {
  if (nightLock !== null && Number.isFinite(nightLock)) return nightLock;
  const phase = ((timeMs % DAY_CYCLE_MS) + DAY_CYCLE_MS) % DAY_CYCLE_MS;
  const raw = 0.5 - 0.5 * Math.cos((2 * Math.PI * phase) / DAY_CYCLE_MS);
  return Math.pow(raw, 1.4);
}

/** Dim ambient wash over everything at night — lit areas keep only
 * this; the darkness layer stacks on top of the unlit wilds.
 *
 * Deep enough that a downtown at midnight reads as *lit against the dark*
 * rather than as daytime with the lights switched on: the window glow is
 * additive, so if the wash under it is weak the whole city just goes pale. */
export function nightTint(f: number): string {
  return `rgba(10, 14, 40, ${(0.58 * f).toFixed(3)})`;
}

/** The deep-night darkness that light sources punch through. */
export function darknessAlpha(f: number): number {
  return Math.min(0.84, 0.86 * f);
}

/** Whether the night additions — pools, glow, reflections' wash — run this
 * frame. Everything night-only asks this, so a day frame is untouched. */
export function nightActive(f: number): boolean {
  return f > 0.02;
}

/** Player toggle for the visual cycle: off means permanent daylight.
 * Defaults off — the player opts in via the Display panel. */
let enabled = false;

export function setDayNight(on: boolean): void {
  enabled = on;
}

export function getDayNight(): boolean {
  return enabled;
}

/**
 * Where the render clock stands in its day, 0..1: 0 at noon, 0.5 at
 * midnight, 0.75 at dawn. Noon when the day-night cycle is off, so the
 * automata's commuter waves hold at midday rather than at midnight.
 */
export function dayPhase(timeMs: number): number {
  if (!enabled) return 0;
  return ((timeMs % DAY_CYCLE_MS) + DAY_CYCLE_MS) % DAY_CYCLE_MS / DAY_CYCLE_MS;
}

export type DayBand = 'morning' | 'midday' | 'evening' | 'night';

/**
 * The hour band of a day phase (0 noon, 0.5 midnight), as the traffic and
 * the crowds read it: the morning commute runs up to late morning, the
 * evening one from mid-afternoon, and the small hours are night.
 */
export function dayBand(ph: number): DayBand {
  if (ph >= 0.6 && ph < 0.95) return 'morning';
  if (ph >= 0.15 && ph < 0.4) return 'evening';
  if (ph >= 0.4 && ph < 0.6) return 'night';
  return 'midday';
}
