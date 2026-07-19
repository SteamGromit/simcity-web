# Changelog

All notable changes to SimCity Web. Format follows
[Keep a Changelog](https://keepachangelog.com); versions are sequential
feature drops rather than semver promises.

## [0.16.0] — 2026-07-19 · Control room

### Added
- **Keyboard shortcuts for every tool** — B bulldoze, R road, 1/2/3
  zones, P plant, L line, K park, F/V/S/D fire/police/school/hospital,
  U bus, W pump, X pipe, I query. Shown as key chips on the buttons and
  safe alongside the existing Q/E/M/H bindings.
- **Collapsible toolbar** — tools are grouped (Build · Civic & utilities ·
  Terrain · Zone density · Data views); click a header to fold a group,
  and the folded state persists.
- **Movable panels** — drag the toolbar (by its ⠿ grip), HUD, Budget,
  Charts, City Hall, and Help panels anywhere; positions persist across
  sessions.
- **Road line tool** — roads now draw as an adjustable line: press, drag
  to aim (live gold preview, stairstepped so every tile connects), release
  to build. Esc cancels a pending line.

## [0.15.0] — 2026-07-19 · Day & night

### Added
- A gentle **day/night cycle** (90 seconds per day, purely visual, keeps
  rolling while paused like the automata): a deep-blue night wash rolls
  over the map, occupied building windows glow warmer and brighter after
  dark, and streetlights pool warm light along the roads. The cursor and
  UI stay bright above the night layer.

## [0.14.0] — 2026-07-19 · Water utility

### Added
- **Water Pumps** (§300, §25/mo) and **Pipes** (§5): pumps only work
  powered and within 2 tiles of open water — geography matters. Water
  flows through adjacent zones and buildings like the power grid; pipes
  bridge gaps and cross under roads (mirroring power lines). The Water
  data view shows what's connected.
- **Growth past stage 2 requires running water** — wells only carry a
  building so far. The advisor warns when buildings run dry; the query
  tool shows a Watered row.

## [0.13.0] — 2026-07-19 · City Hall

### Added
- **City Hall panel** (HUD button): an advisor board listing *every*
  active advisor warning (the 💡 tip bar only shows the top one), plus
  the city's ordinance book.
- **Ordinances** — monthly-cost policies with real sim hooks:
  - *Clean Air Act* (§100): industry and traffic pollute 30% less.
  - *Free Bus Service* (§150): bus-served commutes put only a quarter
    of the cars on the road.
  - *Fire Safety Code* (§80): buildings half as likely to ignite.
  - *Education Grant* (§120): school coverage counts 25% stronger.
  Enacted ordinances persist in saves; legacy saves load with all off.

## [0.12.0] — 2026-07-19 · Congestion & buses

### Added
- **Congestion-aware routing:** road tiles have a capacity; busy tiles cost
  more to drive through (quadratic penalty, up to 4× when jammed), so
  commutes lengthen on clogged arteries and commuters route around them.
  Development, land value, and pollution all feel it. The Traffic data
  view and the query tool now read congestion, and the advisor warns when
  the network jams.
- **Bus stops** (§150, §15/mo, radius 5): when both ends of a commute have
  a powered stop in reach, half the cars stay off the road. Transit access
  also nudges residential desirability. Subway deferred — re-add to
  TODO.md if wanted.

## [0.11.0] — 2026-07-19 · Elevation & bridges

### Added
- **Terrain elevation** (levels 0–3): new maps generate rolling hills with
  stacked plateaus; cliffs render as earthen faces and tiles lift with
  height in every view rotation. Cars, overlays, hover, picking, and the
  minimap (lightened highlands) all understand elevation.
- **Raise Land / Lower Land tools** (§20, rectangle-draggable, free while
  the map is pristine like the other terrain tools). Terraforming under
  any structure is blocked; bulldozing keeps the ground height.
- **Cliffs matter:** roads, zone road-access, and commutes only climb one
  level per tile — a 2-level cliff severs the network. Power lines climb
  freely. Hillside tiles earn a small land-value view bonus.
- **Bridges:** the Road tool now builds over water (§50/tile) — deck,
  pylons, and lane markings render over the waves, traffic and wires
  cross, and bulldozing returns open water.

## [0.10.0] — 2026-07-19 · Health & spreading fires

### Added
- **Hospital** (§600, §60/mo upkeep, radius 10): the fourth civic service.
  Health coverage is required for stage 5+ residential/commercial towers
  (industry exempt) and gives homes a small desirability boost. Health
  Cover data view, query rows, white red-cross building.
- **Fires now spread.** An uncovered building that ignites burns for a
  while instead of vanishing: flames render on the map, the fire jumps to
  adjacent buildings (fire coverage resists it — and can extinguish the
  blaze), abandoned shells catch too, and a burned-out building collapses
  to an empty lot. Bulldozing a burning building stops the fire — cutting
  firebreaks is a real tactic. The advisor's top-priority tip warns while
  anything burns.

### Changed
- Old saves load cleanly; new tile fields default safely.

## [0.9.0] — 2026-07-19 · Sound

### Added
- Procedural sound effects via the Web Audio API — no audio assets, in the
  spirit of the asset-free renderer. Every tool has a synthesized cue
  (road thunk, zone ticks pitched per sector, coal-plant rumble, power-line
  zap, terrain noise), plus error buzz, save/load chime, tool-select tick,
  and an alarm when a notice (fire) arrives.
- Ambient city hum: low-pass noise whose level follows population on a log
  curve — a dead city is silent, a metropolis murmurs.
- Mute toggle (🔊 button top-right, or M), persisted across sessions.
  Rapid drag-painting is throttled so it doesn't machine-gun.

## [0.8.0] — 2026-07-19 · Help & advisor tips

### Added
- In-game help panel (H / ? key, or the ? button): getting-started steps,
  controls, and how the simulation decides what grows.
- Contextual advisor tips (💡, bottom-left): a pure sim-layer advisor
  (`sim/tips.ts`) watches the city and surfaces the most pressing problem —
  missing power plant, unpowered zones, no road access, fire risk, deficit,
  punishing taxes, pollution, abandonment — with a welcome tip for brand-new
  cities. Tips are dismissible; a dismissed tip returns only if its problem
  clears and later recurs.

## [0.7.0] — 2026-07-19 · Terrain

### Added
- Water and forest terrain: new maps generate lakes and woods
  (deterministic per seed); nothing can be built on them.
- Terrain sculpting tools (Water / Forest / Level Land, rectangle-draggable):
  **free while the map is untouched** — SC4 God-mode style — then charged
  once anything has developed. Bulldozing bare forest or water clears it.
- Waterfront and forest-edge land value bonuses.
- Terrain on the minimap and in the query tool.

## [0.6.0] — 2026-07-19 · Free view rotation

### Added
- The camera rotates a full 360° (hold Q/E), pivoting around the screen
  center. The projection, building faces, lighting, picking, overlays,
  automata, and the minimap viewport all follow the view angle.

### Changed
- Rendering is now geometry-driven: ground tiles are projected quads,
  building walls are visibility-tested per view angle, and paint order is a
  depth sort recomputed as the camera turns.

## [0.5.0] — 2026-07-19 · Quality of life & automata

### Added
- Rectangle-drag zoning: zones, parks, and bulldoze drag out a filled
  rectangle with a translucent preview; roads still paint tile-by-tile.
- Minimap (bottom right): zone colors, downtown glints, viewport outline,
  click to jump the camera.
- Charts panel: monthly population and funds history (240 samples, saved),
  two single-series line charts with hover readout.
- Automata: decorative cars roam roads that carry commuter traffic;
  pedestrians stroll outside occupied buildings. Pure render layer.

### Fixed
- Cars despawn when their road is demolished (no more ghost cars on grass).
- A corrupted save with an oversized history can no longer freeze rendering.
- Revived building stages clamp to their tile's density cap.
- Toolbar cost labels share the sim's cost function and cannot drift.

## [0.4.0] — 2026-07-19 · Density zoning

### Added
- Low/Medium/High zone density selector (cost ×1/×2/×4); density caps
  development at stage 3/5/7, with mid- and high-rise procedural buildings
  up to 700 residents per tile.
- Stage 4+ gates: substantial service coverage (>0.2) and rising land value
  (0.55/0.62/0.68/0.75).

### Changed (balance)
- Service coverage now lifts land value (up to +0.12).
- Commutes of 8 tiles or less carry no land-value penalty.
- Road traffic emission capped so busy corridors can't saturate pollution.

## [0.3.0] — 2026-07-19 · Civic services

### Added
- Fire station, police station, school: power-gated coverage radii feeding
  desirability and land value; coverage data views.
- Stage gates: fire coverage unlocks stage 2; police + school unlock stage 3
  (industry skips school).
- Fires: developed buildings with zero fire coverage can burn down (0.4%
  monthly); event notices surface as toasts.
- Service upkeep in the monthly budget.

## [0.2.0] — 2026-07-19 · Power fixes

### Added
- Power lines can be strung over road tiles to cross them.
- Every unpowered zone shows a no-power bolt, developed or not.

### Fixed
- The natural starter layout (plant beside the road) previously failed
  silently: roads don't conduct and there was no way to bridge them.

## [0.1.0] — 2026-07-18 · Initial playable release

### Added
- 64×64 isometric city with procedurally drawn buildings (no art assets).
- RCI demand simulation: zones develop, grow, decay, and abandon on their
  own based on demand, desirability, commute access, land value, pollution.
- Power plants and conduction; road-graph commute simulation; budget with
  per-sector tax sliders; RCI demand meter; data-view overlays (power,
  pollution, land value, traffic); save/load; four game speeds.
