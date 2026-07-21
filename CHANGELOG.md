# Changelog

All notable changes to SimCity Web. Format follows
[Keep a Changelog](https://keepachangelog.com); versions are sequential
feature drops rather than semver promises.

## [0.28.0] — 2026-07-20 · Demand data view

### Added
- Demand data view (⇧D): per-tile growth pressure — green where zones
  will grow, yellow where stagnant, red under collapsing demand, slate
  where blocked by missing power or road access.

## [0.27.0] — 2026-07-20 · Coverage halo

### Added
- Placement halo: hovering with a fire/police/school/hospital/bus tool
  previews the coverage footprint with the data-view green.

## [0.26.0] — 2026-07-20 · Utility drag-drawing

### Added
- Power lines and water pipes draw like roads: press to anchor, drag to
  aim a line preview (pipes preview in blue), release to build.

## [0.25.2] — 2026-07-20 · Input-guard fix

### Fixed
- Global shortcuts (camera pan, help, mute, Space pan) no longer fire
  while a form control is focused: arrow keys on a focused tax slider
  adjust only the slider instead of also panning the camera.

## [0.25.1] — 2026-07-20 · Display panel fix

### Fixed
- The Display panel was invisible: it had no positioning CSS, and the
  controls moved from City Hall were still styled under City Hall's
  selector scope. It now opens beside the toolbar with working city
  style, weather, music, and day/night controls.

## [0.25.0] — 2026-07-20 · Controls revamp

### Added
- Zoning section with a per-zone density flyout — click a zone tool and
  choose Low/Medium/High beside it; each zone remembers its last density
  (1/2/3 keys reuse it).
- Toolbar sections pop out into draggable floating panels and re-dock;
  positions and detached state persist.
- Shift+key data-view shortcuts (⇧P power, ⇧O pollution, ⇧L land value,
  ⇧T traffic, ⇧F fire, ⇧V police, ⇧S school, ⇧H health, ⇧W water).
- Display panel (HUD button) gathering city style, weather effects, and
  music, plus a new day/night lighting toggle.

### Changed
- The day/night cycle is now off by default — enable it in Display.
- The global Zone density section is gone; density lives with each zone
  tool. City style / weather / music moved from City Hall to Display.

## [0.24.1] — 2026-07-20 · Save hardening

### Fixed
- Crafted saves can no longer revive tax rates above the 20% slider cap or
  demand outside [-1, 1]; both clamp to the ranges the game itself can set.

## [0.24.0] — 2026-07-20 · Visual variety

### Added
- Seeded per-tile building archetypes: composed silhouettes (L-shapes,
  setbacks, twin masses), roof styles (flat/parapet/gabled/sawtooth),
  rooftop and yard props, palette families per tier, and three window
  styles — all deterministic from the map seed, composing with skins.
- Farms vary: barn placement, furrow direction, silo or coop.
- Context-aware traffic: trucks favor industrial roads, taxis and vans
  commercial ones, buses appear near bus stops; kind-specific speeds and
  paint, wider car palette.
- Pedestrians vary in build, dress, and pace.

## [0.23.0] — 2026-07-20 · RCI tiers & industry types

### Added
- **Industry kinds**: industry splits into agricultural, dirty,
  manufacturing, and high-tech. Kind is chosen by the city's education
  level (share of homes with school coverage) and local pollution; zone
  industrial at low density for farmland.
- **Wealth tiers**: residential and commercial lots carry § / §§ / §§§
  driven by land value, with pollution as a ceiling. Wealthier lots hold
  fewer occupants and pay substantially more tax.
- **Gradual re-tiering**: lots re-tier as conditions change —
  neighborhoods gentrify and industry modernizes over months rather than
  flipping at once, with a dead band so boundary lots don't flicker.
- **Distinct looks**: each subtype renders distinctly; farms draw tilled
  fields and a barn instead of a factory box, high-tech is a clean
  white-teal, and only smoky industry gets smokestacks.
- **City make-up panel**: City Hall shows residents by wealth, industrial
  jobs by kind, and the education level driving industry; the query tool
  names each developed lot's tier.

## [0.22.0] — 2026-07-19 · Adaptive music

### Added
- **Adaptive soundtrack**: a procedural score, fully synthesized in the
  browser like every other sound, that plays the city back at you.
  Locale and climate pick the color — desert maps run a hijaz scale on a
  higher root, winter turns minor, low, and slow, summer lifts the
  register, rain and clouds soften and thin the notes, snow rings sparse
  high bells. Growth builds the band: a village gets a lone slow melody,
  bass joins at 500 residents, a pad at 5 000, percussion at 20 000 as
  the tempo climbs 70→110 bpm. A heavily industrial city turns the
  music minor with a sawtooth bass; an active disaster ducks everything
  to a tense low drone until the skies clear.
- **Music toggle** (City Hall → Display): on by default, remembered like
  a preference. M still mutes all audio at once.

## [0.21.0] — 2026-07-19 · Disaster visuals

### Added
- **Rubble**: every stage a disaster knocks off a building now buries the
  lot in debris — drawn as an ash stain with scattered blocks and
  splintered beams. Rubble blocks redevelopment while it lasts, cleanup
  crews carry it off over ~4 months, bulldozing clears it instantly, and
  it survives save/load. The tornado finally leaves a visible trail.
- **Tornado spectacle**: debris chunks fling outward from the funnel and
  arc to the ground, a dust ring churns at the point of contact, and an
  ugly green-grey storm light falls over the city while the funnel is
  down.
- **Hurricane spectacle**: near-horizontal wind streaks over the driving
  rain, forest canopies whip and lean in the gusts, and storm surge
  churns whitecaps and foam along every shoreline.
- **Pandemic street cues**: traffic thins to a quarter and pedestrians
  to ~15% while the outbreak runs, and the walkers still out wear masks.

All disaster visuals ignore the weather-effects toggle — they're cues,
not ambiance (same rule as hurricane rain since v0.20.1).

## [0.20.1] — 2026-07-19 · Polish

### Added
- **Weather effects toggle** (City Hall → Display): switch off the
  ambient rain/snow/cloud visuals if you prefer a clear view. The
  simulation effects, the HUD weather emoji, and hurricane rain (a
  disaster cue) are unaffected. Remembered like a preference.

### Changed
- **Street life now keeps pace with the simulation speed**: cars and
  pedestrians freeze when paused, stroll at normal speed, and hustle at
  fast/cheetah — instead of ambling on wall-clock time regardless.

## [0.20.0] — 2026-07-19 · City styles

### Added
- **Selectable skins** (City Hall → City style, remembered like a
  preference): **Classic** — the standard look; **Springfield** —
  Saturday-morning cartoon with bold ink outlines, loud saturated
  colors, squat buildings, brighter grass; **NYC** — brownstone and
  brick, muted tones, taller silhouettes, asphalt-grey streets.
  Everything is still drawn procedurally — a skin restyles palette,
  outlines, and proportions live, no assets. The registry is built for
  more skins (and eventually user-made ones via modding hooks).

## [0.19.0] — 2026-07-19 · Mountains & desert

### Added
- **Mountains**: the elevation ceiling rises to 5 — level 4 renders as
  bare rock, level 5 wears a snowcap — and every new map guarantees at
  least one true peak (stacked from the highest point so summits always
  top out). Raise Land can sculpt your own.
- **Desert biome** (~1 map in 4, rolled by seed): sandy ground on the map
  and minimap, one precious oasis and a scrub patch instead of lakes and
  woods — water pumps become the whole ballgame — and dry air makes
  fires ignite 50% more readily. Biome persists in saves.

## [0.18.0] — 2026-07-19 · Weather

### Added
- **Seasonal weather**: each month rolls clear ☀️ / cloudy ⛅ / rain 🌧️ /
  snow ❄️ (snow only in winter by the sim calendar), shown beside the
  date and rendered — rainfall, drifting snowfall with a whitened world,
  or an overcast wash.
- Weather touches the sim gently: wet weather halves fire ignition risk,
  and snowbound roads drag every commute (unplowed +0.5 per tile).
  Weather persists in saves.

## [0.17.0] — 2026-07-19 · Disasters

### Added
- **Tornado** 🌪 — a wandering funnel (animated on the map) that grinds
  buildings down a stage at a time and ruptures gas lines: it can set
  what it doesn't flatten on fire.
- **Hurricane** 🌀 — driving rain over the whole map while high winds
  batter developed tiles; blocks within two tiles of open water take
  storm-surge damage at more than double the rate.
- **Pandemic** 🦠 — no rubble, but residential demand craters and
  uncovered homes empty out month after month; hospital coverage blunts
  the toll (a full-coverage home is safe).
- Disasters strike randomly (rarely, one at a time, only once the city
  tops 500 residents) — or summon one yourself from City Hall's
  "tempt fate" panel. Active disasters lead the advisor board and
  survive save/load.

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
