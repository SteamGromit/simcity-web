import { Tip } from '../sim/tips';

/** Static help modal: getting started, controls, and simulation concepts. */
export function buildHelp(root: HTMLElement) {
  const btn = document.createElement('button');
  btn.id = 'help-btn';
  btn.textContent = '?';
  btn.title = 'Help (H)';
  root.appendChild(btn);

  const panel = document.createElement('div');
  panel.id = 'help-panel';
  panel.className = 'panel hidden';
  panel.innerHTML = `
    <h3>How to play <button id="help-close">×</button></h3>
    <div class="cols">
      <section>
        <h4>Getting started</h4>
        <ol>
          <li>Drag a <b>Road</b> through open grass.</li>
          <li>Zone <b>Residential</b>, <b>Commercial</b> and
              <b>Industrial</b> beside it (drag rectangles).</li>
          <li>Build a <b>Coal Plant</b>; anything touching it or a
              <b>Power Line</b> is powered — roads carry wires too.</li>
          <li>Plants have limited capacity — an overloaded grid browns
              out its farthest buildings. Growth unlocks cleaner plants:
              <b>Wind</b> (pop 2,000), <b>Solar</b> (5,000),
              <b>Hydro</b> (10,000, by water), <b>Nuclear</b> (25,000).</li>
          <li>Press <b>▶</b> and watch the RCI meter: tall bars mean
              that sector wants to grow.</li>
        </ol>
        <h4>Controls</h4>
        <ul>
          <li><b>Click / drag</b> — apply tool (zones drag rectangles)</li>
          <li><b>Zoning</b> — click a zone tool and pick a density in its
              flyout; <b>1/2/3</b> reuse each zone's last density</li>
          <li><b>Middle-drag or Space+drag</b> — pan · <b>Wheel</b> — zoom</li>
          <li><b>Q / E</b> — rotate the view · <b>Arrows</b> — pan</li>
          <li><b>⇧ + letter</b> — toggle data views: ⇧P power, ⇧O pollution,
              ⇧L land value, ⇧T traffic, ⇧D demand, ⇧F fire, ⇧V police, ⇧S school,
              ⇧H health, ⇧W water</li>
          <li><b>Esc</b> — cancel tool · <b>H</b> or <b>?</b> — this help</li>
          <li><b>M</b> — mute · <b>⠿</b> — drag panels · <b>⇱</b> — pop a
              tool section out</li>
        </ul>
      </section>
      <section>
        <h4>How the city grows</h4>
        <ul>
          <li>Zones develop only when <b>powered</b> and near a
              <b>road</b> that reaches jobs (R) or workers (C/I).</li>
          <li><b>Water:</b> growth past stage 2 needs a powered
              <b>Water Pump</b> by open water, connected via buildings or
              <b>Pipes</b> (pipes cross under roads).</li>
          <li><b>Hills:</b> roads climb one level at a time — a 2-level
              cliff blocks them. Raise/Lower Land sculpts the terrain;
              the <b>Road</b> tool builds <b>bridges</b> over water.</li>
          <li><b>Land value</b> rises near parks and water, falls with
              pollution and long commutes — it caps building stages.</li>
          <li><b>Density</b> (Low/Med/High) caps how tall a zone can build.</li>
          <li><b>Fire, Police, School</b> coverage keeps buildings safe and
              desirable; a <b>Hospital</b> is needed for the tallest stages.</li>
          <li><b>Traffic congests:</b> jammed roads stretch commutes.
              Add parallel routes, or <b>Bus Stops</b> at both ends of a
              commute to take cars off the road. Growth unlocks better
              transit — <b>Streetcar</b> (pop 5,000), <b>Monorail</b>
              (15,000), <b>Subway</b> (30,000), <b>Rail Terminal</b>
              (50,000) — each covering more ground with fewer cars.</li>
          <li><b>Fires spread!</b> Uncovered buildings can ignite; flames jump
              to neighbors. Fire coverage fights them — or bulldoze a
              firebreak.</li>
          <li><b>Taxes</b>: 9% is neutral — below 7% boosts demand, above
              12% chokes it.</li>
          <li>Abandoned buildings recover if commutes, demand and
              desirability do — use <b>Query</b> to diagnose a tile.</li>
        </ul>
      </section>
    </div>
    <h4>Wealth &amp; industry</h4>
    <p>Buildings pick a character from their surroundings. Raise land value
    with parks, services, and clean air and neighborhoods gentrify from § to
    §§§ — wealthier lots hold fewer people but pay far more tax.</p>
    <p>Industry follows your schools. With few of them you get dirty
    factories; educate the city and they modernize into manufacturing, then
    into clean high-tech — provided the air is clean enough to attract it.
    Zone industry at <em>low</em> density for farmland: little pollution,
    few jobs, and a pleasant place to grow.</p>
  `;
  root.appendChild(panel);

  const toggle = () => panel.classList.toggle('hidden');
  btn.addEventListener('click', toggle);
  (panel.querySelector('#help-close') as HTMLElement).addEventListener('click', toggle);
  return {
    toggle,
    hide() {
      panel.classList.add('hidden');
    },
  };
}

/** Bottom-left advisor strip showing the top contextual tip, dismissible per tip. */
export function buildTipBar(root: HTMLElement) {
  const el = document.createElement('div');
  el.id = 'tip-bar';
  el.className = 'panel hidden';
  const text = document.createElement('span');
  const close = document.createElement('button');
  close.textContent = '×';
  close.title = 'Dismiss tip';
  // no glyph: the brass rule down the strip's edge already marks it an advisory
  el.append(text, close);
  root.appendChild(el);

  const dismissed = new Set<string>();
  let showing: string | null = null;
  close.addEventListener('click', () => {
    if (showing) dismissed.add(showing);
    showing = null;
    el.classList.add('hidden');
  });

  return {
    update(tips: Tip[]) {
      // a dismissed tip returns if its condition clears and later re-fires
      const current = new Set<string>(tips.map((t) => t.id));
      for (const id of dismissed) if (!current.has(id)) dismissed.delete(id);

      const top = tips.find((t) => !dismissed.has(t.id)) ?? null;
      showing = top?.id ?? null;
      el.classList.toggle('hidden', !top);
      if (top) text.textContent = top.text;
    },
  };
}
