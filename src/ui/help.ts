import { Tip } from '../sim/tips';
import { panelHandle } from './panel';

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
    <h3>How to play</h3>
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
          <li><b>Growth-gated families</b> (Road, Power Plant, Police, Waste,
              Transit) show one button until the city unlocks a second option,
              then open a flyout. Their key always arms the <em>first</em>
              member — <b>R</b> is always a plain street.</li>
          <li><b>Middle-drag or Space+drag</b> — pan · <b>Wheel</b> or the
              <b>+ / −</b> buttons — zoom</li>
          <li><b>Touch</b> — one finger builds (or pans with no tool armed),
              two fingers pan and pinch to zoom. On a narrow screen <b>☰</b>
              slides the tools in and out.</li>
          <li><b>Q / E</b> — turn the view a quarter · <b>Arrows</b> — pan</li>
          <li><b>⇧ + letter</b> — toggle data views: ⇧P power, ⇧O pollution,
              ⇧L land value, ⇧T traffic, ⇧D demand, ⇧F fire, ⇧V police, ⇧S school,
              ⇧H health, ⇧W water</li>
          <li><b>Esc</b> — cancel tool · <b>H</b> or <b>?</b> — this help</li>
          <li><b>M</b> — mute · <b>⠿</b> — drag panels · <b>⇱</b> — pop a
              tool section out · <b>×</b> — close a panel</li>
          <li><b>Events</b> stream into one strip — drag it anywhere, and use
              <b>⇄ / ⇅</b> on its handle to switch between a ticker and a
              newest-first log.</li>
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
          <li><b>Wider roads</b> unlock as you grow, and each drags out a
              corridor rather than a line: <b>Route</b> (2 squares, pop 2,000),
              <b>Boulevard</b> (3 squares around a planted median, 8,000),
              <b>Highway</b> (4 squares, 20,000) and <b>Highway II</b> (6
              squares, 45,000). Every tile of a wider class swallows more
              traffic before it jams. A boulevard's median is landscaping, not
              a lane — lay a plain street across one to punch a junction
              through it.</li>
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

  const handle = panelHandle(panel);
  btn.addEventListener('click', handle.toggle);
  return {
    toggle: handle.toggle,
    hide: handle.close,
  };
}

/**
 * Advisor tips reach the player through the event log rather than a strip of
 * their own. This tracks which have already been announced so a standing
 * complaint is said once, not every two seconds — and says it again if the
 * condition clears and later comes back.
 */
export function createAdvisorFeed(announce: (tip: Tip) => void) {
  const said = new Set<Tip['id']>();
  return {
    update(tips: Tip[]) {
      const current = new Set<Tip['id']>(tips.map((t) => t.id));
      for (const id of said) if (!current.has(id)) said.delete(id);
      for (const tip of tips) {
        if (said.has(tip.id)) continue;
        said.add(tip.id);
        announce(tip);
      }
    },
  };
}
