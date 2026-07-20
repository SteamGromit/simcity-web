/** One full day-night cycle in wall-clock milliseconds. Purely visual —
 * the ambience keeps rolling even while the sim is paused, like the
 * automata. */
export const DAY_CYCLE_MS = 90_000;

/** 0 at high noon, 1 at midnight, smooth in between with longer days. */
export function nightFactor(timeMs: number): number {
  const phase = ((timeMs % DAY_CYCLE_MS) + DAY_CYCLE_MS) % DAY_CYCLE_MS;
  const raw = 0.5 - 0.5 * Math.cos((2 * Math.PI * phase) / DAY_CYCLE_MS);
  return Math.pow(raw, 1.4);
}

/** Fullscreen night wash drawn over the world (screen space). */
export function nightTint(f: number): string {
  return `rgba(13, 17, 46, ${(0.42 * f).toFixed(3)})`;
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
