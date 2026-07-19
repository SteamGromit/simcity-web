import { CityState } from '../sim/types';

const W = 250;
const H = 84;
const PAD = { l: 8, r: 8, t: 16, b: 6 };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Validated against the dark panel surface (dataviz six-checks, mode dark).
const SERIES = { pop: '#5b8ff0', funds: '#34a853' };
const INK = { primary: '#ffffff', muted: '#9fb2c8', grid: 'rgba(159,178,200,0.15)' };

interface ChartSpec {
  title: string;
  color: string;
  data: (c: CityState) => number[];
  fmt: (v: number) => string;
}

const CHARTS: ChartSpec[] = [
  {
    title: 'Population',
    color: SERIES.pop,
    data: (c) => c.history.pop,
    fmt: (v) => v.toLocaleString(),
  },
  {
    title: 'Funds §',
    color: SERIES.funds,
    data: (c) => c.history.funds,
    fmt: (v) => `§${Math.round(v).toLocaleString()}`,
  },
];

function drawChart(
  ctx: CanvasRenderingContext2D,
  spec: ChartSpec,
  city: CityState,
  hoverIdx: number | null,
) {
  const data = spec.data(city);
  ctx.clearRect(0, 0, W, H);
  ctx.font = '10px sans-serif';
  ctx.fillStyle = INK.muted;
  ctx.fillText(spec.title, PAD.l, 10);

  if (data.length < 2) {
    ctx.fillText('waiting for history…', PAD.l, H / 2 + 4);
    return;
  }

  const lo = Math.min(0, ...data);
  const hi = Math.max(1, ...data);
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

  ctx.strokeStyle = spec.color;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  data.forEach((v, i) => (i === 0 ? ctx.moveTo(px(i), py(v)) : ctx.lineTo(px(i), py(v))));
  ctx.stroke();

  // hover readout, else the latest value as a direct label
  const i = hoverIdx !== null && hoverIdx < data.length ? hoverIdx : data.length - 1;
  const monthAbs = city.month - (data.length - 1 - i);
  ctx.fillStyle = spec.color;
  ctx.beginPath();
  ctx.arc(px(i), py(data[i]), 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = INK.primary;
  const label = `${spec.fmt(data[i])}`;
  const when = `${MONTHS[((monthAbs % 12) + 12) % 12]} ${2000 + Math.floor(monthAbs / 12)}`;
  ctx.textAlign = 'right';
  ctx.fillText(label, W - PAD.r, 10);
  ctx.fillStyle = INK.muted;
  ctx.fillText(when, W - PAD.r - ctx.measureText(label).width - 8, 10);
  ctx.textAlign = 'left';
}

/** Two stacked single-series line charts (population, funds) — never dual-axis. */
export function buildCharts(root: HTMLElement, city: () => CityState) {
  const panel = document.createElement('div');
  panel.id = 'charts-panel';
  panel.className = 'panel hidden';
  panel.innerHTML = '<h3>City history</h3>';
  root.appendChild(panel);

  const contexts: CanvasRenderingContext2D[] = [];
  let hoverIdx: number | null = null;

  for (const _spec of CHARTS) {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    panel.appendChild(canvas);
    contexts.push(canvas.getContext('2d')!);
    canvas.addEventListener('pointermove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const n = city().history.pop.length;
      if (n < 2) return;
      const frac = (e.clientX - rect.left - PAD.l) / (W - PAD.l - PAD.r);
      hoverIdx = Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1))));
    });
    canvas.addEventListener('pointerleave', () => (hoverIdx = null));
  }

  return {
    toggle() {
      panel.classList.toggle('hidden');
    },
    update(c: CityState) {
      if (panel.classList.contains('hidden')) return;
      CHARTS.forEach((spec, i) => drawChart(contexts[i], spec, c, hoverIdx));
    },
  };
}
