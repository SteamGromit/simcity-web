import { describe, expect, it } from 'vitest';
import { EVENT_SOUNDS, EventId } from '../src/ui/sound';
import { detectEvents, freshSnapshot } from '../src/ui/events';
import { clearLand, makeCity } from './helpers';

describe('EVENT_SOUNDS catalog', () => {
  it('every event has ascending steps with sane volumes and durations', () => {
    for (const id of Object.keys(EVENT_SOUNDS) as EventId[]) {
      const steps = EVENT_SOUNDS[id];
      expect(steps.length).toBeGreaterThan(0);
      let last = -1;
      for (const s of steps) {
        expect(s.at).toBeGreaterThanOrEqual(last);
        last = s.at;
        expect(s.spec.dur).toBeGreaterThan(0);
        expect(s.spec.vol).toBeGreaterThan(0);
        expect(s.spec.vol).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('detectEvents', () => {
  it('fires each disaster cue once on activation, not while it runs', () => {
    const city = makeCity();
    let snap = freshSnapshot(city);
    city.disasters.tornado = { x: 5, y: 5, ticksLeft: 40 };
    let r = detectEvents(snap, city);
    expect(r.events).toContain('tornado');
    snap = r.next;
    r = detectEvents(snap, city); // still active
    expect(r.events).not.toContain('tornado');
  });

  it('rising burning count fires fire-start; steady does not', () => {
    const city = makeCity();
    clearLand(city);
    let snap = freshSnapshot(city);
    city.tiles[0].burning = 10;
    let r = detectEvents(snap, city);
    expect(r.events).toContain('fire-start');
    snap = r.next;
    r = detectEvents(snap, city);
    expect(r.events).not.toContain('fire-start');
  });

  it('a burned-down notice fires building-lost', () => {
    const city = makeCity();
    let snap = freshSnapshot(city);
    city.notices.push('The building at (34, 30) burned to the ground.');
    const r = detectEvents(snap, city);
    expect(r.events).toContain('building-lost');
  });

  it('brownouts going positive fires brownout once', () => {
    const city = makeCity();
    let snap = freshSnapshot(city);
    city.brownouts = 12;
    let r = detectEvents(snap, city);
    expect(r.events).toContain('brownout');
    snap = r.next;
    city.brownouts = 20; // still browned out — no new cue
    r = detectEvents(snap, city);
    expect(r.events).not.toContain('brownout');
  });

  it('the pumps hitting capacity sounds the same cue, once', () => {
    const city = makeCity();
    let snap = freshSnapshot(city);
    city.dryouts = 5;
    let r = detectEvents(snap, city);
    expect(r.events).toContain('brownout');
    snap = r.next;
    city.dryouts = 9;
    r = detectEvents(snap, city);
    expect(r.events).not.toContain('brownout');
  });

  it('hurricane and pandemic map to their cues', () => {
    const city = makeCity();
    const snap = freshSnapshot(city);
    city.disasters.hurricaneTicks = 100;
    city.disasters.pandemicMonths = 4;
    const r = detectEvents(snap, city);
    expect(r.events).toContain('hurricane');
    expect(r.events).toContain('pandemic');
  });
});
