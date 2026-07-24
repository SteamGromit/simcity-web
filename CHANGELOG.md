# Changelog

All notable changes to SimCity Web. Format follows
[Keep a Changelog](https://keepachangelog.com); versions are sequential
feature drops rather than semver promises.

## [0.52.0] — 2026-07-24 · Traffic accidents

### Added
- **Busy roads now throw accidents.** A crash blocks a road tile for a
  short while, and traffic **routes around it** — the congestion-aware
  road network you were already commuting over simply detours. A city
  with parallel routes barely notices; a single artery stalls until the
  wreck clears, which is the nudge toward building redundancy, transit,
  and the two new ordinances. Probability scales with traffic, so
  accidents land on exactly the arteries you most want to protect.
- **Driver Education** (§70/mo) makes crashes rarer; the **EMT Program**
  (§110/mo) clears them faster. The EMT effect stacks with **fire
  coverage at the scene** — fire crews are the first responders, so a
  crash near a powered fire station is cleared in a fraction of the time.
- **You see and hear it.** A crashed-car marker — hazard cones, a stalled
  vehicle, a flashing amber/blue bar — sits on the blocked tile; the
  **Traffic** data view flags it bright red; Query shows the tile is
  blocked; a short skid-and-thud cue plays; and the advisor names the
  fix.

### Changed
- Transient and gentle, in the spirit of crime (v0.51): an accident is a
  brief block, never destroys a building, and adds no growth gate. On an
  existing save nothing changes until a road gets genuinely busy; then
  the occasional snarl appears.
- The modifier vocabulary gains two knobs — `accident.rate` and
  `accident.duration` — the levers behind Driver Education and the EMT
  Program, available to mods like the rest.

## [0.51.0] — 2026-07-24 · Crime

### Added
- **Police coverage finally does something.** Until now a police station
  fed a generic "services" average and gated a couple of growth stages,
  but nothing actually *needed* it. Now every developed lot carries a
  standing **crime rate** set by its conditions — poverty above all, then
  crowding, joblessness, and the blight of abandoned neighbours — and
  police coverage is what holds it down.
- **A feedback loop you can break.** Crime drags a tile's land value,
  which raises its crime, which drags its value further — so a neglected
  district spirals on its own. It also deters residents and shoppers,
  slowing growth. A police station (or the Watch, or lifting land value)
  breaks the loop, and the block visibly calms over a few months rather
  than flipping overnight.
- **Two failures, read off the Crime view (⇧C).** A hot district while the
  rest of the city is calm means no police reach — put a station nearby.
  A faint city-wide simmer means your force is stretched — more stations,
  or the Neighborhood Watch. The advisor names whichever it is.
- **A Prison** — the force's high-capacity option: wide police coverage
  behind a pop-15,000 unlock, but a grim neighbour that **blights the land
  value around it**, so you site it away from homes. It joins the Police
  Station in a new police bundle in the toolbar.
- **The Neighborhood Watch ordinance** (§90/mo) cuts crime about a third
  city-wide — the cheap early lever before a second station or a prison.
- **Incidents** you hear and see: a burglary or a bout of vandalism
  reported at a specific block, a brief "!" over the tile and a curt
  police-whistle blip. Cosmetic — the pressure is the standing rate; the
  incident is the feedback.
- Query gains a **Crime** row on developed tiles.

### Changed
- **Not a growth gate.** Unlike garbage's collection requirement (v0.50),
  crime never blocks a building from growing — it is pure pressure on land
  value and desirability. A rich, fully-served block stays buildable no
  matter how rough its neighbourhood, and nothing that wasn't already
  marginal stops growing. On an existing save, a poor and under-policed
  district will cool off and a few marginal lots may tip into abandonment;
  a station or the Watch pulls it back.
- The modifier vocabulary gains a ninth knob, `crime.rate` (the Watch's
  lever), and content gains a reusable **`blight`** block — an amount and a
  radius by which a building depresses nearby land value. Any mod building
  can now declare itself an unpleasant neighbour; the Prison is the first.

## [0.50.0] — 2026-07-24 · Garbage

### ⚠️ A note for existing cities

**Blocks now need refuse collection to grow past stage 3.** Garbage
joins fire, police and schools as a service that gates density, so a
city you have already built will stall until you put a Landfill in
reach of it — exactly as adding running water did back in v0.14. The
Refuse Cover view (⇧R) shows what is and isn't served.

### Added
- **Residents produce garbage, and it has to go somewhere.** Every
  developed lot puts out refuse each month, more as it grows, with
  dirty industry the worst of it. Collection is a city service like any
  other — a disposal building covers a radius — but it is the first one
  with a **second constraint**: the city also needs enough capacity to
  process what the trucks bring in. Miss either and the rubbish stays
  on the street.
- **Two failures that look different and are fixed differently.** Trash
  piling up in one district means nothing reaches it — site a dump
  closer. Trash piling up *evenly across the whole city* means you are
  over capacity — build more, or throw out less. The advisor names
  whichever it is rather than blurring them into one complaint.
- **A Waste ladder**, collapsed into one toolbar bundle beside Power
  Plant and Transit Line:
  - **Landfill** (§800) — available from the start, high capacity, and
    a genuinely unpleasant neighbour: it pollutes hard and drags the
    land value around it down.
  - **Incinerator** (§2,500, pop 8,000) — more capacity and cleaner
    ground, at the price of a stack and a higher bill.
  - **Recycling Centre** (§3,000, pop 20,000 *and* an educated city) —
    modest capacity, but it takes a quarter of the city's refuse out of
    the stream entirely.
- **The Recycling Program ordinance** (§150/mo) cuts what the city
  throws out by a quarter, so a small city has the same lever long
  before it can afford a recycling centre.
- **Uncollected refuse rots.** A heap emits pollution like a small
  factory, drags the lot's land value, and takes the pressure out of
  growth on top of that — so neglect compounds instead of plateauing.
  Heaps clear gradually once collection catches up, not all at once.
- **Two data views**: **Garbage** (⇧G) tints by how deep the heap is,
  and **Refuse Cover** (⇧R) shows collection reach. Query reports a
  tile's pickup and pile size; hovering a depot previews its round.

### Changed
- The modifier vocabulary gains its eighth knob, `garbage.production` —
  its first addition since v0.46 — so a mod can tune how much refuse a
  city generates. Disposal buildings are content like everything else:
  a new `waste` block declares capacity, how much a building recycles
  away, and what it emits.

## [0.49.0] — 2026-07-24 · Core overrides & balance

Completes the modding editor (the last of its three parts): mods can now
add content, *and* change the content that's already there.

### Added
- **Retune anything from the Mods panel.** A new Overrides section lists
  every registered building and ordinance, and edits its balance
  numbers — a building's cost, upkeep, plant capacity and pollution,
  service or transit radius; an ordinance's monthly cost and each of its
  effect multipliers. Change the coal plant to §500 and the toolbar says
  §500; change an ordinance and City Hall says so immediately.
- **Edits are sparse patches, not copies.** A patch stores only the
  fields you actually changed, so retuning a price doesn't quietly
  freeze that building's capacity and pollution at whatever they were
  the day you edited — everything untouched keeps tracking the game.
  Each field shows its inherited value as a placeholder and stays blank
  until you override it, so "inherited" and "set to the same number"
  never get confused. **Reset** drops a patch and the core value returns.
- **A patch can restyle core content too** — give the coal plant one of
  v0.48's composed looks and the generic renderer draws it instead.
- **Overrides travel with the mod** through the same export/import, and
  stack predictably: the last enabled mod wins, disabling it reveals the
  one underneath, and disabling everything restores core.

### Fixed
- **Two packs defining the same content id no longer disagree with
  themselves.** Each content type resolved duplicates differently:
  buildings kept the last definition in the id lookup but listed *both*,
  ordinances kept the **first** while City Hall rendered two rows with
  the same checkbox target, and skins simply doubled in the Config
  picker. The registry now resolves every type through one id-keyed map
  before building any list, so the lookups and the lists always name the
  same winner. Reachable before only by hand-loading a pack through the
  debug hook; now that the panel can author overrides, it would have
  been reachable in normal play.

### Changed
- Overriding a building **cannot** move its slot — patches that try are
  refused with an error saying why. A slot is the identity every save
  stores, so redefining `core:coal_plant` keeps slot 5 and every
  existing city still opens. Nothing about saves or the simulation
  changed to support any of this; the sim already read its numbers from
  the registry.
- Nothing changes for a player with no mods enabled: with core alone
  there is exactly one definition per id, so deduplication is an
  identity operation, and the balance-parity test still pins every core
  number.

## [0.48.0] — 2026-07-24 · Building authoring

### Added
- **Author a building in a mod and build it in your city.** The Mods
  panel's mod editor grows a Buildings list beside Ordinances: give a
  building a name, pick what it is — decoration, power plant, service,
  or transit stop — and fill in only the numbers that kind of building
  needs. Set its cost and monthly upkeep, gate it behind an unlock
  condition, and require waterside siting if it needs a shoreline.
- **A look you compose rather than draw.** Size, height, hue,
  saturation, lightness, a roof shape (flat, parapet, gabled,
  sawtooth), and up to three rooftop props (water tower, AC unit,
  antenna, chimney, vent, tank, smokestack) — over a live preview that
  redraws as you drag. Because the look is data assembled from the same
  isometric primitives core buildings use, an authored building
  inherits skins, the render style, day/night, and zoom LOD without
  knowing they exist. There's no image to import and no pixels to push.
- **A Mods section in the toolbar**, built from the registry rather
  than a fixed list. An enabled mod's buildings appear as ordinary
  tool buttons with their cost, hidden until their unlock condition is
  met (with a "next at…" hint, like the power-plant flyout), and the
  section disappears entirely when no mod defines a building.
- **Authored buildings are simulated, not decorative.** A mod plant
  feeds the same pooled capacity as a coal plant; a mod fire station
  raises fire coverage in its radius and stops when it loses power; a
  mod transit stop takes cars off the road; upkeep hits the budget
  every month. This is the payoff of v0.46: the sim already read all
  of it from the registry, so none of it needed new simulation code.
- **Query names them** and lists what they do — or says plainly that a
  tile's pack isn't loaded, rather than drawing an unrelated house.

### Changed
- **Mod slots are now stable for the life of a session.** The registry
  keeps an id-keyed ledger of allocated slots instead of re-deriving
  them on every registration. Previously, removing one building from a
  mod shifted its siblings down a slot — and since a tile stores that
  number, every already-placed copy of a sibling would have silently
  become a different building. Adding, removing, disabling, and
  re-enabling now all leave a building's slot alone. Saves were already
  safe across sessions via the v0.46 legend; this closes the
  within-session gap the old `reindex` docstring flagged and deferred.
- Placement, power draw, and tile naming read the registry for
  mod-allocated slots. Core content is untouched: the placement table
  stays the sole authority for core tools (the transit stations declare
  a tool id for pricing but are still wizard-only), and core parks,
  lines, and pipes still conduct power without consuming it.
- Nothing changes for a player who never opens the Mods panel. No core
  building defines a look, so every core building draws through exactly
  the code it did before.

## [0.47.0] — 2026-07-23 · Mod manager

### Added
- **A Mods panel**, opened from the HUD beside City Hall and Config. The
  player can create a mod, rename it, enable or disable it, delete it,
  export it, and import someone else's — the first player-facing half of
  TODO #1 (the modding editor), and the first time a mod survives a
  reload.
- **Mods persist.** `localStorage['simcity.mods']` holds an ordered
  `Array<{ enabled, pack }>`, where a `pack` is exactly the v0.46 `Pack`
  format — so a mod is already shareable JSON, and the debug hook's
  "gone when you close the tab" limitation is retired. Enabled mods
  register with the content registry at boot, before City Hall builds
  its rows. A corrupt stored value starts empty rather than throwing.
- **A custom-ordinance editor.** Inside a mod, author an ordinance with a
  label, blurb, monthly cost, and any number of effects over the seven
  modifier knobs from v0.46, each shown under a plain-language name
  ("Industry pollution" for `pollution.industry`) with a multiplier — below
  1 reduces, above 1 increases. Ids are namespaced `${pack.id}:${slug}`,
  so one player's mods never collide with another's, and an id stays
  stable across an edit, so relabelling an ordinance the city has already
  enacted doesn't silently repeal it.
- **Export / import as JSON.** Export copies the pack to the clipboard
  (with a selectable-text fallback if the browser refuses); import takes
  pasted JSON through the same `validatePack` path the game's own content
  uses, and names every problem it finds — bad modifier key, duplicate
  ordinance id, an id already in your list — rather than failing mutely.
- **City Hall refreshes live** (`rebuildOrdinances()`). Enabling a mod or
  saving an ordinance shows it among the ordinances immediately, no
  reload; disabling takes it away again. This closes the v0.46 gap where
  panels never re-rendered newly-registered content.
- **`unregisterPack(id)`** in the content registry — removes a pack and
  reindexes. `'core'` is refused, so the game's own content is never
  removable.

### Changed
- Nothing about how the game plays for a player who never opens the
  panel. Custom ordinances ride the existing `modifier()` / `collectBudget`
  / `reviveOrdinances` machinery — no sim or save-format work — and a
  saved city whose mod is later disabled or missing still loads cleanly,
  its enacted flag dropped on load.

## [0.46.0] — 2026-07-23 · Modding hooks

### Added
- The game's own buildings, ordinances, and skins now load through a
  real **content registry** (`src/content/`): a parse → validate →
  register pipeline, exercised by our own content on every boot rather
  than only when a mod finally exists. Adding a building, ordinance, or
  skin is a data edit to a pack, not a multi-file balance-table change.
- **Pinned-slot identity.** Every building carries a stable string id
  (`core:coal_plant`) alongside the numeric `Zone` slot the sim and
  every save actually store. Core content pins its slots to today's
  historic `Zone` numbers forever; a mod building omits `slot` and gets
  one allocated from 1000 upward. Ordinance and skin ids are pinned
  outright (saves key `ordinances` by id; `localStorage` stores the
  active skin id directly), so the five core ordinance ids and three
  core skin ids are permanent.
- **Save legend.** Saves now carry an optional `zoneIds` map (slot → id)
  for every slot the city uses, so a save opens correctly even when a
  different set of packs is loaded later; an id the current session
  doesn't recognize clears just that tile rather than misrendering.
- **A tiny expression language** (`src/content/expr.ts`) for unlock
  conditions: number literals, `population`/`funds`/`jobs`/`month`/
  `year`/`eduLevel`/`demandR`/`demandC`/`demandI`/`brownouts`,
  `|| && == != < <= > >= + - * / %`, unary `-`/`!`, no functions, no
  strings, no `eval` — a stranger's pack can't run code through it.
  Replaces the old hardcoded `unlockPop` checks.
- **The modifier vocabulary** (`src/content/modifiers.ts`): seven named
  knobs (`pollution.industry`, `pollution.traffic`, `fire.ignition`,
  `transit.share`, `coverage.school`, `disaster.pandemicOdds`,
  `disaster.pandemicToll`) that ordinance `effects` may set, accumulating
  multiplicatively across every enacted ordinance. Replaces five
  hardcoded `if (city.ordinances.xyz)` branches scattered across
  `pollution.ts`, `services.ts`, `traffic.ts`, and `disasters.ts`.
- **Skins as data.** The three shipped city styles (Classic, Springfield,
  NYC) are now declarative HSL transforms (`SkinDef`) compiled back into
  the renderer's existing function shape, instead of hand-written
  palette functions — a mod skin is just another entry in the pack.
- **`window.__simcity.loadPack(jsonOrObject)`** — a debug hook, matching
  the existing `localStorage.simcity.nightlock` convention, that runs an
  untrusted pack through the same validate → register path and returns
  `{ ok: true }` or `{ ok: false, errors: string[] }` naming every
  problem found. See `docs/modding.md` for the full authoring guide,
  including a worked example pack and an honest accounting of what
  isn't built yet (no player-facing mod manager, no pack distribution,
  no authoring UI — that's TODO #2).

### Changed
- Nothing about how the game plays. This is a pure refactor + pipeline:
  every cost, upkeep, capacity, pollution figure, radius, transit
  share, and unlock threshold for every core building is byte-for-byte
  identical to before, held in place by a dedicated balance-parity test
  written from the old hardcoded tables before they were deleted. No
  player-visible behavior changed.

## [0.45.0] — 2026-07-23 · Interface: Utility Locate

### Changed
- The whole interface is redrawn in the visual language of the crews
  who mark up a real city. Panels are dark asphalt plates with square
  corners and hairline keylines; labels are set in a narrow signage
  face, and every number the player reads — funds, costs, tax rates,
  the budget report — is set in a monospace engineering face with
  tabular figures.
- **Tools carry a locate-code spine.** Every toolbar button gets a
  colored mark down its left edge following the APWA Uniform Color
  Code: red for power, blue for water, orange for transit, brass for
  civic services, white for terrain (the code's "proposed
  excavation"). Zoning reuses the RCI meter's own green/blue/yellow.
  The toolbar now reads as a legend instead of forty identical rows.
- **The armed tool is survey pink.** Selection moved off the old
  generic blue to the pink of temporary survey marking — the paint
  that means "proposed work here". The same pink runs through
  checkboxes, radios, sliders, and the keyboard focus ring.
- The top HUD is now a readout strip: micro uppercase labels over
  large mono values, divided by hairlines, with a deficit turning
  electric red. Navigation buttons recede so the numbers lead.
- Checkboxes and radios are custom-drawn, so they no longer punch
  bright white holes in the dark panels.
- The advisor tip strip drops its 💡 for a brass rule down its edge,
  matching the brass flags on open City Hall advisories.

### Fixed
- Interactive controls now show a visible keyboard focus ring; there
  was none before.
- `prefers-reduced-motion` is respected.

## [0.44.0] — 2026-07-21 · Night lighting

### Changed
- Night is now genuinely dark outside settled areas: a darkness layer
  covers the map and streetlights (every road), lit buildings
  (brighter with stage), civic buildings, and power plants punch
  warm pools of light through it. Unpowered or abandoned lots cast
  nothing — a brownout is visible from the night sky. Day/night
  toggle in Config as before.
- The render style now defaults to **Realistic** for new players
  (saved preferences unchanged), and Config picks styles with radio
  buttons.

## [0.43.0] — 2026-07-21 · Realistic render style

### Added
- A third render style joins Pixel and Smooth in Config:
  **Realistic** — soft two-layer shadows, walls that darken where
  they meet the ground, water grading from sandy shallows to dark
  depths, and a cool atmospheric haze over the distance. Pixel stays
  the default; the old Pixel-look preference migrates automatically.

## [0.42.0] — 2026-07-21 · Seasons

### Added
- The world follows the calendar: spring greens, deep summer, orange
  autumn woods over olive meadows, frost-pale winters — every tree
  and lawn turns together ("Seasonal colors" toggle in Config).
  Disasters follow the season too: tornadoes peak in spring,
  hurricanes in autumn, pandemics in winter. The soundtrack has been
  seasonal since v0.22 and now shares the same calendar.

## [0.41.0] — 2026-07-21 · Bundled controls

### Changed
- The five power plants collapse into one **Power Plant** menu and
  the five transit lines into one **Transit Line** menu (the zoning
  flyout pattern). Locked options no longer appear at all — each menu
  shows only what the city has unlocked, plus a hint naming the next
  unlock and its population.

## [0.40.0] — 2026-07-21 · Pixel look

### Added
- Pixel look (Config, on by default): the scene renders at a chunky
  internal resolution and upscales nearest-neighbor, turning the
  whole procedural drawing into sprite art — and cutting pixels
  rendered per frame by ~80%, a real win on older machines. Grass
  gains sparse pixel flecks, and close zoom draws discrete sprite
  window cells (a few lit after dark) instead of stripes. Works with
  every city style; turn it off for the smooth full-resolution look.

## [0.39.0] — 2026-07-21 · Config panel

### Changed
- The Display panel is now **Config**, and gains a Volume section:
  an Effects slider (tool clicks, event cues, ambient hum) and a
  Music slider, both persisted. M still mutes everything.

## [0.38.0] — 2026-07-21 · Unique businesses

### Added
- Named homage businesses flavor about 40% of developed commercial
  and industrial lots — Krusty Krab, Mo's Tavern, Mega Lo Mart,
  Los Pollos Hermanos, Dunder Mifflin Paper, WKRP Radio, Cheers,
  Trader Joe's, Bank of Simness, Massive Dynamic, Strickland
  Propane, Wonka Candy Factory, The Bluth Company, Initech, and
  Anthropic — matched to wealth and industry tier. Each hangs a
  colored sign (initials lettered at close zoom), and the Query tool
  names the business. Assignment is seeded and stable per lot.

## [0.37.0] — 2026-07-21 · Event sounds

### Added
- Events now sound like something: a two-tone tornado siren, a rising
  hurricane gale, somber pandemic bells, fire-ignition crackle, a
  collapse thud with a falling drone when a building is lost, and a
  power-down whine when the grid first browns out. All synthesized —
  no audio assets — and gap-limited so frequent events don't spam.
  M (mute) silences them like everything else.

## [0.36.0] — 2026-07-21 · Line vehicles

### Added
- Transit lines carry animated vehicles shuttling end to end (one per
  ~10 path tiles, up to 3): teal buses, streetcars in the line's
  color, white monorail capsules riding the beam, dark locomotives
  with a tinted car. Subway lines pulse a soft glow at their stops
  instead (they're underground). Vehicles pace with sim speed and
  pause with it.

## [0.35.0] — 2026-07-21 · Transit lines

### Changed
- Transit is now planned as **lines**: a wizard panel walks route
  drawing (click vertices, double-click to finish; surface modes
  can't cross water), stop placement on tiles touching the route
  (empty land or unbuilt zones), a six-color picker, and an atomic
  Done that charges track (§0/10/25/40/50 per tile by mode) plus
  station prices. Lines render as colored route bands (dashed over
  water) and live in the save (`city.transitLines`).
- The five direct station tools are gone; their toolbar buttons now
  open the wizard. Existing stations from old saves keep working.

## [0.34.0] — 2026-07-21 · Graphics pass

### Added
- Scene grounding: drop shadows under every structure, sand-and-foam
  shorelines on calm water edges, meadow-scale terrain shading in
  place of the per-tile checker, softened cliffs with strata and a lip
  highlight, and curb lines along road edges.
- Street-level detail: doors on houses and shops, entry bands on
  towers, storefront strips on commercial (with hanging signs up
  close), and window mullions at close zoom.
- Zoom-scaled detail (`detailLevel`): far views draw clean masses and
  roofs only (fewer draw calls exactly when the whole map is on
  screen); close views gain the extra trim.

## [0.33.1] — 2026-07-21 · Radius balance pass

### Changed
- Share-of-city distances now derive from the map size (`mapScaled`,
  GRID/64): service radii fire/police 8→12, school/health 10→15, bus
  5→8; the transit ladder re-bases to 10/13/16/20; park/water/forest
  land-value radii 3/2/1→5/3/2; the commute grace band and penalty
  ramp stretch 8/40→12/60. A station covers the same share of the
  96×96 map it covered on 64×64 — in the 10-year harness town, two
  fire stations cover 63% of zoned lots instead of 38%.
- Pollution spread deliberately stays absolute (radius 5): plumes sum
  across emitters, so scaling the radius inflates dense-district
  pollution quadratically. Siting rules (pump water range, hydro
  adjacency, hurricane surge) also stay physical.

## [0.33.0] — 2026-07-21 · Public health

### Added
- Public Health Campaign ordinance ($200/month): pandemics strike half
  as often, and while one rages the demand hit and the abandonment
  roll on uncovered homes are both halved. Old saves load with the
  campaign off.

## [0.32.0] — 2026-07-21 · Transit tiers

### Added
- Transit tiers: streetcar ($400, pop 5,000), monorail ($900, pop
  15,000), subway ($1,500, pop 30,000), and commuter rail ($2,500,
  pop 50,000) extend the bus — wider coverage radii (7/9/11/13 vs 5)
  and fewer cars per covered trip (0.4/0.3/0.22/0.15 vs 0.5). The
  worse-served end of a commute bounds the ride; Fare-Free Transit now
  halves whatever mode carries it. Stations draw grid power, show
  coverage halos, and get distinct glyphs.

## [0.31.0] — 2026-07-21 · Tiers of energy

### Added
- Tiers of energy: wind ($1,200, pop 2,000), solar ($2,500, pop 5,000),
  hydro ($5,000, pop 10,000, must sit beside water), and nuclear
  ($12,000, pop 25,000) join the coal plant, each with its own glyph,
  upkeep, and pollution profile (clean renewables; nuclear a trace).
- Plants now carry capacity (coal 240 consumers, wind 50, solar 100,
  hydro 280, nuclear 700) pooled city-wide: an overloaded grid browns
  out its farthest buildings, a new advisor tip flags it, and the
  City's growth stalls until more plants come online.

### Fixed
- The save reader's zone bound now tracks the end of the enum, so
  crafted or future saves with appended zones no longer silently drop
  them to empty land.

## [0.30.0] — 2026-07-21 · Per-tier visuals

### Added
- Per-tier visuals: building height now scales with RCI tier — §§§
  residential and commercial rise above their § neighbors (R 0.85/1.0/1.2,
  C 0.85/1.0/1.35), dirty industry sprawls low while high-tech rises
  (0.85/1.0/1.15). Signature accents make tier legible up close: §§§
  roofline trim and a top-band spire, § worn tar caps, grime bands on
  dirty industry, a cyan glass line on tall tech.

## [0.29.1] — 2026-07-21 · Full-map zoom

### Fixed
- Zoom-out now reaches far enough to fit the whole 96×96 map onscreen:
  the 0.5 minimum zoom relaxes on viewports too small to show the full
  grid (`clampZoom` scales the floor to the viewport).

## [0.29.0] — 2026-07-20 · Bigger map

### Added
- Bigger map: the city grid grows 64×64 → 96×96 (2.25× the land). Old
  saves load centered on the new map. Terrain features scale with the
  area; development pacing is unchanged (full sweep once per month).

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
