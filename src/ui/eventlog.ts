/**
 * The event log: one running feed for everything the city has to say.
 *
 * It replaces the two windows that used to pop up over the map — the centre
 * toast and the bottom-left advisor strip. Both appeared unbidden, at fixed
 * places, and a busy month could put one right where you were building. This
 * is a single strip the player positions once and then reads at a glance.
 *
 * Two shapes, because the two habits are genuinely different: a **ticker**
 * runs the feed sideways along one line and stays out of the way, and a
 * **log** stacks it vertically, newest at the top, for when you actually want
 * to catch up. Position, shape, and size all persist.
 */

import { makeDraggable } from './drag';

export type EventKind = 'info' | 'alert' | 'error' | 'advisor';

export type LogMode = 'ticker' | 'log';

export interface LogEntry {
  text: string;
  kind: EventKind;
  /** Month label the entry happened in, e.g. "Mar 2014". */
  when: string;
}

const MODE_KEY = 'simcity.eventlog.mode';
/** Entries kept in memory; the ticker shows the tail of these. */
const MAX_ENTRIES = 60;
/** Entries the ticker cycles through before repeating. */
const TICKER_ENTRIES = 8;
/** How fast the ticker crawls, in CSS pixels per second. */
const TICKER_SPEED = 55;

export function isLogMode(raw: unknown): raw is LogMode {
  return raw === 'ticker' || raw === 'log';
}

/**
 * Fold a run of identical messages into one line with a counter, so a month
 * that throws nine burglaries doesn't push everything else off the strip.
 * Newest first — the order the log renders in.
 */
export function collapseRuns(entries: LogEntry[]): { entry: LogEntry; count: number }[] {
  const out: { entry: LogEntry; count: number }[] = [];
  for (const e of entries) {
    const last = out[out.length - 1];
    if (last && last.entry.text === e.text) last.count++;
    else out.push({ entry: e, count: 1 });
  }
  return out;
}

export function buildEventLog(root: HTMLElement) {
  const el = document.createElement('div');
  el.id = 'event-log';
  el.className = 'panel';

  const grip = document.createElement('div');
  grip.className = 'drag-grip';
  const title = document.createElement('span');
  title.textContent = '⠿ Events';

  const modeBtns = document.createElement('span');
  modeBtns.className = 'log-modes';
  const tickerBtn = document.createElement('button');
  tickerBtn.className = 'detach';
  tickerBtn.textContent = '⇄';
  tickerBtn.title = 'Ticker: one line, running sideways';
  const logBtn = document.createElement('button');
  logBtn.className = 'detach';
  logBtn.textContent = '⇅';
  logBtn.title = 'Log: newest at the top';
  modeBtns.append(tickerBtn, logBtn);
  grip.append(title, modeBtns);

  const body = document.createElement('div');
  body.className = 'log-body';
  const track = document.createElement('div');
  track.className = 'log-track';
  body.appendChild(track);

  el.append(grip, body);
  root.appendChild(el);
  makeDraggable(el, grip, 'eventlog');

  const entries: LogEntry[] = [];
  let flashTimer = 0;
  const stored = localStorage.getItem(MODE_KEY);
  let mode: LogMode = isLogMode(stored) ? stored : 'ticker';

  function syncMode() {
    el.classList.toggle('log-ticker', mode === 'ticker');
    el.classList.toggle('log-vertical', mode === 'log');
    tickerBtn.classList.toggle('active', mode === 'ticker');
    logBtn.classList.toggle('active', mode === 'log');
    render();
  }

  function entryNode(entry: LogEntry, count: number): HTMLElement {
    const row = document.createElement('div');
    row.className = `log-entry log-${entry.kind}`;
    const when = document.createElement('span');
    when.className = 'log-when';
    when.textContent = entry.when;
    const text = document.createElement('span');
    text.className = 'log-text';
    text.textContent = count > 1 ? `${entry.text} ×${count}` : entry.text;
    row.append(when, text);
    return row;
  }

  function render() {
    const newestFirst = [...entries].reverse();
    track.innerHTML = '';
    track.style.animation = 'none';
    if (entries.length === 0) {
      const quiet = document.createElement('div');
      quiet.className = 'log-entry log-quiet';
      quiet.textContent = 'Nothing to report.';
      track.appendChild(quiet);
      return;
    }
    if (mode === 'log') {
      for (const { entry, count } of collapseRuns(newestFirst)) {
        track.appendChild(entryNode(entry, count));
      }
      return;
    }
    // Ticker: the tail of the feed, oldest of that tail first so it reads
    // left to right, laid out twice so the crawl can loop seamlessly.
    const tail = collapseRuns(newestFirst.slice(0, TICKER_ENTRIES)).reverse();
    for (let pass = 0; pass < 2; pass++) {
      for (const { entry, count } of tail) track.appendChild(entryNode(entry, count));
    }
    // measure the first pass, then crawl exactly that far and start over
    const half = track.scrollWidth / 2;
    if (half > 0) {
      track.style.setProperty('--log-shift', `${-half}px`);
      track.style.animation = `log-crawl ${(half / TICKER_SPEED).toFixed(2)}s linear infinite`;
    }
  }

  tickerBtn.addEventListener('click', () => {
    mode = 'ticker';
    localStorage.setItem(MODE_KEY, mode);
    syncMode();
  });
  logBtn.addEventListener('click', () => {
    mode = 'log';
    localStorage.setItem(MODE_KEY, mode);
    syncMode();
  });
  syncMode();

  return {
    el,
    /** Append one line. Identical consecutive messages fold into a counter. */
    push(text: string, kind: EventKind, when: string) {
      entries.push({ text, kind, when });
      if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
      // a fresh line flashes the strip, which is the only attention it asks for
      el.classList.remove('log-flash', 'log-flash-error');
      void el.offsetWidth; // reflow, so the animation restarts on a repeat
      el.classList.add(kind === 'error' ? 'log-flash-error' : 'log-flash');
      window.clearTimeout(flashTimer);
      flashTimer = window.setTimeout(() => el.classList.remove('log-flash', 'log-flash-error'), 700);
      render();
    },
    mode: () => mode,
    entries: () => entries.slice(),
  };
}
