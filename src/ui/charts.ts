import { CityState } from '../sim/types';
import { HISTORY_SPECS, type HistoryKey, type HistorySpec } from '../sim/history';
import { monthLabel } from './format';
import { panelHandle } from './panel';

const W = 250;
const H = 84;
const PAD = { l: 8, r: 8, t: 16, b: 6 };

/**
 * One colour per series group, assigned in fixed order and never cycled.
 * These are slots 1–5 of the reference categorical palette, stepped for a dark
 * surface; the set passes the six checks against this panel's plate
 * (`node scripts/validate_palette.js "#3987e5,#d95926,#199e70,#c98500,#d55181"
 * --mode dark --surface "#1b2123"`). Colour is a *secondary* encoding here:
 * every chart is its own small multiple carrying its own title, so nothing is
 * ever identified by colour alone.
 */
const GROUP_COLOR: Record<HistorySpec['group'], string> = {
  City: '#3987e5',
  Money: '#d95926',
  'Zones & density': '#199e70',
  Conditions: '#c98500',
  Incidents: '#d55181',
};

const INK = { primary: '#ffffff', muted: '#9fb2c8', grid: 'rgba(159,178,200,0.15)' };

/** Windows the player can scroll through, in months. 0 means the whole run. */
const RANGES: { months: number; label: string }[] = [
  { months: 12, label: '1 year' },
  { months: 60, label: '5 years' },
  { months: 120, label: '10 years' },
  { months: 0, label: 'All' },
];

const KEY_SERIES = 'simcity.charts.series';
const KEY_RANGE = 'simcity.charts.range';
const KEY_PERCAP = 'simcity.charts.percap';

const DEFAULT_SERIES: HistoryKey[] = ['pop', 'funds'];

const specOf = (key: HistoryKey): HistorySpec => HISTORY_SPECS.find((s) => s.key === key)!;

/** Revive the persisted selection, dropping any series this build no longer has. */
function loadSelection(): Set<HistoryKey> {
  const known = new Set(HISTORY_SPECS.map((s) => s.key));
  try {
    const raw = JSON.parse(localStorage.getItem(KEY_SERIES) ?? 'null');
    if (Array.isArray(raw)) {
      const kept = raw.filter((k): k is HistoryKey => known.has(k as HistoryKey));
      if (kept.length > 0) return new Set(kept);
    }
  } catch {
    /* corrupt selection — fall through to the defaults */
  }
  return new Set(DEFAULT_SERIES);
}

/** How a value reads once the per-capita switch has had its say. */
export function formatValue(spec: HistorySpec, value: number, perCapita: boolean): string {
  if (perCapita) {
    const n = Math.round(value * 10) / 10;
    return `${n.toLocaleString()}${spec.unit === '§' ? '§' : ''}/1k`;
  }
  if (spec.unit === '§') return `§${Math.round(value).toLocaleString()}`;
  if (spec.unit === '%') return `${Math.round(value)}%`;
  const n = Math.round(value * 10) / 10;
  return n.toLocaleString();
}

/**
 * Rescale a series per 1,000 residents. A month with nobody living in the city
 * reads as 0 rather than dividing by zero — an empty city has no rate.
 */
export function perCapitaSeries(values: number[], pop: number[]): number[] {
  return values.map((v, i) => {
    const people = pop[i] ?? 0;
    return people <= 0 ? 0 : (v / people) * 1000;
  });
}

/** The slice of a series the current window shows: `[start, start+span)`. */
export function windowOf(
  length: number,
  months: number,
  offset: number,
): { start: number; span: number } {
  const span = months <= 0 ? length : Math.min(length, months);
  const maxStart = Math.max(0, length - span);
  const start = Math.max(0, Math.min(maxStart, maxStart - offset));
  return { start, span };
}

interface DrawArgs {
  spec: HistorySpec;
  data: number[];
  /** Absolute month of the last sample in `data`. */
  endMonth: number;
  hoverIdx: number | null;
  perCapita: boolean;
}

function drawChart(ctx: CanvasRenderingContext2D, a: DrawArgs) {
  const { spec, data } = a;
  const color = GROUP_COLOR[spec.group];
  ctx.clearRect(0, 0, W, H);
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = INK.muted;
  ctx.fillText(a.perCapita ? `${spec.label} · per 1k` : spec.label, PAD.l, 10);

  if (data.length < 2) {
    ctx.fillText('waiting for history…', PAD.l, H / 2 + 4);
    return;
  }

  let lo = 0;
  let hi = 1;
  for (const v of data) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const px = (i: number) => PAD.l + (i / (data.length - 1)) * (W - PAD.l - PAD.r);
  const py = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);

  // recessive grid: top / zero-or-bottom lines only
  ctx.strokeStyle = INK.grid;
  ctx.lineWidth = 1;
  for (const v of lo < 0 ? [hi, 0] : [hi, lo]) {
    ctx.beginPath();
    ctx.moveTo(PAD.l, py(v));
    ctx.lineTo(W - PAD.r, py(v));
    ctx.stroke();
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  data.forEach((v, i) => (i === 0 ? ctx.moveTo(px(i), py(v)) : ctx.lineTo(px(i), py(v))));
  ctx.stroke();

  // hover readout, else the latest value as a direct label
  const i = a.hoverIdx !== null && a.hoverIdx < data.length ? a.hoverIdx : data.length - 1;
  const monthAbs = a.endMonth - (data.length - 1 - i);
  if (a.hoverIdx !== null) {
    // crosshair: the whole panel shares one hovered month
    ctx.strokeStyle = 'rgba(159,178,200,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px(i), PAD.t - 4);
    ctx.lineTo(px(i), H - PAD.b);
    ctx.stroke();
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(px(i), py(data[i]), 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = INK.primary;
  const label = formatValue(spec, data[i], a.perCapita);
  const when = monthLabel(monthAbs);
  ctx.textAlign = 'right';
  ctx.fillText(label, W - PAD.r, 10);
  ctx.fillStyle = INK.muted;
  ctx.fillText(when, W - PAD.r - ctx.measureText(label).width - 8, 10);
  ctx.textAlign = 'left';
}

/**
 * Small multiples of the city's monthly ledger: one single-series line chart
 * per series the player has switched on — never a dual axis, never two
 * measures sharing a scale. The player picks which series appear, whether
 * they read as totals or per 1,000 residents, and how much of the run is on
 * screen.
 */
export function buildCharts(root: HTMLElement, city: () => CityState) {
  const panel = document.createElement('div');
  panel.id = 'charts-panel';
  panel.className = 'panel hidden';
  panel.innerHTML = `
    <h3>City history</h3>
    <div class="chart-controls">
      <label class="chart-field"><span>Range</span>
        <select id="chart-range"></select>
      </label>
      <label class="chart-check" title="Divide each total by the city's population. Rates and averages are already per-resident and stay as they are.">
        <input type="checkbox" id="chart-percap"><span>per 1k</span>
      </label>
      <button id="chart-series-btn" type="button">Series ▾</button>
    </div>
    <label class="chart-field chart-scroll-row" title="Scroll the window back through the city's history.">
      <span>Scroll</span>
      <input type="range" id="chart-scroll" min="0" max="0" step="1" value="0">
      <span class="chart-when" id="chart-when"></span>
    </label>
    <div id="chart-series" class="hidden"></div>
    <div id="chart-list"></div>
  `;
  root.appendChild(panel);

  const rangeSel = panel.querySelector('#chart-range') as HTMLSelectElement;
  const perCapBox = panel.querySelector('#chart-percap') as HTMLInputElement;
  const seriesBtn = panel.querySelector('#chart-series-btn') as HTMLButtonElement;
  const seriesBox = panel.querySelector('#chart-series') as HTMLElement;
  const scroll = panel.querySelector('#chart-scroll') as HTMLInputElement;
  const scrollRow = panel.querySelector('.chart-scroll-row') as HTMLElement;
  const whenEl = panel.querySelector('#chart-when') as HTMLElement;
  const list = panel.querySelector('#chart-list') as HTMLElement;

  const selected = loadSelection();
  let months = Number(localStorage.getItem(KEY_RANGE) ?? '0');
  if (!RANGES.some((r) => r.months === months)) months = 0;
  let perCapita = localStorage.getItem(KEY_PERCAP) === '1';
  /** Months between the window's right edge and the newest sample. */
  let offset = 0;
  let hoverIdx: number | null = null;
  /** What the last paint was of; a redraw is skipped while nothing has moved. */
  let painted = '';

  for (const r of RANGES) {
    const opt = document.createElement('option');
    opt.value = String(r.months);
    opt.textContent = r.label;
    rangeSel.appendChild(opt);
  }
  rangeSel.value = String(months);
  perCapBox.checked = perCapita;

  rangeSel.addEventListener('change', () => {
    months = Number(rangeSel.value);
    localStorage.setItem(KEY_RANGE, String(months));
    offset = 0;
    painted = '';
  });
  perCapBox.addEventListener('change', () => {
    perCapita = perCapBox.checked;
    localStorage.setItem(KEY_PERCAP, perCapita ? '1' : '0');
    painted = '';
  });
  scroll.addEventListener('input', () => {
    offset = Number(scroll.value);
    painted = '';
  });
  seriesBtn.addEventListener('click', () => {
    seriesBox.classList.toggle('hidden');
    seriesBtn.classList.toggle('active', !seriesBox.classList.contains('hidden'));
  });

  // --- series picker: grouped checkboxes, in HISTORY_SPECS order ---
  let lastGroup = '';
  for (const spec of HISTORY_SPECS) {
    if (spec.group !== lastGroup) {
      lastGroup = spec.group;
      const head = document.createElement('div');
      head.className = 'chart-series-group';
      head.textContent = spec.group;
      head.style.setProperty('--series-hue', GROUP_COLOR[spec.group]);
      seriesBox.appendChild(head);
    }
    const row = document.createElement('label');
    row.className = 'chart-check';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = selected.has(spec.key);
    box.addEventListener('change', () => {
      if (box.checked) selected.add(spec.key);
      else selected.delete(spec.key);
      localStorage.setItem(KEY_SERIES, JSON.stringify([...selected]));
      rebuildCanvases();
      painted = '';
    });
    const text = document.createElement('span');
    text.textContent = spec.label;
    row.append(box, text);
    seriesBox.appendChild(row);
  }

  // --- one canvas per selected series, rebuilt only when the picks change ---
  const canvases = new Map<HistoryKey, CanvasRenderingContext2D>();

  function rebuildCanvases() {
    list.innerHTML = '';
    canvases.clear();
    const picks = HISTORY_SPECS.filter((s) => selected.has(s.key));
    if (picks.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'chart-empty';
      empty.textContent = 'No series selected — open Series and pick some.';
      list.appendChild(empty);
      return;
    }
    for (const spec of picks) {
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      canvas.title = spec.label;
      list.appendChild(canvas);
      canvases.set(spec.key, canvas.getContext('2d')!);
      canvas.addEventListener('pointermove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const span = currentSpan();
        if (span < 2) return;
        const frac = ((e.clientX - rect.left) * (W / rect.width) - PAD.l) / (W - PAD.l - PAD.r);
        hoverIdx = Math.max(0, Math.min(span - 1, Math.round(frac * (span - 1))));
        painted = '';
      });
      canvas.addEventListener('pointerleave', () => {
        hoverIdx = null;
        painted = '';
      });
    }
  }

  const currentSpan = () => windowOf(city().history.pop.length, months, offset).span;

  rebuildCanvases();
  const handle = panelHandle(panel, () => {
    painted = ''; // force a fresh paint on open
  });

  return {
    toggle: handle.toggle,
    open: handle.open,
    close: handle.close,
    isOpen: handle.isOpen,
    update(c: CityState) {
      if (!handle.isOpen()) return;
      const len = c.history.pop.length;
      const { start, span } = windowOf(len, months, offset);
      const maxOffset = Math.max(0, len - span);
      if (scroll.max !== String(maxOffset)) scroll.max = String(maxOffset);
      if (offset > maxOffset) offset = maxOffset;
      if (scroll.value !== String(offset)) scroll.value = String(offset);
      scrollRow.classList.toggle('disabled', maxOffset === 0);
      scroll.disabled = maxOffset === 0;

      const key = `${c.month}|${len}|${months}|${offset}|${perCapita}|${hoverIdx}`;
      if (key === painted) return;
      painted = key;

      // the window's last sample is `offset` months behind the newest one
      const endMonth = c.month - (len - (start + span));
      whenEl.textContent = span > 0 ? monthLabel(endMonth) : '—';
      const pop = c.history.pop.slice(start, start + span);
      for (const [seriesKey, ctx] of canvases) {
        const spec = specOf(seriesKey);
        let data = c.history[seriesKey].slice(start, start + span);
        const asRate = perCapita && spec.perCapita;
        if (asRate) data = perCapitaSeries(data, pop);
        drawChart(ctx, { spec, data, endMonth, hoverIdx, perCapita: asRate });
      }
    },
  };
}
