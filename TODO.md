# TODO — single source of truth for upcoming work

Ordered backlog. Work items top-to-bottom unless the user redirects.
When an item ships: mark it done here (move to Done), update CHANGELOG.md,
bump package.json version, and touch README/spec per CLAUDE.md.

## Backlog (in order)

1. **seasons** - color of vegetation and disaster type varies with season. Change soundtrack
2. **controls** - do not show options unless they are accessible. Bundle when appropriate (e.g. Transit -> bus | subway etc)
3. **Modding hooks** — data-driven building/balance definitions; folds in user-made skins from the skins item. 
4. **Modding editor** - UI for creating/drawing buildings, assigning properties to them, their local and city-wide impact & for editing sim behavior
5. **Region play** — multiple city tiles, neighbor deals (SC4 headline; deferred until single-city play is deep enough).
6. **Rewards** — special buildings the mayor's office can purchase after city milestones are hit (e.g. Ballpark -> Arena -> Stadium -> Colesium, Library, Museum, Monument, College -> University -> Research University), They occupy > square. They provide jobs. They mpact the surrounding area (+ and/or -, context dependent) and sometimes the whole city (e.g. Research university unlocks access to Cold fusion power plant)
7. **Garabage** - residents produce garabage. garabage pickup is a city service requiring a way to dispose of or process the trash. mayor can buy a trash dump. when city advances past some threshold of advancement, some trash can be recycled.
8. **Crime** - crime can happen anywhere, but is more common in certain areas and conditions
9. **traffic accidents** - occasionally a road is blocked due to an accident. Accident prob depends on traffic flow. reduce likelihood of accidends with driver education program. Reduce severity/duration of accident impact with fire depts with upgraded EMT program. animate accident and fallout.
10. **building safety** - buildings can collapse resulting in loss of building and casualties. Probability increases with age of building. Baseline: It is _very_ rare, and only becomes possible after building hits a predefined age (default = 100 years). Probability adjusted by: city program of a. requiring building permit (slight increase in zoning price) and b. City program to hire and deploy infastructure inspectors, who monitor buildings, roads, bridges, utilities. Create animation for building collapse. Once a building has been repaired, its base prob of collapse goes back to 0 and progresses again as if it were newly built

## Done

- **Config panel** — shipped v0.39.0 (Display renamed Config; Effects
  and Music volume sliders, persisted; README references updated).

- **Unique businesses** — shipped v0.38.0 (15 homage brands matched
  to tier via `sim/entities.ts`; seeded stable signs with initials;
  Query names the business; `variantAt` mirrors renderer variants).

- **Event sounds** — shipped v0.37.0 (synthesized cues via
  `EVENT_SOUNDS`/`playEvent` + pure `detectEvents` tick diffing:
  tornado siren, hurricane gale, pandemic bells, fire crackle,
  collapse thud, brownout whine; gap-limited).

- **Line vehicles** — shipped v0.36.0 (vehicles ping-pong each line:
  buses, tinted streetcars, elevated monorail capsules, locomotives;
  subway stops pulse; sim-speed-scaled clock; `render/linevehicles`).

- **Transit lines** — shipped v0.35.0 (wizard: route polyline with
  double-click finish, stops on touching tiles, six colors, atomic
  Done charging track + stations; colored route bands, dashed over
  water; `city.transitLines` in the save; direct station tools
  removed).

- **Graphics pass** — shipped v0.34.0 (scene grounding: shadows,
  sand shorelines, meadow terrain shading, soft cliffs, road curbs;
  street-level doors/storefronts/signage; `detailLevel` LOD scales
  rendering with zoom).

- **Radius balance pass** — shipped v0.33.1 (`mapScaled` derives
  share-of-city radii from GRID/64: services 12/12/15/15/8, transit
  10/13/16/20, land-value 5/3/2, commute grace 12/60; pollution spread
  and siting rules stay absolute — summed plumes scale quadratically;
  A/B harness: 63% vs 38% fire coverage from the same stations).

- **Public health** — shipped v0.33.0 (Public Health Campaign
  ordinance: half pandemic odds, half demand/abandonment toll while
  active; $200/month).

- **Transit tiers** — shipped v0.32.0 (streetcar/monorail/subway/rail
  above the bus: population-unlocked, wider radii, lower per-trip car
  shares via `transitShare`; worse trip end bounds the ride; Fare-Free
  Transit halves any mode; glyphs, halos, upkeep).

- **Tiers of energy** — shipped v0.31.0 (wind/solar/hydro/nuclear
  unlocked by population; pooled plant capacity with distance-order
  brownouts, brownout advisor tip; per-plant glyphs, upkeep, and
  pollution; hydro requires waterside siting).

- **Per-tier visuals** — shipped v0.30.0 (tier-scaled building heights
  via `heightScaleFor`; signature accents: §§§ trim + spire, § tar cap,
  dirty grime band, tech glass line).

- **Bigger map** — shipped v0.29.0 (96×96 grid, 2.25× the land; legacy
  64×64 saves embed centered; terrain feature counts scale with area;
  DEV_SLICE and the commute walk cap derive from GRID).

- **Area demand view** — shipped v0.28.0 (⇧D Demand data view: per-tile
  growth pressure via `demandReading` — green grow, yellow stall, red
  collapse, slate blocked by power/road).

- **Coverage halo** — shipped v0.27.0 (hovering with a service tool —
  fire, police, school, hospital, bus — previews the coverage footprint
  in the data-view green with falloff; `HALO_RADII` + `view.halo`).

- **Utility drag-drawing** — shipped v0.26.0 (power lines and pipes use
  the road line-drag: anchor, aim a rasterized preview — blue for pipes —
  release to build; `applyToolLine` in the sim layer).

- **Input-guard fix** — shipped v0.25.2 (global keys — camera pan, help,
  mute, Space pan — no longer fire while a form control is focused;
  shared `isFormControl()` guard on both window keydown listeners).

- **Controls revamp** — shipped v0.25.0 (zoning density flyout with
  per-zone memory, detachable toolbar sections, ⇧-key data views,
  Display panel with day/night lighting toggle defaulted off).

- **Visual variety** — shipped v0.24.0 (seeded building archetypes:
  composed silhouettes, roofs, props, palette families, window styles;
  farm layout variants; context-aware vehicle kinds; pedestrian variety).

- **RCI tiers & industry types** — shipped v0.23.0 (industry splits into
  agricultural/dirty/manufacturing/high-tech by education and pollution,
  farms at low density; R/C wealth tiers §/§§/§§§ from land value; gradual
  monthly re-tiering; per-tier capacity, tax yield, pollution, and
  rendering; City Hall make-up panel).

- **Adaptive music** — shipped v0.22.0 (procedural soundtrack: biome
  scale/root, seasonal mode/register, weather damping, growth-gated
  layers 70→110 bpm, industrial minor color, disaster duck; City Hall
  toggle).

- **Disaster visuals & animation** — shipped v0.21.0 (rubble trails that
  block rebuilding and decay over months, tornado debris + dust ring +
  storm light, hurricane wind streaks + lashed trees + surge foam,
  pandemic quiet streets with masked walkers).

- **Skins/styles** — shipped v0.20.0 (Classic / Springfield / NYC,
  procedural restyling via render/skins.ts; user-made skins land with
  modding hooks).

- **Mountains + desert** — shipped v0.19.0 (elevation to 5 with rock/
  snowcaps, guaranteed peak per map, desert biome with oasis).

- **Weather** — shipped v0.18.0 (seasonal clear/cloudy/rain/snow, fire +
  traffic effects, HUD emoji).

- **Disasters** — shipped v0.17.0 (tornado, hurricane, pandemic; random
  strikes + City Hall summons).

- **Control room** — shipped v0.16.0 (tool shortcuts, collapsible toolbar
  groups, draggable panels, adjustable road line tool).
- **Day/night cycle** — shipped v0.15.0 (90s visual cycle, night wash,
  glowing windows, streetlights).
- **Water utility** — shipped v0.14.0 (powered lakeside pumps, pipes +
  road mains, watered flag gates stage 3+).
- **Ordinances + advisors** — shipped v0.13.0 (City Hall panel: full
  advisor list + 4 ordinances with sim hooks).
- **Congestion + buses** — shipped v0.12.0 (capacity-based route costs,
  rerouting, bus stops halving covered commutes; subway not built —
  re-add if wanted).
- **Terrain elevation + bridges** — shipped v0.11.0 (hills 0–3 with cliffs,
  raise/lower tools, roads climb 1 level max, bridges over water).
- **Health services + spreading fires** — shipped v0.10.0 (hospital as 4th
  service gating stage 5+; fires ignite, spread, and are fought by fire
  coverage; meteor/tornado disasters still unbuilt — re-add if wanted).
- **Sound effects** — shipped v0.9.0 (procedural Web Audio cues per tool,
  ambient population hum, mute on M, `ui/sound.ts`).
- **In-game help/tips** — shipped v0.8.0 (help panel on H/?, contextual
  advisor tip bar driven by `sim/tips.ts`).
- v0.7.0 and earlier: see CHANGELOG.md.
