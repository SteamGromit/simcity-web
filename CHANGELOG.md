# Changelog

All notable changes to SimCity Web. Format follows
[Keep a Changelog](https://keepachangelog.com); versions are sequential
feature drops rather than semver promises.

## [0.69.0] — 2026-10-25 · Water has a capacity, so it trades

Backlog #1, last of three parts. The third utility now runs short like the
other two, which is what makes it worth buying.

### Added
- **Water capacity** (`sim/water.ts`). A working pump (powered, open water
  within 2 tiles) waters `WATER_PER_PUMP = 200` consumer tiles; the
  consumers are the tiles power bills, minus the pumps themselves.
  `updateWater` is now the pooled flood fill `updatePower` is: water is
  handed out in distance order from the pumps until the city-wide pool runs
  dry, a dry consumer still conducts so the block behind it is not cut off,
  and `city.dryouts` counts what went short. A coal plant makes 240 for
  §150 a month; a pump makes 200 for §25, because the real cost of a pump is
  the lakeside site. A tip says so when the pumps are at capacity.
- **Water contracts.** `'water'` is the third `DealKind`, priced at
  `WATER_PRICE = 0.12` a tile-month (a pump's 200 tiles cost §25 to own,
  §0.125 a tile, so buying lands just under owning, minus the site). Spare
  water is mirrored on the region tile at save, the Neighbours panel offers
  it beside power and refuse, the region map lists it, and pruning,
  balancing and revival need no new rules beyond the kind.
- **Visit.** Each founded neighbour's block in the Neighbours panel has a
  Visit button: the current city is saved and the neighbour's opens, without
  going out through the region map.

### Changed
- **Existing saves keep their buildings but may run dry.** A city that got
  by on one pump now has that pump's 200 tiles wet and the rest dry, which
  stops them growing past stage 2 (`servicesAllow`) but does not shrink
  them. Build pumps, or buy water.

### Compatibility
- `dryouts` defaults to 0 in an older save; `spareWater` to 0 on an older
  region tile.

## [0.68.0] — 2026-10-25 · Commuters cross the border

Backlog #1, second of three parts. A joined border was a number in the
demand equation; now it is a place on the road network.

### Added
- **Gates.** Where two cities' roads meet at the same border position, the
  region now records a *gate* on each side (`NeighborState.gates`, derived
  on every sync and never saved). A connected neighbour's lent jobs and
  workers (still 35% of its totals) are split evenly across the gates on
  that border.
- **Commuting through a gate** (`sim/traffic.ts`). The commute fields seed
  each gate at `BORDER_TRIP = 12` road steps, the drive into the next town,
  so a residence whose nearest work is across the border reads a finite
  commute (its road steps to the gate plus 12), can develop on the strength
  of the neighbour's jobs, and loads every road tile on the way to the
  crossing exactly as a trip to a local job does. The neighbour's workers
  come in the other way: from each gate, one car per `WORKERS_PER_CAR = 50`
  lent workers drives down the local-jobs field to the nearest work here
  (a developed residence tile, which holds 30–70 workers at the stages most
  of a city sits at, puts one car on the road, so inbound and outbound are
  on one scale). Bus coverage at both ends cuts the cars the same way it
  does for residents. A crash on the crossing closes the gate until it is
  cleared.

### Fixed
- **Closing the tab on the region map could blank the first city.** Opening
  a region left the current city as whatever was loaded before (at startup,
  a placeholder) and the tile pointer at the first tile; a save on the way
  out of the layer or on `pagehide` then wrote that placeholder over tile
  A1's real city. Region saves now happen only while a region tile's city
  is actually being played.

### Unchanged
- Demand itself: the 35% border shares feed it exactly as before. What is
  new is that the people implied by those shares are now on the road.

## [0.67.0] — 2026-10-25 · Region terrain: one landscape, drawn

Backlog #1, first of three parts. Terrain generation was rewritten so a
region's cities share one piece of country.

### Added
- **Terrain is a sampled field** (`sim/terrain.ts`). The old generator grew
  blobs outward from random points, so two neighbouring region tiles could
  not agree about the land between them. The land is now a pure function of
  a world coordinate: relief from low-frequency noise, a **river** that runs
  edge to edge across the whole region (three temperate regions in five get a
  tributary that ends where it meets the main river), one guaranteed lake basin and
  one true snowcapped peak per city tile placed well inside it, noise lakes
  on flat ground, and forest that thickens beside water and thins above the
  tree line. A city on a region tile samples the field at its offset, so
  the river continues across the border into the next city.
- **The region map is a map.** Each tile card draws its land behind the
  text, sampled from the same field without loading a city, so the cards
  laid edge to edge are one drawn landscape with the river running card to
  card. Roads that reach a border are ticked grey; a joined border is
  ticked gold across both cards. A founded city shows a settlement mark
  sized by population.
- **Region size.** The launch screen offers 2×2, 3×3 and 4×4 regions. A
  bigger region's river is longer and wanders more.

### Changed
- **Single-city maps changed character.** A new single city is a 1×1 world
  and rolls for a river like a region does, so most now have one, with
  bridges to pay for; deserts roll one with probability 0.3 and never a
  tributary. Water covers 4–10% of a
  temperate map (it was 1–3%) and forest 4–16%; deserts are sparser than
  before. The guard seeds in the terrain tests keep their floors.
- `newCity(seed, biome, place?)` takes an optional placement
  `{ world, col, row }`; `mulberry32` moved to `sim/rng.ts` (still
  re-exported from `sim/city.ts`).

### Compatibility
- Existing saves keep their tiles untouched. A city founded in an older
  region on the blob generator will not match a neighbour founded now, and
  its card on the region map draws the field rather than the blobs it
  holds. No migration; the three cities so founded are the owner's.

## [0.66.0] — 2026-09-25 · Realism, part three: civic and rewards, farms, water, night

The last of three drops toward a SimCity 4 standard of detail. Nothing in
the sim moved.

### Added
- **The civic set, rewards and parks bake once.** Fire, police, school,
  hospital, prison, every transit stop, the waste and power plants, the
  ballpark through the colosseum, library, museum, monument, the campuses,
  the fusion plant and every park were drawn live, `prism` windows and all,
  every frame. Each now bakes into a sprite keyed on zone, power state,
  size, detail and skin (parks on season too), takes the same photographic
  grain the growables do, and civic windows light up after dark through a
  glow bake of their own. The Library and Museum colonnade now stands on the
  edge nearest the viewer at every quarter turn rather than a fixed corner.
- **Farms wear the season** — tilled brown in spring, green crop rows in
  summer, harvest gold in autumn, pale stubble in winter — with a
  post-and-rail fence along the street, a tractor in the field on some, and
  a pond beside the coop. Farm sprites key on the season; factories do not.
- **Pipe runs on the works.** A dirty works' two stacks are joined by a pipe
  along the roof; a manufacturing shed's stack runs one back across it.
- **Water with caustics and a sky in it** (`render/ground.ts`). Eight frames
  of thin, wandering light lines from a per-pixel noise field cycle across
  every water tile out of phase with its neighbours, over a fill that is a
  touch lighter toward the top of the tile — the sky's reflection — and the
  old glitter.
- **The waterfront reflected** (`render/reflections.ts`). A lot or civic
  building whose screen-near side stands on water is mirrored into it: the
  same baked sprite flipped about its base line, clipped to the water it
  fronts, faded and washed blue. Recomputed only when the coast, the
  built-up set or the camera quarter moves.
- **The night pass, finished.** A deeper wash (alpha 0.58 at midnight, from
  0.5), a darker darkness layer, half the night bloom, a growable glow
  capped at 0.5 and curtain-wall panes at 0.6 so a glass tower no longer
  whites out, warm sodium pools on the road under every lamp standard, and
  shopfronts that spill light onto the pavement. Every night addition is
  gated on `nightActive()`, so a day frame is untouched.

Measured on the 76,000-population demo city at zoom 1: ground 8.3 ms
(reflections included), shadows 2.5, scene 5.3, finish 2.7 — 19 ms against
the 36 ms budget; the scene pass halved once the civic set and rewards
stopped drawing live.

## [0.65.0] — 2026-09-25 · Realism, part two: lots, ground, roads, trees

The second of three drops toward a SimCity 4 standard of detail: the half of
the picture v0.64 left as a green diamond. Nothing in the sim moved.

### Added
- **Plots** (`render/lots.ts`). Every developed lot stands on a laid-out plot
  that faces its street: a sidewalk along the road edge, then by family — a
  lawn with mow lines, a concrete driveway to the garage with a car on it
  more often than not, a path to the door, a flower bed, a mailbox, a picket
  fence or a hedge down one side, shrubs and yard trees (suburban houses);
  paving with kerb, planters and a bin store, a van at the kerb (urban
  low-rise); a paved plaza with planters, benches and a lamp (towers); a
  striped parking lot with cars, a pylon sign and a dumpster enclosure
  (strip retail); a fenced yard with a truck at the dock, pallets, a
  container and a tank on asphalt or gravel (industry); crop rows and a
  fence (farms). Desert cities get gravel xeriscape in place of lawn. The
  layout is a pure function of the lot and which screen side its road is on,
  and it turns with the camera — rotate the view and the driveway still
  meets the street. Each plot bakes once as its own tile-sized sprite, laid
  down in the ground pass so cast shadows fall on it; yard trees stay live so
  they wear the season.
- **Ground with tone** (`render/ground.ts`). A per-pixel noise field painted
  into every ground sprite darkens hollows and patches at a scale a tile fill
  cannot carry, on meadow, dune, rock and snow alike; meadows got half as
  many tufts again, a third of them sunlit.
- **Trees from leaf dabs** (`render/scenery.ts`). Broadleaf crowns are dozens
  of leaf clusters over a dark core, lit on the upper left and shaded on the
  lower right with a little dapple; species now: oak (wide), maple (round,
  red in autumn), birch (narrow, pale flecked trunk), pine (tall, sparse,
  trunk showing), spruce (dense to the ground), cypress (a narrow flame), and
  the palm and dead tree as before. A forest tile carries four or five trees
  of mixed size over a bed of undergrowth.
- **Streets with a surface** (`render/roadart.ts`). Asphalt grain, tarmac
  patches, a seam down every straight run and the occasional manhole; kerbs
  with a face in shade under the nosing; paving joints across every footway;
  crosswalk rungs worn unevenly.

### Fixed
- Two sprite-key collisions that had been there since the sprite cache
  arrived: spring and summer trees and hedges shared a sprite (both seasons
  start with an s), as did desert and dirt ground.

### Changed
- The old tinted "apron" under a lot and its live yard props are gone; the
  plot replaces both.

Measured on the 76,000-population demo city at zoom 1: ground 8.9 ms,
shadows 2.5, scene 10.7, finish 2.8 — 25 ms against the 36 ms budget. A
first cut put the ground at 20 ms and the scene at 18 (a composite-mode
switch per tile and a fresh layout per lot per frame); both were fixed
before shipping.

## [0.64.0] — 2026-09-25 · Realism, part one: materials, light, windows, roofs, shadows, grade

The first of three drops toward a SimCity 4 standard of detail. The bake-once
pipeline is untouched; what gets painted into every sprite is replaced. Nothing
in the sim moved.

### Added
- **A swatch library** (`render/palette.ts`). Thirty-two real-world wall
  materials — red, brown, buff, painted and grey brick; limestone, sandstone,
  granite, brownstone; cream, peach, sage, terracotta, white and grey render;
  white, grey, blue, olive and barn-red siding; precast, board-marked and
  painted concrete; blue, green, bronze, silver and black glass; aluminium,
  corrugated, corten and white metal panel — each with its own trim, glazing
  and roof deck, and capped at 28% saturation (three exceptions). Every
  archetype names the swatches it may be built of, so a brick walk-up is
  brick and a glass tower is glass; the old hue-delta palettes are gone.
  Skins still remap the body colour, and the trim and glass follow it.
- **Windows that are objects** (`render/windows.ts`). Each pane has a frame, a
  dark head reveal, a lit jamb, a sill, a sky reflection that brightens toward
  its top, and a state from the seed — clear, blinds down, curtains, dark, or
  lit by day; a mullion cross once the pane is wide enough. Ribbon windows are
  a continuous glazed band with spandrels; curtain walls are one sheet of
  glass with a reflected horizon, the dark bands of the buildings opposite,
  mullions every bay and a glint down the sunlit edge.
- **Roofs that are roofs** (`render/roofs.ts`). Gables and hips overhang the
  wall on an eave with a fascia and throw a band of shade down the wall;
  slopes carry shingle courses in one of eight roofings (asphalt, slate,
  terracotta, concrete tile, three standing-seam metals); the ridge has a cap,
  a gable end shows the wall material under a bargeboard, about a third of
  roofs get a dormer, chimneys got caps. Flat roofs are a speckled gravel or
  membrane deck with a drain stain and a parapet that shades it; the plant on
  them gained fan discs, ducts, hatches, four-legged tanks with hoops, cowled
  vents and ladders.
- **Soft shadows** (`render/shadows.ts`). Every cast shadow goes into one
  half-resolution layer per frame, which is blurred once into a penumbra and
  *multiplied* onto the ground, so a tower's shadow darkens the grass texture
  and the road markings rather than lying on them as a grey card. Where the
  browser lacks canvas filters the layer draws unblurred — a hard shadow,
  never a missing one.
- **Shopfronts.** Every commercial lot has glazing over a dark interior, a
  stall riser, a fascia in the business's colour and a reflection strip; low
  shops hang an awning over the street.
- **Photographic grain** (`render/surface.ts`): a hair of luminance noise over
  every finished lot bake, so brick, render and glass read as one material
  world. Brick got light mortar joints and header courses, stone got ashlar
  joints with jittered blocks, siding got board shadows and lips, precast got
  weather streaks, corrugated metal got a lit edge on every rib.

### Changed
- **The lighting model.** Faces darken into the corner they share and lift at
  their free edge, brighten toward the sky and hold a bounced-light base, so
  two parallelograms read as one solid. Sun/shade contrast narrowed
  (roof 1.10, sunlit 1.00, shade 0.64); `lit()` warms sunlit faces and cools
  shaded ones with a smaller lightness swing. Ground-contact occlusion is
  deeper; parapets shade the deck inside them.
- **The grade.** A less saturated sky, a warm and weaker haze, half the
  vignette, less daytime bloom; the night wash is lighter, the darkness layer's
  light pools have a soft edge, street lamps and window lamps are warmer.
- **Tilt-shift stands down after dark.** The miniature blur turned a lit
  downtown into mush; it now runs only while the night factor is under 0.5.
- The §§§ gilt roof outline and the high-tech cyan outline are gone; wealth
  shows in the materials now. The occasional gilded mast stays.
- Civic buildings are built of swatches too (fire station in red brick, police
  in granite, hospital in white render, school in buff brick, and so on) and
  their pitched roofs take the eave treatment.
- Roof decks and roofing come from the swatch and roofing tables rather than
  the wall colour, so a skin's hue remap (NYC) or saturation boost
  (Springfield) now stops at the roofline — walls restyle, roofs stay real.
- A `window.__simcity.look(x, y, zoom)` debug hook centres the camera on a
  tile — how the graphics passes take their screenshots.

Measured on the 76,000-population demo city at zoom 1: ground 8.7 ms,
shadows 2.5, scene 10.5, finish 2.4 — 24 ms against the 36 ms budget.

## [0.63.0] — 2026-08-10 · The city as a model on a table

Closes Slice C, "Tilt-shift" — the last finishing pass in the ambient-detail
plan. The composed frame is copied at half resolution, blurred and lightly
saturated, then laid back over itself through a vertical mask that spares a
central focus band, the classic tilt-shift trick that makes a real scene read
as a miniature.

### Added
- **Tilt-shift finish** (`render/tiltshift.ts`). The top and bottom of the
  screen soften and saturate a touch while a band through the middle stays
  sharp — the same one-buffer, one-filtered-draw shape as bloom, with the
  same silent no-op guard where canvas filters don't exist. It works under
  every render style, not just Realistic — switch to Pixel with it on and
  the blur sits on top of the chunky sprite crunch for the same miniature
  read. Cursors, halos and placement previews are painted after the finish
  pass, so they stay crisp inside the blur band even when the ground under
  them is soft.
- **A Config toggle.** "Tilt-shift" sits next to Seasonal colors in the
  Render style group. Its default follows the render style — on in
  Realistic, off in Pixel and Smooth — until the box is touched, at which
  point the choice sticks and survives switching styles; flipping styles
  after that re-syncs the checkbox only while the pref is still untouched.
  Measured well under the 2 ms/frame budget for the finish pass either way.

## [0.62.0] — 2026-08-10 · Rooftops get busier, and the civic set catches up

Two threads finished in the same slice: the growable roof-kit gained the props
a real skyline is missing, and the civic set — passed over when the growables
got their typology and facade rebuild in v0.59 — finally gets the same
treatment.

### Added
- **Two new rooftop props.** Helipads — a grey pad ringed in gold with a
  painted H — land on upper-band commercial towers (C2 stage 6+, C3 stage 3+)
  at a 0.6 chance, alongside the existing antenna and AC-unit props rather
  than in place of them. Skylight rows land on manufacturing's sawtooth-roofed
  sheds and warehouses, a strip of glazing along the ridge.
- **Denser prop tables everywhere else.** Water towers now turn up on
  mid-band residential walk-ups and mansion blocks (R2/R3), AC units on the
  C3 towers whose roofs used to sit bare, and a vent on strip retail (C1).
  Nothing is guaranteed — every prop is still a per-building roll, so a
  skyline reads as varied rather than pin-cushioned.
- **The civic set gets the growables' facade and roof-kit pass.** Fire and
  police stations, the school, hospital, prison, rail terminal, recycling
  centre, incinerator, coal plant and hydro plant now carry the same podiums,
  cornices, string courses and pilasters the growable archetypes picked up in
  v0.59, plus rooftop props at detail 1+. The Hospital's helipad was, until
  now, a ring stroked straight onto the roof at a fixed offset; it is now the
  real `helipad` prop, anchored off the roof quad like everything else, so it
  survives a turned camera and reads as a landing pad rather than a
  decoration.
- **The Museum** gained a shallow verdigris dome on its ridge, sat behind the
  existing colonnade.

Closes the "civic set has not had the typology and facade pass" clause of
backlog #8; multi-tile civic buildings drawing live rather than baked is
still open.

## [0.61.0] — 2026-08-10 · Smoke over the works, and a city that moves at rest

Everything ambient in the renderer used to be true for one frame and then held
there forever — the coal plant's puffs and the nuclear towers' steam were
painted once into the baked sprite and never moved again. This slice threads a
single ambient clock through the standing render pass so a settled city keeps
breathing even while the simulation underneath it is not.

### Added
- **Live ambient motion** (`render/ambientfx.ts`). Stage 2+ dirty and
  manufacturing industry lots vent a grey-brown plume that thickens with the
  tile's own pollution reading, and so do the coal plant and the incinerator.
  The nuclear plant's cooling towers now breathe slow white steam, replacing
  the two static puffs baked into the old sprite. Low-rise homes with a
  chimney add a thin hearth wisp once the season turns to winter. Stage 6+
  towers pick up red anti-collision beacons that blink out of sync across a
  skyline and brighter after dark. The School's flag — a fixed red rectangle
  painted on its pole since it was drawn — now actually ripples (the old
  static flag is gone), and about a third of parks gained a small looping
  fountain.
- The ambient clock scales with sim speed but keeps a slow drift while
  paused, so a paused city still moves; smoke leans downwind and lies flat in
  a hurricane, and every plume dims after dark. Far zoom simplifies industry
  and plant plumes to two puffs and skips flags, beacons and fountains
  entirely. Unpowered and abandoned lots never smoke. Measured well under
  1 ms a frame in browser testing.

### Under the hood
- Emitter positions — stack tips, the hearth vent, roof-prop placement, and
  chimney height — are now pure functions (`stackTips`, `hearthTip`,
  `placeRoofProps`, `chimneyHeight`) exported from the bake and shared with
  the ambient pass, so a plume rises from exactly the stack the sprite
  painted, at all four camera quarters, rather than a re-guessed
  approximation.
- `tests/rotation-sweep.test.ts` gained cases for the new painters, each
  guarded against silently going vacuous — the same discipline the sweep has
  held the reward, growable and civic painters to since v0.60.1.

## [0.60.1] — 2026-08-09 · Three more things a turned camera got wrong

Widening the strict-context rotation sweep past the reward set — the "cheap
insurance" the backlog has been asking for since the 180° crash — found three
live bugs of exactly the same family, plus one latent one. All are the same
mistake: a fixed *grid* corner index standing in for a *screen* position.
Corners are held in grid order, so which index is nearest the viewer changes
with every quarter turn.

### Fixed
- **A house's garden path ran to the wrong corner of its plot** once the
  camera was turned, and its parking bays hatched along a *far* edge rather
  than the near one. `drawLotApron` took corner 2 to be the front of the lot,
  which it only is at rest.
- **A fire station's engine bay doors ended up round the back.** Same
  assumption: the doors were drawn on the grid edge 2→3, so at some angles
  they faced away from the viewer and disappeared behind the building.
- **A farm's furrows were struck from the wrong centre.** The origin was
  assembled from corner 0's x and corner 1's y — which is the middle of the
  field only while the camera is at rest, and drifts off it at every other
  angle.
- **A civic lot carrying an industry tier crashed the painter.**
  `normalizeTier` only coerces the tier for zones it recognises as
  residential, commercial or industrial, so anything else — a landfill, say —
  reached the R/C archetype ladder with a tier like `dirty` and built the key
  `'Cdirty'`, which is not in the table, then indexed `undefined`. Not
  reachable by building anything (a fresh tile carries wealth 2), but a save
  that had been edited or mangled would have thrown once a frame.

The near corner is now *measured* rather than indexed, and at rest it is
corner 2 — so the unrotated view is unchanged, exactly as the v0.59.3 fix
promised for the reward painter.

### Added
- `tests/rotation-sweep.test.ts`: the growables, the civic set, multi-tile
  blocks, ground, water, shorelines, scenery and every transient marker,
  swept at all four quarter turns. Painters that must be screen-invariant are
  held to painting an identical picture; those that legitimately move — a
  sub-mass placed at a grid offset is *meant* to stay on the north side of its
  plot — are held to drawing finite, bounded geometry instead. The stub
  context now records a trace, so "the same picture" is something a test can
  actually check rather than merely "it didn't throw".

## [0.60.0] — 2026-08-08 · Regions, and a front door

Two headline pieces: highways that behave like highways, and a regional layer
above the single city — with the launch screen the game never had.

### Added
- **Regions.** A region is a 3×3 grid of city tiles sharing one seed and one
  biome, so nine maps read as one country rather than nine unrelated ones.
  Each tile is unclaimed land or a founded city. The region keeps a mirror of
  every city — population, treasury, date, and where its roads reach the map
  edge — refreshed on each save, so the region map never parses a city to draw
  itself. Regions export and import as one file, cities included.
- **A launch screen.** The game no longer generates a city on load and opens
  the File dialog over it. The front door is a choice: carry on with a region,
  found a new one, or play a single city exactly as before. The simulation
  stays paused until you have picked one.
- **Neighbour deals.** Only one city simulates at a time, so a deal is not a
  live negotiation — it is a standing contract held by the region and read by
  whichever city is loaded. The seller gives up capacity and is paid monthly;
  the buyer gains it and pays. Both sides read the same contract, so the books
  balance across the region whichever city you are in. **Power** and
  **refuse** are tradable. A seller whose plant burned down between visits has
  its contracts broken with a notice rather than paying out forever.
- **Border connections.** Where two neighbours both have road reaching the
  same places along their shared edge, they are joined, and 35% of each one's
  jobs and workers counts toward the other's demand. A bedroom suburb beside
  an industrial city now grows because the work is next door.
- **A Neighbours panel**, where the shortage is actually felt: what each city
  next door has going spare, what it would cost, and every contract you hold
  with its monthly total. Plus a **Neighbours line in the Budget report** and a
  **◀ Region** button that saves on the way out.

### Changed
- **Highways look like highways.** A wide road class stamped four or six tiles
  of asphalt side by side and left it there — nothing recorded that they form
  a *corridor*, so the painter saw road on all four sides of every interior
  tile and drew a junction: no lane markings at all, crosswalk ladders on
  every approach, and a traffic signal on each square. A six-lane interstate
  wearing a zebra crossing every tile. Carriageways are now derived from local
  same-class adjacency — which axis the traffic runs on, how wide the road is,
  and which lane a tile is — and the markings run *with* the traffic: dashed
  lane dividers, solid edge lines, a double yellow or a planted central
  reservation at the crown, hard shoulders and steel barriers on the motorway
  verges, and tyre polish in wheel tracks instead of random patches. A mouth
  stays open wherever something joins from the side. Nothing is stored in the
  save, and editing re-reads the moment a tile changes.
- **Highways behave like highways.** Cars picked a random adjacent road each
  step, so on a four-wide band they spent as much time drifting sideways
  across the carriageway as travelling along it — which is what a car park
  looks like. A car now follows its lane, and the side of the centreline it is
  on fixes its direction, so a band carries two streams. Nothing drives the
  wrong way up a motorway; merging across from the side is still allowed. The
  automata cap rose from 40 cars to 70, because a six-lane corridor needs more
  than a village high street's worth of traffic to read as busy.
- **A motorway has no front doors.** The Highway's own blurb has promised this
  since the ladder shipped in v0.54, but `roadAccess` treated a motorway tile
  as frontage like any street. It no longer does, and trips end under the same
  rule. **On an existing save, lots that front only a highway lose their road
  access until they are given a frontage street** — the advisor says so.
- `newCity` takes a biome, so a region can fix its climate.

### Fixed
- The strict-context sweep that has guarded the reward painter since v0.59.3
  now covers the road painter too — every class, width, lane and quarter turn
  — which is the cheap insurance the backlog asked for after the 180° crash.

## [0.59.3] — 2026-08-08 · A turned camera no longer stops the game

### Fixed
- **Building a college froze the game.** The reward painter measured a
  footprint by reading fixed corner indices — corner 1 for the right-hand
  edge, corner 2 for the bottom — but corners are held in grid order, not
  screen order, so a quarter turn moves which corner is where. Turned 180°
  those half-extents came out *negative*, `ctx.ellipse` threw on the negative
  radius, and the throw escaped the render loop: booking the next frame was
  the last statement in the frame, so the chain ended and the city never drew
  again. The window stayed open and answered the mouse, which is what made it
  look like a hang rather than a crash; only a reload brought it back.

  Footprints are now measured rather than indexed, which is turn-independent
  and agrees with the old arithmetic exactly where the old arithmetic was
  right — the unrotated view is unchanged, pixel for pixel.
- **Campuses and stadium bowls drew as nothing a quarter turn away.** The same
  indices gave a zero-sized footprint at 90° and 270°, so the lawn, the bowl
  and the reactor ring collapsed to a point — and on floating-point noise the
  measurement could come out slightly negative and take the game down there
  too (16 of 289 sampled positions at 90°, 46 at 270°).
- **Pitched roofs sat wrong once the view was turned.** The same corner
  indices decided how steep a gabled, hipped or mansard roof rises, so half a
  turn round every ridge pitched *downwards*, and a quarter turn either way
  flattened it to a token bump. Rooftop props had it too: a zeroed extent
  piled every one of them on the centre of the roof.
- **One bad frame can no longer end the session.** The render loop books its
  next frame from a `finally`, so a frame that fails costs a frame rather than
  the game. The first failure is reported to the console and the event feed.

## [0.59.2] — 2026-08-08 · A full browser store no longer bricks the launch

### Fixed
- **A black screen on launch when browser storage was full.** Migrating the
  one pre-v0.55 save into a named slot copied the old blob across verbatim —
  and the old format is roughly thirty times bulkier than the current one, so
  the copy briefly needed *double* the room the save already took. On an
  install near the quota that `setItem` threw, and because the save store is
  built at module scope on the way to booting the game, the exception escaped
  before anything was drawn: a black canvas and `QuotaExceededError` in the
  console, with no way back in.

  Migration now re-serializes into the compact format instead of copying, so
  it needs about a thirtieth of the space and usually just works. If it still
  cannot fit, it fails quietly: the old save is left exactly where it is, the
  game boots, and the event feed explains what happened and how to make room.
  Nothing in the store's construction can throw any more.
- **A migration could delete a save it had failed to read.** The legacy key
  was retired unconditionally at the end, including when the save had not
  parsed. It is now removed only once the new copy is safely written; an
  unreadable save is left alone for a future version to make sense of.
- Saving, renaming and index writes report a full store instead of throwing,
  and a city that lands without its index entry is cleaned up rather than
  stranded where nothing can reach it.

## [0.59.1] — 2026-08-08 · Flyouts you can actually reach

### Fixed
- **Density and power-plant type were unpickable on a phone.** Both live in a
  flyout that was parented inside the toolbar — which on the compact layout is
  a drawer slid off-screen by a `transform`. A transform makes the containing
  block for its descendants, so the flyout rode the drawer out of view even
  though it had only just opened. Worse, arming a zoning tool *closed* the
  drawer by design, so tapping Residential slid the density choices away in
  the same gesture that asked for them.

  The flyout now lives on `<body>` and is positioned in viewport coordinates,
  flipping to the other side of its button and pulling back from the edges
  rather than hanging off them — which also fixes a toolbar dragged near the
  right edge of a desktop window. And the drawer only slides away once
  *nothing is still being chosen*: that decision moved into the toolbar, which
  is the only thing that knows a flyout is open. `src/ui/flyout.ts` holds both
  rules as pure functions, with tests.

  The unlock gating itself was never wrong: at 120,000 people all five plants
  were being offered correctly — they just couldn't be reached.
- **Springfield's cartoon ink drew over buildings in front of it.** The
  outline was stroked once at the end, around the tallest mass, at full
  height — so it crossed anything standing in front, including the other
  masses of its own building. Each mass is inked as it is drawn now, in
  painter's order.
- A flyout anchored to a button inside a folded toolbar section no longer
  opens in the corner; it doesn't open at all.

## [0.59.0] — 2026-08-08 · Quarter turns, and buildings that differ

Three things the graphics overhaul left on the table: the camera couldn't
turn at all, a mass could paint over the one standing in front of it, and
every building was still fundamentally the same box at a different height.

### Added
- **The camera turns again — in quarter turns.** Q and E swing the view 90°,
  and the whole baked pipeline survives it: a tile still projects to the same
  diamond, so ground and road sprites are reused unchanged; the road
  connectivity mask is *rotated* rather than re-baked; and the sun stays fixed
  to the screen, so every building sprite is still lit correctly. Turning
  costs one re-sort of the paint order and nothing else. Only quarter turns
  are offered — at any other angle a tile is a different quad and every
  tile-shaped sprite in the game would be wrong.
- **Buildings have plans, not just heights.** A sub-mass now declares its
  extent along each grid axis and can have its corners cut, which gives the
  city slabs, terraces, wings, cross plans and chamfered towers instead of
  one square block resized. `prism()` takes any convex footprint — an edge is
  camera-facing exactly when it runs right-to-left on screen — so a
  chamfered tower shows three faces where a box shows two.
- **Facades.** Cornices, string courses, retail podiums, projecting slab
  balconies, bay windows, pilasters, wall-mounted air conditioners, hung
  signage boards, and iron fire escapes down the street frontage. All of them
  are rectangles in wall space, so they cost a few `fillRect`s each and bake
  once. This is what makes a brick walk-up read differently from a
  curtain-wall office at the same height and colour.
- **Real typologies.** The archetype table is rebuilt around buildings that
  exist: shotgun houses and ranches, brick terraces and walk-ups, panel
  blocks, mansard-roofed townhouses, mansion blocks, shophouses with signage
  over the street, department stores, slab offices, setback wedding-cake
  towers and slender chamfered shafts. Four to six per family per stage band.
- **Hipped and mansard roofs**, the latter with dormers punched into the
  steep face.
- **Street furniture.** Lamp standards on the footway that light after dark,
  traffic signals cycling at every junction, and cars parked at the kerb.
- **Vehicle bodies.** A 'car' now turns up as a hatchback, saloon, estate,
  SUV or coupé; a 'van' as a panel van, minivan or pickup with an open bed;
  a 'truck' as a box truck, flatbed or an articulated rig with a separate
  trailer. Proportions follow real ones — roughly 4 m for a hatchback to
  20 m for a semi.

### Fixed
- **Masses painting over the ones in front of them.** Sub-masses were sorted
  back-to-front by the south corner of their footprint, which for two masses
  sharing a centre always put the *wider* one last — so a low podium painted
  its roof cap straight across the slender tower standing on it. They now
  sort by centre, shortest first on a tie.
- The tower crown that pulled the wall material up over a steep pyramid, and
  read as a gold tent on the skyline. It is a shallow hipped cap in roofing
  colour now.
- Mansard roofs were too steep and too blue; survey markers on empty zoned
  lots were loud enough to drown out the city around them; pedestrians had
  heads as big as their bodies, so a crowd read as a scattering of pale dots.

## [0.58.0] — 2026-08-07 · Graphics overhaul

The city was drawn the same way it had been since v0.1: every building, tree
and road tile re-derived from scratch as flat-filled polygons, sixty times a
second, at whichever of 360° the camera happened to be pointing. That budget
is what kept the art thin — a wall was one colour, a window was a stripe, a
tree was a circle on a stick, and the sun was a fudge that swung round with
the camera.

This drop rebuilds the whole rendering pipeline around one trade: **the
camera no longer rotates.** Everything else follows from that.

### Added
- **A sprite cache.** With the view angle fixed, a lot draws the same pixels
  every frame, so it is painted once into an offscreen canvas and afterwards
  copied in a single `drawImage`. The point isn't speed for its own sake —
  it's that a sprite drawn once can afford a hundred times the detail a
  per-frame painter can. Sprites bake at the display's pixel density, are
  evicted least-recently-used past a pixel budget, and if a city is big
  enough to thrash the cache the bake resolution steps down on its own rather
  than re-baking the same buildings forever.
- **One sun for the whole city** (`render/sun.ts`). A real direction, low in
  the west: two visible walls at two brightnesses, roofs brightest, and every
  mass throwing a **cast shadow that lies along the ground plane** and
  lengthens with height. Shadows get their own render pass, before any
  building is drawn, because a tower's shadow falls toward the camera onto
  tiles that paint after it.
- **Materials** (`render/massing.ts`, `render/palette.ts`). Walls are brick,
  render, concrete, glass, metal, timber or stone — each with its own grain,
  trim and sheen, drawn in *wall space* so brick courses, precast panel
  joints, spandrels, mullions and lit panes are plain rectangles that land
  correctly sheared on the isometric face. Walls carry a vertical falloff
  (sky light at the parapet, bounced light at the base), glass returns a sky
  gradient, and everything meets the ground through an occlusion band.
- **Real windows,** on a floor grid sized to the building — punched openings,
  ribbon glazing or a curtain wall — each with a dark head reveal so they
  read as openings rather than decals. A second, mostly transparent sprite
  holds only the **lit** panes and is added over the first after dark.
- **Tower crowns.** Anything over about six storeys takes a setback box, a
  stepped ziggurat, a sloped glazed cap or a machine floor from its seed. A
  skyline of identical flat caps was the thing that most made a procedural
  city look procedural.
- **Roads that look like roads** (`render/roadart.ts`). Painted from the
  connectivity mask: asphalt with wear and tyre polish, kerbed footways along
  every edge that isn't carrying the road onward, a centre line only where
  the road runs through, curves through bends, turning heads at stubs, and
  crosswalk ladders on every approach to a junction.
- **Landscape** (`render/ground.ts`, `render/scenery.ts`, `render/noise.ts`).
  Ground colour comes from a noise field rather than two sine waves, so
  meadows have patches instead of a moiré weave, with parched and damp
  ground drifting apart. Every tile takes a transparent texture blit —
  blades, tufts, dune ripples, rock flecks — that works over any base colour.
  Water is depth-shaded from a breadth-first distance to the shore, with
  drifting crests, sun glint and a graded sand-and-foam shoreline. Cliffs get
  bedded strata, occlusion at the foot and a grass lip breaking over the top.
  Trees are baked sprites — broadleaf, conifer, scrub, palm, dead — with
  layered canopies, seasonal palettes and contact shadows.
- **Lot ground.** A built lot stands on a plot: paving under a shop or works,
  clipped lawn and a garden path around a house, hatched parking bays on
  anything with a car park.
- **A finishing pass** (`render/grade.ts`): a sky gradient behind the map
  instead of a flat void, aerial perspective over the far half of it, a
  bloom that lets lit windows and floodlights spill, a warm/cool grade and a
  vignette.
- **Reworked effects.** Fire licks, throws embers, lights the ground around
  it and trails smoke; the tornado is a twisting funnel with a spiralling
  band; rain falls in two layers at different speeds; vehicles have shadows,
  glazed cabins and headlights that throw a beam after dark; pedestrians have
  heads and shadows.
- **`__simcity.profile()`** reports where the last frame went and what the
  sprite cache is holding, alongside the existing `camera()` hook.

### Changed
- **The camera no longer rotates.** Q and E do nothing; the arrow keys still
  pan. This is the trade the rest of the drop is built on — a fixed angle is
  what lets every mass be baked once and lets the sun be a direction rather
  than a screen-space fudge. The projection maths in `render/iso.ts` is
  unchanged and still handles any angle; nothing calls it with one.
- **Rendering runs in passes** — sky, ground, cast shadows, everything that
  stands up, atmosphere, night, finishing, cursors — and skips tiles outside
  the viewport.
- **Four palette families per tier** instead of three, spread far enough
  apart that a downtown reads as bronze and green and blue glass rather than
  one curtain wall repeated forty times. Pitched roofs pick from six
  roofings. The §§§ prestige mast now goes to about one tower in four.
- **Night is properly dark.** The ambient wash is deeper and the street-light
  pools much tighter — they used to be wide enough that a dense downtown
  punched every hole into every other, leaving nothing for the darkness layer
  to do. The lit windows carry the brightness now.
- The three render styles are now *finishes* over one pipeline: **Realistic**
  adds haze, bloom, grade and vignette, **Smooth** is the same scene without
  them, and **Pixel** is the whole thing rendered small and blitted back with
  nearest-neighbour.
- Changing skin clears the sprite cache, since every baked building is
  restyled by it.

### Performance
A 180,000-person city measured **33 ms/frame against the old renderer's
48 ms** in the same browser — faster than what it replaced, with an order of
magnitude more detail on screen. Almost all of the remaining per-frame cost
is the ground pass; buildings, trees and roads are one blit each.

## [0.57.0] — 2026-07-29 · Touch and small screens

The game was unplayable on a phone: there was no way to zoom at all, no way
to pan, and a first swipe paved whatever it crossed. On a 390px screen the
tool column alone took 38% of the width.

### Added
- **Touch controls.** One finger builds — drag-to-draw roads, lines and
  rectangles all behave as they do with a mouse — and **two fingers pan and
  pinch to zoom**. Landing a second finger abandons whatever the first was
  drawing, so a pinch never leaves a stray preview or paves on release. With
  no tool armed, one finger pans, so a fresh map is explorable before you
  pick anything up.
- **On-screen + / − zoom buttons.** Zoom was reachable only through the
  mouse wheel, which left touch devices with none at all; a trackpad-less
  desktop gets them too.
- **A compact layout below 820px.** The toolbar becomes a drawer behind a
  **☰** toggle, the minimap steps aside, the readout strip wraps instead of
  hiding nine controls in a scroll region with no scrollbar, and panels open
  as bottom sheets. All of it is CSS — one layout, not a separate mobile build.

### Changed
- Every zoom — wheel, buttons and pinch — now goes through one `zoomAbout()`
  in `render/camera.ts`, which keeps the world point under the anchor fixed.
  The wheel's behaviour is unchanged, to the same 1.1× per notch.
- `#city` takes `touch-action: none`, so the browser stops claiming the
  gestures to scroll-bounce or page-zoom the interface.
- `pointercancel` is handled alongside `pointerup`. iOS raises it when the
  system takes a touch — a call, the app switcher, an edge swipe — and
  without it that finger stayed stuck in the map.
- The debug hook exposes a read-only `camera()`, since the touch and zoom
  paths have no other observable output.

## [0.56.0] — 2026-07-29 · Public release

The game is now playable from a link, and the project is open source. No
simulation or interface behavior changed in this drop.

### Added
- **Hosted build at
  [steamgromit.github.io/simcity-web](https://steamgromit.github.io/simcity-web/).**
  No install, no account, no server — the simulation still runs entirely in
  the browser and cities still save to local storage on your own machine.
- **Continuous deployment.** A GitHub Actions workflow runs the type check,
  the 867-test simulation suite and a production build on every push to
  `main`, then publishes `dist/` to GitHub Pages. A failing test blocks the
  deploy, so the live site never gets a red build.
- **MIT license**, plus a README note recording that this is an independent
  fan project unaffiliated with Electronic Arts or Maxis.

### Changed
- **`vite.config.ts` sets `base: './'`** so the built game resolves its assets
  relatively. It now runs from any location — a Pages project subpath, a
  custom domain, or a folder on any static host — instead of assuming it sits
  at a domain root.
- **README** leads with the play link and separates playing from local
  development; it also warns that opening `dist/index.html` over `file://`
  cannot work, because browsers block ES modules on that scheme.

## [0.55.0] — 2026-07-25 · Rewards & named cities

### Added
- **Rewards — what the mayor's office buys once the city has earned it.**
  Ten special buildings, each unlocked by a milestone and listed in a new
  **Rewards** section of the toolbar as the city grows into them:
  **Ballpark** → **Arena** → **Stadium** → **Colosseum** (pop 2k / 15k /
  40k / 100k), **Library** (5k), **Museum** (20k + a schooled city),
  **Monument** (50k), and **College** → **University** → **Research
  University** (10k / 30k+educated / 60k+well-educated). They employ
  people directly, cost real money to keep, and are the only buildings a
  mayor places for prestige rather than utility.
- **Multi-tile buildings.** Every reward occupies a block — 2×2 up to
  5×5 — of level, clear ground, previewed under the cursor before you
  commit. A block is one building: one upkeep, one service source, one
  plume, razed as a unit from any tile of it.
- **A Research University unlocks the Cold Fusion Plant** (4×4, 2,400
  capacity, no pollution) in the Power Plant menu. Content declares what
  it `grants` — learning, research, culture, sport — and other content
  gates itself on that grant, so the connection is data, not a special
  case. Bulldoze the university and fusion locks again.
- **Rewards push on the land around them.** A new `amenity` block is the
  mirror of `blight`: the sport ladder lifts a whole district while
  making the streets directly outside it worse, so the best address is a
  few blocks from the stadium rather than across from it. The Monument is
  pure amenity — almost no jobs, a large and expensive halo of desirability.
- **Named cities.** Save under any name and keep as many as your browser
  will hold: the File menu lists each with its date, population, funds and
  when it was last written, and every one can be renamed, exported to a
  `.json` file, re-imported, or deleted. Saving under a name you already
  used overwrites that city; a new name keeps the one you started from.
  The single pre-v0.55 save is adopted as “My City” on first launch.

### Changed
- **Saves are about 30× smaller** — 3.5 MB down to ~115 KB for a
  developed city. A tile now omits every field that is already the
  default, which is nearly all of them on the empty grass that makes up
  most of a map. This is what makes keeping several cities possible at
  all; the format is unchanged in every other respect and round-trips
  identically.
- **Area effects measure from the whole building, not its corner tile.**
  Coverage, pollution, blight and amenity all run to the nearest part of
  a block, so a five-tile campus covers a ring around itself rather than
  a circle centred on one corner. Identical to the old behaviour for
  every one-tile building.
- The toolbar scrolls when it outgrows the window, Query reports a
  reward's footprint, jobs, area effects and grants, and the placement
  preview outlines the ground a block would claim.
- A save's slot-range check is derived from the `Zone` enum rather than
  naming its last member — the named bound had gone stale, so a save
  without a legend entry for a recently-added zone dropped those tiles.

## [0.54.0] — 2026-07-25 · Road ladder & interface overhaul

### Added
- **Wider roads, unlocked as you grow.** The Road button is now a family:
  **Street** (1 square), **Route** (2 squares, pop 2,000), **Boulevard**
  (3 squares around a planted median, pop 8,000), **Highway** (4 squares,
  pop 20,000) and **Highway II** (6 squares, pop 45,000). Drag one and it
  lays a *corridor*, not a line — the band widens to the class's promised
  width and turns corners with it. Each tile of a wider class swallows
  more traffic before it jams, so a route genuinely relieves a choked
  street. Lay a class over an existing road to widen it in place.
- **Boulevard medians are real.** The centre strip of a boulevard is
  landscaped, not paved: nothing drives on it, no building fronts it, and
  routing goes around. Lay a plain street across one to punch a junction
  through. (A stairstepped diagonal is laid as solid carriageway — a
  median down a zigzag would sever the lanes either side of it.)
- **A File menu, and a front door.** New / Save / Load / Mods are one
  **File** button instead of four, and the menu opens on launch so
  carrying on with the saved city or starting fresh is an explicit
  choice rather than something the game decides for you.
- **One running event feed.** The centre toast and the bottom-left
  advisor strip are gone; everything the city says — fires, crimes,
  crashes, advisors, confirmations — streams into a single strip you
  place once. Two shapes, switched from its handle: a **ticker** (⇄) that
  crawls along one line, or a **log** (⇅) stacking newest-first. Position
  and shape persist.
- **Configurable charts.** Twenty series across five groups (city, money,
  zones & density, conditions, incidents), each its own small multiple.
  Pick which appear, read them as totals or **per 1,000 residents**, and
  choose a **1 / 5 / 10 year or All** window you can scroll back through
  the city's whole history.

### Changed
- **Every modal closes from its own title bar.** A × sits top-right of
  Budget, City Hall, Charts, Config, Mods, File and Help — no more
  hunting for the button that opened it. The control bar now **rings the
  button of any open panel**, so what's on screen is legible at a glance.
- **City Hall lost its advisor board.** The list grew and shrank as the
  city's mood changed, moving every control below it out from under the
  cursor. The advisors speak through the event log now; everything left
  in City Hall has a fixed height.
- **A growth-gated family shows one button until there's a choice.**
  Road, Power Plant, Police Station, Waste and Transit Line render as a
  single plain button while only one member is unlocked, and become a
  flyout the moment a second one is. Their keyboard shortcut always arms
  the *lowest* member — **R** is always a plain street — and **G** now
  binds the Landfill.
- **Placement previews are survey pink, not data-view green.** Hovering
  with a service tool used to paint the same green the coverage views
  use, so "what would change" was indistinguishable from "what is already
  covered" — exactly when the preview matters most. The footprint is now
  pink with a bright rim at the edge of its reach, the Park previews its
  land-value radius, and an **amber ring** marks the smaller radius over
  which a prison, dump or plant spoils the neighbourhood.
- Roads render per class: motorways get a blacker pour and white lane
  edges, boulevards a treed median. Query names a road's class and
  congestion against its own capacity. Upkeep and build cost scale off
  `core:road`, so a mod that retunes one road price retunes the ladder.

## [0.53.0] — 2026-07-24 · Building safety

### Added
- **Buildings age, and a very old one can fall.** Every structure now
  tracks how long it has stood. Once past **100 years**, an unmaintained
  building carries a tiny, age-growing monthly chance of collapsing into
  rubble — casualties reported, the lot blocked while crews clear it,
  just like a disaster. This is the rarest event in the game by design;
  you'll only ever see it on a long-running city that let its landmarks
  age untended.
- **Two ways to keep them standing.** **Building Permits** (§60/mo) has
  plans reviewed before you build — safer structures, though zoning
  costs a little more while it's enacted. **Infrastructure Inspectors**
  (§140/mo) watch the whole built environment and cut the risk further.
  They stack.
- **The Repair tool** (§80) resets a building's age to zero — as good as
  new, collapse risk back to nothing. The proactive choice: maintain a
  landmark rather than gamble on it, or rebuild after it falls.
- **A Building Age data view** (⇧A) heats older buildings yellow→red so
  the at-risk ones are easy to find; Query shows a building's **Age** and
  **Condition** (sound / aging / at risk); the advisor flags risk when no
  safety programme is enacted; a dust-burst marker and a low rumble mark
  a collapse.

### Changed
- Gentle and late by design — no collapse on a normal save, never a
  growth gate, and a legacy save's buildings start "new" and age from
  when you load them. `collapse.rate` is the twelfth modifier knob, so
  a mod can make aging a live threat (or switch it off) as it likes.

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
