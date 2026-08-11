# TODO — single source of truth for upcoming work

Ordered backlog. Work items top-to-bottom unless the user redirects.
When an item ships: mark it done here (move to Done), update CHANGELOG.md,
bump package.json version, and touch README/spec per CLAUDE.md.

## Backlog (in order)

1. **Region follow-ups** — the layer is in but three things it implies are
   not. *Terrain does not line up across a border*: `generateTerrain` grows
   blobs outward from random seed points rather than sampling a field, so a
   river cannot simply continue into the next tile — matching them means
   rewriting terrain generation onto a sampled field, which is its own piece
   of work. *Commuters stop at the map edge*: a border crossing feeds demand,
   not the road network, so nobody actually drives to the job next door.
   *Water is not tradable*: `updateWater` is an unbounded flood fill from any
   working pump, so one pump waters a whole city and there is nothing to sell
   — water deals need a water capacity model first. Also: region size is fixed
   at 3×3, the region map is a list of cards rather than a drawn map of the
   land, and a city can only be entered from that screen.
2. **Modding: the parts the editor doesn't cover yet** — freehand/pixel
   drawing of buildings (today's look is composed from a mass, roof and
   props, not drawn), authoring multi-tile buildings (the *engine* now
   supports any footprint up to 6×6 — the building editor just can't set
   `size` yet, and the generic renderer draws one mass rather than
   composing across a block), modding the growable R/C/I ladders
   (population/jobs tables, stage heights, archetypes are still
   hardcoded), and sharing beyond copy-paste JSON (URL-encoded or
   hosted). Low priority — the editor is usable without them.

3. **Rewards follow-ups** — the catalogue is in but a few things it
   suggests are not: rewards ignore road access entirely (a stadium in
   the wilderness works as well as one downtown), the sport ladder has no
   sense of events or crowds over time, nothing yet consumes the
   `culture` or `sport` grants, and a reward cannot be relocated — only
   razed and rebuilt at full price. Also: rewards are never destroyed by
   fire, collapse or disaster, which is generous.

4. **Road ladder follow-ups** — carriageways, lane discipline and the
   frontage rule landed in v0.60.0; what is missing now is the *interchange*.
   There are no on/off ramps and no grade separation, so a street meets a
   motorway at grade and the painter simply leaves the mouth open. A motorway
   also carries no noise or blight along it, which is the other half of "no
   front doors". Also worth a look: a wide class refuses tiles it cannot take
   rather than warning that the corridor is partly blocked, and a corridor
   reads as a junction where it bends (`corridorAt` finds no longer axis
   there), so a motorway curve is a plain sheet of asphalt.

5. **Touch follow-ups** — the map is playable by finger now, but not
   everything is: rotating the view (Q/E) has no gesture, so a two-finger
   twist is the obvious gap; the transit wizard still finishes on a
   double-click, which touch reports unreliably; Query needs the tool armed
   rather than offering a long-press; and the compact breakpoint is a width
   test, so a short landscape phone gets the roomy layout it cannot fit.
   Worth a pass on hit-target sizes in the drawer too — the tool rows are
   sized for a cursor, not a thumb.

6. **Events** - add other events like floods, meteor showers, blizzards.

7. **Streets** - Some real cities make extensive use of bikes for commuting.
   Devise a way to incorporate biking as a major means of transportation. 
   Also, allow mayor to designate that some roads/areas be free of motor vehicles

8. **Graphics follow-ups** — the pipeline is in but a few things it makes
   possible are not: shadows fall on the ground only and never onto another
   building's wall; water carries no reflection of the waterfront; weather
   doesn't lie on the ground (a winter map has no snow cover, and rain
   leaves no wet asphalt); multi-tile rewards and civic buildings still draw
   live rather than baked, and the civic set has not had the typology and
   facade pass the growables just got. The ground pass is the dominant
   per-frame cost — baking ground *chunks* is the obvious next step. The
   camera turns in quarter steps only; the snap is instant, and a short
   cross-fade would take the jolt out of it. The rotation sweep is now
   *done* — rewards, roads, growables, civic, blocks, ground, scenery and the
   transient markers are all held to painting the same picture (or at least
   sane geometry) at all four quarters, and it found four real bugs on the way
   in v0.60.1. What is still unswept is the *composed* scene rather than the
   individual painters: overlays and data views, the transit line bands and
   line vehicles, disaster effects, and the halo/cursor layer.

9. **City styles** — one distinct look per style, beyond the palette shifts
   the three skins do today: Simpsons Springfield, present-day Hong Kong,
   and so on. The material system is the hook — a style should be able to
   choose wall materials, roof kits, road markings, vegetation and sky, not
   just remap hue and saturation.

10. **Vehicles: realistic movement and 3D orientation** — cars that steer
    through turns with real headings (sprite orientation per direction of
    travel, not axis-aligned), lane-change easing, plausible acceleration.
    (User-requested 2026-08-10.)

## Done

- **Smoke over the works, and a city that moves at rest** — shipped v0.61.0
  (an ambient clock threaded through the standing render pass so a settled
  city keeps breathing: grey-brown plumes on stage 2+ dirty/manufacturing
  industry, the coal plant and the incinerator, scaled with the tile's own
  pollution; the nuclear plant's cooling towers vent slow white steam in
  place of the two static puffs baked into the old sprite; low-rise homes
  with a chimney breathe a thin hearth wisp in winter; stage 6+ towers carry
  unsynchronized red anti-collision beacons, brighter at night; the School's
  flag actually ripples now instead of sitting painted on its pole; about a
  third of parks gained a looping fountain. Smoke leans downwind and lies
  flat in a hurricane, dims at night, and simplifies to two puffs at far
  zoom for industry/plants only; unpowered and abandoned lots never smoke;
  the clock keeps a slow drift while paused. Emitter positions —
  `stackTips`/`hearthTip`/`placeRoofProps`/`chimneyHeight` — are pure
  functions shared with the sprite bake, so a plume rises from exactly
  where the stack was painted at all four camera quarters; the rotation
  sweep now covers the new painters too.)

- **The rest of the rotation sweep** — shipped v0.60.1 (widening the
  strict-context sweep past the reward set found three live bugs and one
  latent one, all the same mistake: a fixed grid corner index standing in for
  a screen position. A house's garden path ran to the wrong corner and its
  parking bays hatched along a far edge; a fire station's engine bay doors
  ended up round the back; a farm's furrows were struck from a centre that is
  only the centre at rest; and a civic lot carrying an industry tier indexed
  off the archetype table entirely. The near corner is measured now, and at
  rest it is still corner 2, so the unrotated view is unchanged. The stub
  context records a trace, so "paints the same picture" is a thing a test can
  check.) Remaining gaps in backlog #8.

- **Regions, and a front door** — shipped v0.60.0 (a 3×3 grid of city tiles
  sharing one seed and one biome; a launch screen offering a region, a single
  city, or the ones you already have, so the game no longer generates a map
  before you have chosen anything; neighbour contracts for power and refuse,
  held by the region and read by whichever city is loaded, so the books
  balance across the region whichever city you sit in and a seller that loses
  its capacity has its contracts broken rather than paying out forever; border
  crossings where two cities' roads meet at a shared edge, lending 35% of each
  one's jobs and workers to the other's demand; a Neighbours panel, a
  Neighbours line in the budget, and region export/import as one file. Reaches
  the sim through one derived `CityState.neighbors` block and four one-line
  hooks.) Follow-ups in backlog #1.

- **Highways that are carriageways** — shipped v0.60.0 (a wide road class was
  a band of independent, isotropic tiles, so the painter read every interior
  tile as a junction — crosswalk ladders and a traffic signal on every square
  — and the automata random-walked sideways across it: a car park with a road
  ladder's price tag. `sim/corridor.ts` derives axis, width and lane from
  local same-class adjacency, and from that come lane dividers, edge lines, a
  double yellow or a planted central reservation, hard shoulders and barriers,
  directional wheel-track wear, and cars that follow their lane in the
  direction their side of the centreline dictates. Also makes the Highway's
  own "no front doors" blurb true — a motorway is no longer an address, so
  lots behind one need a frontage street. MAX_CARS 40 → 70.) Follow-ups in
  backlog #4.

- **Quarter turns, and buildings that differ** — shipped v0.59.0 (Q/E swing
  the view 90° again, and the whole baked pipeline survives it: a tile still
  projects to the same diamond so ground and road sprites are reused, the
  road connectivity mask is *rotated* rather than re-baked, and the sun stays
  fixed to the screen so no building needs re-baking — turning costs one
  re-sort of the paint order. Buildings gained *plans*: extents along each
  grid axis and cut corners, so the city has slabs, terraces, wings and
  chamfered towers instead of one box resized; `prism()` takes any convex
  footprint. Facades — cornices, string courses, retail podiums, balconies,
  bay windows, pilasters, wall air conditioners, hung signage, fire escapes —
  plus hipped and mansard roofs, and an archetype table rebuilt around real
  typologies. Streets got lamp standards, traffic signals and parked cars;
  vehicles got body styles from hatchback to articulated rig. Fixed: a low
  podium painted its roof cap across the tower standing on it, because
  sub-masses sorted by their south corner rather than their centre.)
  Follow-ups in backlog #8 and #9.

- **Graphics overhaul** — shipped v0.58.0 (the whole rendering pipeline
  rebuilt around one trade: the camera no longer rotates, which lets every
  building, tree and road tile be baked once into a sprite and blitted
  afterwards, and lets the sun be a real direction instead of a screen-space
  fudge. Buildings gained materials — brick, render, concrete, glass, metal,
  timber, stone — with courses, panel joints, sheen and real windows drawn in
  *wall space*, plus tower crowns, parapets and roof kit; every mass throws a
  cast shadow that lies along the ground and lengthens with height. Roads are
  painted from their connectivity mask with footways, kerbs, lane markings
  and crosswalks; ground colour comes from noise rather than sine waves and
  every tile takes a texture blit; water is depth-shaded with crests, glint
  and a graded shoreline; cliffs get strata; trees are baked sprites with
  layered canopies. A finishing pass adds sky, haze, bloom, grade and
  vignette, and night is properly dark with lit windows carrying the light.
  Measured **33 ms/frame against the old renderer's 48 ms** on a 180k city.)
  Follow-ups in backlog #8 and #9.

- **Touch and small screens** — shipped v0.57.0 (one finger builds, two
  fingers pan and pinch-zoom, and a second finger cancels a pending build;
  on-screen +/− zoom, since the wheel was the only zoom in the game; a
  compact layout below 820px that drawers the toolbar behind ☰, drops the
  minimap, wraps the HUD and turns panels into bottom sheets; all zoom paths
  unified on `zoomAbout()`). Follow-ups in backlog #5.

- **Public release** — shipped v0.56.0 (the game is playable from a link at
  steamgromit.github.io/simcity-web with no install; `base: './'` makes the
  build location-independent; a GitHub Actions workflow type-checks, tests and
  builds on every push to `main` before publishing `dist/` to Pages, so a red
  test blocks the deploy; MIT license and an EA/Maxis disclaimer). No
  simulation or interface behavior changed.

- **Rewards & named cities** — shipped v0.55.0 (ten milestone-unlocked
  reward buildings on 2×2–5×5 footprints, with jobs, an `amenity` block
  mirroring `blight`, and civic `grants` that let a Research University
  unlock the Cold Fusion Plant; multi-tile buildings throughout the sim —
  one upkeep, one coverage source, razed as a unit — with area effects
  measured from the whole block; named save slots with rename, export,
  import and delete, and a ~30× smaller save format that makes keeping
  several cities possible). Follow-ups in backlog #3.

- **Road ladder & interface overhaul** — shipped v0.54.0 (Street →
  Route → Boulevard → Highway → Highway II, unlocked by population and
  drag-laid as corridors 1/2/3/4/6 squares wide, with per-class traffic
  capacity, cost and upkeep scaled off `core:road`, and boulevard
  medians that nothing drives on; a File menu gathering New/Save/Load/
  Mods that opens on launch; one relocatable event feed — ticker or
  newest-first log — replacing the toast and the advisor strip; close
  buttons on every modal plus open-panel rings on the control bar; City
  Hall's advisor board removed; growth-gated tool families collapsed to
  one button until there's a real choice; twenty configurable chart
  series with per-capita and scrollable time ranges; placement halos
  recoloured off the data-view green with a blight ring). Follow-ups in
  backlog #4.

- **Building safety** — shipped v0.53.0 (buildings track their age; past
  100 years an unmaintained one carries a tiny, age-growing monthly
  chance of collapsing into rubble with casualties; Building Permits — with
  a zoning surcharge — and Infrastructure Inspectors cut the odds and
  compound; a Repair tool resets a building's age; a Building Age view
  ⇧A, Query age/condition rows, an advisor tip, a dust marker and a
  rumble; `collapse.rate` is the twelfth modifier knob). Very rare, late,
  never destroys on a normal save, not a growth gate. Roads/bridges/
  utilities aging is a noted follow-up — this pass collapses buildings only.

- **Traffic accidents** — shipped v0.52.0 (busy roads throw a crash that
  blocks the tile for a few ticks; the congestion-aware router detours
  around it, so redundant routes shrug it off and a single artery stalls
  until it clears; Driver Education makes them rarer, the EMT Program plus
  fire coverage at the scene clears them faster; a crash marker, a
  Traffic-view red flag, a Query row, an advisor tip and a cue;
  `accident.rate` and `accident.duration` are the vocabulary's tenth and
  eleventh knobs). Transient, never destroys, not a growth gate.

- **Crime** — shipped v0.51.0 (a per-tile crime rate from poverty, density,
  joblessness and blighted neighbours, held down by police coverage — which
  finally does something; drags land value in a feedback loop and slows
  growth, but is deliberately NOT a growth gate; Prison and Neighborhood
  Watch content, a Crime ⇧C view, incidents with a marker and cue, advisor
  tips splitting unpoliced hotspots from a stretched force; `crime.rate` is
  the vocabulary's ninth knob and `blight` a reusable "ugly neighbour"
  content block). On an existing save, poor under-policed districts cool
  off — a soft pressure, not a wall.

- **Garbage** — shipped v0.50.0 (developed lots produce refuse monthly;
  collection is a coverage service *and* a citywide capacity constraint,
  so "nothing reaches this street" and "the city is over capacity" are
  distinct failures with distinct advisor tips; Landfill / Incinerator /
  Recycling Centre ladder in a Waste bundle, plus a Recycling Program
  ordinance; heaps pollute, devalue and stall growth, and clear
  gradually; Garbage ⇧G and Refuse Cover ⇧R views; `garbage.production`
  is the modifier vocabulary's eighth knob and `waste` a new content
  block). **Stage 4+ now requires collection**, so existing cities stall
  until they build a dump — the same bargain water made in v0.14.

- **Modding editor** — shipped across v0.47.0–v0.49.0 in three parts.
  *Mod manager* (v0.47.0): the Mods panel — create/rename/enable/disable/
  delete, export and import as JSON, persistence in
  `localStorage['simcity.mods']`, a custom-ordinance editor over the seven
  modifier keys, live City Hall refresh. *Building authoring* (v0.48.0):
  author a placeable building — category and its numbers, cost, upkeep,
  unlock, waterside siting, and a composed look with a live preview; a
  generic renderer draws it and a toolbar Mods section places it; slot
  allocation became stable per id, closing the within-session remap hazard
  the v0.46 `reindex` docstring flagged. *Core overrides* (v0.49.0): sparse
  patches retune any registered building or ordinance from the panel, one
  definition per content id (fixing a three-way disagreement between
  buildings, ordinances and skins about duplicates), slot identity never
  disturbed. What's left is tracked as backlog #7.

- **Modding hooks** — shipped v0.46.0 (content registry with pinned-slot
  identity for buildings + a save legend, an expression language for
  unlock conditions, a seven-key modifier vocabulary for ordinance
  effects, skins as data, and a `window.__simcity.loadPack` debug hook;
  `docs/modding.md` is the authoring guide). No player-visible behavior
  changed — a balance-parity test guards every core number. Leaves for
  #1 (the mod editor): a player-facing mod manager, pack distribution/
  sharing, and an authoring UI — today a pack only loads via the debug
  hook for the current tab, and the existing panels (toolbar, City Hall,
  Config) don't yet render newly-registered content. Growable R/C/I
  ladders (population/jobs tables, stage heights, archetypes) stayed
  hardcoded this pass — out of scope.

- **Interface: Utility Locate** — shipped v0.45.0 (APWA locate-code
  spines on every tool, survey-pink selection, narrow signage face +
  mono engineering numerals, HUD readout strip, custom checkboxes/
  radios, focus rings; `data-tool`/`data-bundle`/`data-view` hooks
  added in `toolbar.ts` to drive the spines).

- **Night lighting** — shipped v0.44.0 (darkness layer with punched
  glow: roads/buildings/civic/plants light radii; unpowered lots stay
  dark; realistic default style; Config style radios; nightlock debug
  hook).

- **Realistic render style** — shipped v0.43.0 (`renderstyle.ts`
  three-way Pixel/Smooth/Realistic; soft shadows, wall AO, interior
  water depth, atmospheric haze; legacy pixel pref migrates).

- **Seasons** — shipped v0.42.0 (seasonal vegetation tints via
  `render/seasonfx.ts` + shared `seasonOf`; Config "Seasonal colors"
  toggle; seasonal disaster odds — tornado spring, hurricane autumn,
  pandemic winter; soundtrack already seasonal since v0.22).

- **Bundled controls** — shipped v0.41.0 (Power Plant and Transit
  Line flyout menus; locked options hidden with a next-unlock hint;
  toolbar shrinks by eight buttons).

- **Pixel look** — shipped v0.40.0 (nearest-neighbor low-res render
  pipeline behind a Config toggle, default on; grass flecks; sprite
  window cells at close zoom; ~80% fewer pixels per frame).

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
