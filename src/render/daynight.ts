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
