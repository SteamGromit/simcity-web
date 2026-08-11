# SimCity Web

A browser city-building game inspired by **SimCity 4**, built with TypeScript
and Canvas 2D. No frameworks, no art assets — every building is drawn
procedurally and every sound is synthesized in the browser.

**▶ [Play it now](https://steamgromit.github.io/simcity-web/)** — no install,
no account, runs entirely in your browser.

![Screenshot](docs/media/screenshot.png)

## The defining feature

Like SimCity 4, this is a city *simulation*, not a city painter. You never
place buildings. You zone land, lay roads, and provide power; the simulation
decides what happens next:

- **RCI demand** — residents chase jobs, commerce chases customers, industry
  chases an external market. The demand bars in the HUD show what the city
  wants.
- **Desirability** — each tile weighs land value, pollution, and commute time.
  Nice tiles grow tall; tiles beside the coal plant stay shacks.
- **Decay and gentrification** — cut the power or tank the economy and
  buildings abandon (boarded-up grey shells). Fix the problem and they
  redevelop on their own.
- **A living city** — zone at low, medium, or high density and watch shacks
  become towers as land value, services, and schools allow; cars roam the
  busy roads, citizens stroll outside their buildings, and day fades into
  night with glowing windows and streetlights. Even a paused city keeps
  moving: smoke drifts from industry stacks and the power plants, the
  nuclear towers vent steam, chimneys breathe on frosty homes, tower
  beacons blink after dark, flags ripple, and a few park fountains loop.
- **Wealth & industry tiers** — buildings pick a character from their
  surroundings rather than from a zoning menu: residential and commercial
  lots carry § / §§ / §§§ wealth from land value, and industry comes as
  agricultural, dirty, manufacturing, or high-tech depending on education
  and clean air. Zone industrial at low density for farmland.
- **Per-lot building variety** — every developed lot receives a seeded
  *typology*, not a resized box: shotgun houses and ranches, brick terraces
  and walk-ups, panel blocks, mansard-roofed townhouses, mansion blocks,
  shophouses with signage hung over the street, department stores, slab
  offices, setback wedding-cake towers, slender chamfered shafts. Each has a
  plan (long, square, L-shaped, corner-cut), a roof (flat, parapet, gabled,
  hipped, mansard, sawtooth) and a facade — cornices, string courses, retail
  podiums, balconies, bay windows, pilasters, wall air conditioners, fire
  escapes. Towers over about six storeys take a crown. Rooftops carry their
  own seeded props — antennas, AC units, water towers, vents, a helipad on
  the tallest commercial towers, skylights on manufacturing sheds — and the
  civic set (fire, police, school, hospital and the rest) shares the same
  facade and roof-kit treatment. Farms vary in barn placement, furrow
  direction, and a silo or coop.
- **A city that's lit, not just coloured** — one sun sits low in the west
  for the whole map, so every wall takes the brightness its orientation
  earns and every building throws a shadow that lies along the ground and
  lengthens with its height. Walls are brick, render, concrete, glass,
  metal, timber or stone, each with its own courses, panel joints and
  sheen, and windows are real openings that light up floor by floor after
  dark. Streets carry lamp standards that come on at dusk, signals cycling
  at the junctions, and cars parked at the kerb.
- **Context-aware traffic** — vehicles pick roles by location: trucks move
  goods on industrial roads, taxis and vans favor commercial routes, and
  buses cluster near transit stops. Each kind has distinct speeds and paint.
- **Named businesses** — many shops and factories carry homage brands
  (Dunder Mifflin, Wonka, Initech, Strickland Propane…) with signs on
  their walls; the Query tool tells you who moved in.

## Play it

The hosted build is the quickest way in:
**[steamgromit.github.io/simcity-web](https://steamgromit.github.io/simcity-web/)**.
Nothing to install. There is no server and no account — the simulation runs on
your machine, and your cities are saved to your own browser's local storage.
(Clearing site data clears your cities; use **File → Export** to keep one.)

## Run it locally

You need two things installed:

1. **Node.js 18 or newer** — grab the LTS installer from
   [nodejs.org](https://nodejs.org). (Works on macOS 10.15+ — a
   2013-era MacBook Pro is fine.)
2. **A current browser** — recent Chrome or Firefox recommended.
   Safari works from version 16 on.

Get the code either way:

- **Download ZIP** — on the GitHub repo page, click **Code → Download
  ZIP**, then unzip it (no git needed), or
- **Clone** — `git clone https://github.com/SteamGromit/simcity-web.git`
  if you have git set up.

Then, in Terminal, from inside the project folder:

```sh
npm install      # one time, downloads dependencies
npm run dev      # starts the game server
```

Open the printed `http://localhost:5173` URL in your browser. That's
it — the game runs entirely locally.

Pick a **render style** in Config. All three draw the same city — they
differ in how the frame is finished. **Realistic** (the default) adds
aerial haze, a bloom that lets lit windows spill, a warm/cool grade and a
vignette; **Smooth** is the same scene without them; **Pixel** renders the
whole thing small and blits it back with nearest-neighbour for a retro
sprite-art crunch.

On older machines: if the frame rate dips, switch to **Smooth** and turn
off weather effects in the Config panel (day/night lighting is already off
by default). The renderer also lowers its own sprite resolution by itself
if a city grows large enough to overrun the sprite cache.

`npm test` runs the simulation's unit suite; `npm run build` makes a
production bundle in `dist/`, which `npm run preview` then serves. Opening
`dist/index.html` straight off the disk will *not* work — browsers refuse to
load ES modules over `file://` — so reach it through `npm run preview`, any
static file server, or the hosted link above.

## How to play

### Regions

The game opens on a **launch screen** rather than dropping you into a map.
From there you either found a **region** — a 3×3 grid of city tiles sharing
one landscape and one climate — or start a **single city**, which is the game
exactly as it was before regions and remains a complete way to play.

Inside a region, each tile is unclaimed land or a founded city. Found one,
play it, and press **◀ Region** to save and come back out. Two things pass
between neighbouring cities:

- **Contracts.** A city with spare **power** or **refuse** capacity can sell
  it to the city next door. The seller loses the capacity and is paid monthly;
  the buyer gains it and pays. Open them from the **Neighbours** panel inside
  a city, where you can see who has what going spare. If the seller later
  loses the capacity — a plant burns down, say — the contract breaks and you
  are told.
- **Border crossings.** Run a road to the map edge on **both** sides of a
  shared border and the two cities are joined. A share of your neighbour's
  jobs feeds your residential demand, and a share of its workers feeds your
  commercial and industrial demand — so a bedroom suburb beside an industrial
  city grows because the work is next door.

Only one city simulates at a time; the others sit as you left them. Regions
export and import as a single file, cities included.

### A city

New maps come with lakes, forests, **rolling hills**, and a guaranteed
snowcapped **mountain**; about one map in four rolls a **desert** — one
oasis, no lakes, tinder-dry air — where the water utility is a matter of
survival. Before you build
anything, the **terrain tools** (Water / Forest / Level Land / Raise /
Lower) are free — sculpt the geography to taste; once the city is founded
they cost money. Nothing can be built on water or forest, but living near
them (or up on a hillside with a view) raises land value.

Roads climb hills one level at a time — a two-level **cliff** stops them
cold, so grade your routes or go around. Every class of road also builds
**bridges** straight over water (§50 a tile for a street, more for a
wider deck). Power lines don't mind cliffs.

Start with a **coal plant**, draw a **road**, then zone **residential /
commercial / industrial** beside the road (within 2 tiles). Click a zone
tool to open a density flyout beside it (Low/Medium/High); each zone
remembers its last density. Buildings need both road access and power to
develop.

Power conducts through adjacent zones and buildings but **not across roads or
empty land** — string power lines to bridge gaps (lines can be placed on road
tiles to cross them). Unpowered zones show a yellow ⚡ bolt; hook them up with
a line from the plant or by zoning a connected path. The Power data view shows
what's connected.

Plants have **limited capacity** (in powered buildings) and pool it across
the grid; overload the pool and the farthest buildings brown out until you
add plants. Growth unlocks cleaner sources in the Build section's **Power Plant**
menu — locked plants stay hidden until the city earns them: **Wind
Turbine** (pop 2,000), **Solar Farm** (pop 5,000), **Hydro Plant** (pop
10,000, must sit beside water), and **Nuclear Plant** (pop 25,000).

**Water** works the same way: build a powered **Water Pump** within two
tiles of open water and the supply spreads through adjacent buildings;
**Pipes** bridge gaps and cross under roads. Buildings need running water
to grow past stage 2.

**Rubbish** is the one service with two ways to fail. Every developed lot
puts out refuse each month, and a disposal building has to both *reach*
it — collection is a coverage radius like fire or police — and have the
citywide *capacity* to process what comes in. Miss the first and one
district fills up; miss the second and the whole city does, evenly. The
advisor tells you which. Open the **Waste** menu in the Civic section:
the **Landfill** is cheap and available immediately but a filthy
neighbour, the **Incinerator** (pop 8,000) trades ground pollution for a
stack, and the **Recycling Centre** (pop 20,000 and an educated city)
takes a quarter of the refuse out of the stream altogether. The
**Recycling Program** ordinance does something similar for a smaller
city. Blocks need collection to grow past stage 3, and uncollected heaps
pollute, tank land value, and choke off growth until you deal with them —
the **Garbage** (⇧G) and **Refuse Cover** (⇧R) views show where.

**Building safety** is the long game: structures age, and once a building
passes 100 years, an unmaintained one carries a tiny chance of collapsing
into rubble. It's the rarest event here — you'll only meet it on a
long-lived city. **Building Permits** and **Infrastructure Inspectors**
cut the odds; the **Repair** tool resets a building's age. The **Building
Age** view (⇧A) shows which structures are getting on, and Query reports a
building's age and condition.

**Traffic accidents** give the road network its own hazard: a busy road
occasionally throws a crash that blocks the tile for a while, and traffic
reroutes around it — a city with parallel routes barely notices, a single
artery stalls until it clears. Crashes are likelier the busier the road, so
they land where it hurts. **Driver Education** makes them rarer; the **EMT
Program** clears them faster, and fire crews are the responders, so a crash
near a fire station clears fastest. Watch the **Traffic** view (⇧T) — a
blocked tile flags red.

**Crime** is where police coverage earns its keep. Every developed lot has
a crime rate driven by poverty, crowding, joblessness and the blight of
abandoned neighbours; it drags land value — which raises crime, a spiral a
neglected district falls into on its own — and slows growth. It never
*blocks* growth, only pressures it. A **Police Station** holds it down; the
**Prison** (pop 15,000) covers a wide area but blights the land around it,
so keep it clear of homes; the **Neighborhood Watch** ordinance cuts crime
city-wide on the cheap. Watch it in the **Crime** view (⇧C); the advisor
tells you whether a hotspot needs a nearer station or the whole city needs
more coverage.

Keep industry (and the coal plant) away from homes: pollution wrecks
residential land value. Parks raise it.

Roads have **capacity** — a jammed artery makes every commute through it
longer, which drags down desirability and land value. Relieve it with
parallel routes, with a **wider class of road**, or with **transit lines**.

The **Road** button is a growth-gated family. You start with the plain
**Street**; the city unlocks **Route** (pop 2,000), **Boulevard** (8,000),
**Highway** (20,000) and **Highway II** (45,000) as it grows. Each is
wider than the last — 1, 2, 3, 4 and 6 squares — and drags out as a
*corridor* rather than a line: aim the drag down the middle and the band
lays itself out either side, turning corners with you. Every tile of a
wider class carries more traffic before it starts to jam, so a route
through a choked district genuinely unclogs it. Lay a class straight over
an existing road to widen it in place.

Anything wider than a street is drawn as a **carriageway**, not as a
field of asphalt: dashed lane dividers between lanes running the same
way, a solid edge line down each verge, and either a double yellow or —
on a motorway — a planted central reservation with steel barriers at the
crown. Cars keep to their lane and to the side of the road their
direction belongs on, so a four-lane highway carries two streams rather
than a milling crowd. A mouth stays open wherever a road joins from the
side.

A **motorway has no front doors.** Highway and Highway II move traffic
through; nothing is addressed off them. Build a **frontage street**
alongside if you want the land behind one to develop.

A **boulevard's median is landscaped, not paved**: three squares wide,
two carriageways, and a treed strip down the middle that nothing drives
on and no building fronts. Traffic routes around it. Draw a plain street
across a boulevard to punch a junction through the median.

For transit, open the **Transit Line**
menu in the Civic section (only unlocked modes appear; Bus is always
available), draw the route point by point on the map
(double-click to finish it), click tiles on or beside the route to
place stops, pick the line's color, and press **Done**. Stops near
homes *and* jobs take cars off the road. Growth unlocks the ladder —
**Streetcar** (pop 5,000), **Monorail** (15,000), **Subway** (30,000),
**Commuter Rail** (50,000) — wider coverage, fewer cars per trip; the
worse-served end of a trip decides its ride. Rail modes charge per
track tile; surface lines can't cross water, elevated and underground
ones can.

Growing past small buildings takes **civic services**: fire coverage unlocks
stage 2, police + school coverage unlock stage 3, and a **hospital** in reach
unlocks the tallest towers (industry skips the school and hospital
requirements). Stations need power, cover a radius (see the coverage data
views), and charge monthly upkeep. While placing a service building, a
green halo previews its coverage.

**Weather** rolls through with the seasons — rain damps fires, winter
snow slows every commute — and the world turns with the calendar:
orange autumn woods, frost-pale winters (Seasonal colors in Config).
Disasters follow too: tornado season is spring, hurricanes peak in
autumn, pandemics in winter. and **disasters** strike once your city is big
enough to matter: tornados
carve wandering paths of rubble (and fires), hurricanes lash the whole
map with storm surge along the waterfront, and pandemics empty homes that
lack hospital coverage. Expect a show — flying debris, wind-whipped
trees, foam churning on the shore, masked citizens on quiet streets —
and a cleanup: wrecked lots stay buried in rubble for a few months
(bulldoze to clear faster) before anything rebuilds. Feeling reckless?
City Hall has a "tempt fate" panel.

Buildings with no fire coverage can **catch fire — and fires spread** to
neighboring buildings, covered or not (coverage resists the jump and fights
the blaze). Watch for the flames and the advisor warning; if the fire
department can't cope, bulldoze a firebreak before the whole block goes.

Watch the budget — roads, plants, and services cost upkeep monthly; taxes
above 9% suppress demand. Pick a **city style** in the **Config panel** — Classic, cartoon **Springfield**
(ink outlines, loud colors), or muted brownstone **NYC** — all drawn
procedurally, switchable live. Listen for the **adaptive soundtrack** —
a fully synthesized score that follows your city: desert maps play a
different scale, winter turns it minor and slow, rain thins it out, an
industrial skyline darkens it, and the band grows as the village becomes
a metropolis (toggle in Config; M mutes everything — volume sliders live there too). The Config panel
also gathers weather effects, volume sliders, and a day/night lighting toggle (off by
default — turn it on: nights go truly dark beyond the city, and
streetlights and lit windows carve glowing pools where people live;
unpowered blocks vanish into the black). Open **City Hall** to see what the
city is made of and to enact **ordinances** — monthly-cost policies like
the Clean Air Act or Free Bus Service that bend the simulation in your
favor. **File** gathers New, Save, Load, Import and Mods, and opens on
launch so you pick which city to carry on with — or start a fresh one —
deliberately.

| Control | Action |
| --- | --- |
| Left click / drag | apply tool (zones, parks, bulldoze drag rectangles; roads, power lines, and pipes draw an adjustable line) |
| Tool keys | B bulldoze · R road · 1/2/3 zones · P plant · L line · K park · F/V/S/D services · U bus · G landfill · W/X water · I query |
| ⇧ + key | data-view shortcuts: ⇧P power, ⇧O pollution, ⇧L land value, ⇧T traffic, ⇧D demand, ⇧F fire, ⇧V police, ⇧S school, ⇧H health, ⇧G garbage, ⇧R refuse cover, ⇧C crime, ⇧A building age, ⇧W water |
| Minimap click | jump the camera |
| Charts button | the city's history, series by series |
| Query tool | inspect any tile |
| × on a title bar | close that panel |
| Middle-drag or Space+drag | pan (arrow keys work too) |
| Q / E | turn the view a quarter |
| Mouse wheel or + / − | zoom |
| One finger (touch) | build — or pan the map when no tool is armed |
| Two fingers (touch) | pan and pinch to zoom |
| ☰ (narrow screens) | slide the tools in and out |
| H or ? | help panel |
| M | mute / unmute sound |
| Esc | deselect tool |
| ⏸ ▶ ▶▶ ▶▶▶ | pause / normal / fast / cheetah |

**On a phone or a narrow window** the interface reorganises itself: the
toolbar becomes a drawer behind the **☰** button, the minimap steps aside,
the readout strip wraps so no control is stranded off-screen, and panels
open as full-width sheets. The map keeps the rest of the screen.

Panels are yours to arrange: drag the toolbar, HUD, and info panels by
their title bars, and close any of them with the **×** at the top right.
An open panel keeps its control-bar button ringed in pink, so you can
always see what's on screen. Toolbar sections pop out into draggable
floating panels and re-dock; positions and detached state persist. Click
a toolbar section header to fold that group away — everything is
remembered.

**Reading the toolbar.** Each tool carries a colored spine down its left
edge, following the color code utility crews paint on real streets: red
for power, blue for water, orange for transit, brass for civic services,
white for terrain work. Zoning uses the same green/blue/yellow as the RCI
meter. The tool you have armed turns **survey pink** — the color of
temporary survey marking, the paint that means "proposed work here."

Growth-gated families — Road, Power Plant, Police Station, Waste, Transit
Line — show a **single button** while only one option is unlocked, and
open a flyout the moment the city earns a second. Their keyboard shortcut
always arms the *first* member, so **R** is a plain street whatever the
button currently says.

Hovering with anything that has an area effect previews its footprint in
**survey pink** — deliberately not the coverage views' green, so you can
leave Health Cover on and still see exactly what a new hospital would
change. An **amber ring** marks the smaller radius over which a prison,
dump or power plant spoils the neighbourhood.

**Rewards.** As the city passes milestones, the mayor's office earns the
right to buy special buildings, listed in the toolbar's **Rewards**
section: a **Ballpark** → **Arena** → **Stadium** → **Colosseum** ladder,
a **Library**, a **Museum**, a **Monument**, and **College** →
**University** → **Research University**. Each occupies a block of level,
clear ground — 2×2 up to 5×5 — employs people directly, and costs real
money to keep. They pull on the land around them in both directions: a
stadium lifts a whole district while making the streets directly outside
it worse, so the good address is a few blocks away rather than across the
road. Build a **Research University** and the city knows enough to run a
**Cold Fusion Plant** — enormous, clean, and the last rung of the power
ladder. Bulldoze the university and fusion locks again.

**Cities are named, and you can keep as many as you like.** **File**
lists every saved city with its date, population, funds and when you last
wrote it; each can be renamed, exported to a `.json` file you can keep or
share, re-imported, or deleted. Saving under a name you have already used
overwrites that city; typing a new one keeps the city you started from.
Everything lives in your browser's localStorage.

Stuck? Press **H** for the in-game help panel, and read the **event
strip** — fires, crimes, crashes and the city's advisors all stream
through it. Drag it wherever suits you and use **⇄ / ⇅** on its handle to
switch between a one-line ticker and a newest-first log.

## Modding

Buildings, ordinances, and skins are authored content loaded through a
validate → register pipeline — the game's own content goes through the same
path. See `docs/modding.md` for the full authoring guide and a worked
example pack.

The **Mods** panel in the HUD is the in-game manager: create a mod, enable
or disable it, delete it, and export it to (or import it from) JSON that
you can hand to someone else. Inside a mod you can author custom
**ordinances** — a label, a blurb, a monthly cost, and effects on the
seven modifier knobs (industry and traffic pollution, fire ignition, cars
per transit trip, school coverage, pandemic odds and severity), each a
multiplier where below 1 reduces and above 1 increases. An enabled mod's
ordinances appear in City Hall immediately and behave like any other.
Mods persist in `localStorage`.

You can also author **buildings**. Name one, pick what it is —
decoration, power plant, service, or transit stop — set its cost,
upkeep, unlock condition, and whether it needs a shoreline, then
compose its look: size, height, colour, roof shape, and rooftop props,
over a live preview. Enabled mods' buildings show up in a **Mods**
section of the toolbar and are placed like any other building. They are
fully simulated — a mod plant powers the city, a mod fire station
covers its radius while powered, upkeep hits the budget — and they
survive saves. The look is composed from the game's own drawing
primitives rather than imported art, so authored buildings pick up
skins, render styles, and lighting automatically. Freehand drawing and
multi-tile buildings aren't supported yet.

Finally, a mod can **retune the game's own content**. The Overrides
section lists every registered building and ordinance and edits its
balance numbers — make the coal plant cost §500, widen a fire station's
reach, soften an ordinance's effect, or give a core building one of the
composed looks. Edits are sparse: only the fields you change are stored,
each one showing the inherited value until you override it, and **Reset**
puts it back. Overrides ride along with the mod when you export it, and
disabling the mod restores the original numbers. A building's identity
(the slot every save stores) is never touched, so your cities keep
opening whatever mods you have loaded.

## Docs

- Modding: `docs/modding.md`
- Backlog: `TODO.md`
- Version history: `CHANGELOG.md`

## License

MIT — see [LICENSE](LICENSE). Do what you like with it; a credit is welcome
but not required.

## A note on the name

This is an independent, non-commercial fan project. It is not affiliated with,
endorsed by, or connected to Electronic Arts or Maxis, and shares no code or
assets with any SimCity title — every building here is drawn by the code in
this repository. "SimCity" and any other trademarks referenced (including the
homage business names that appear on shopfronts) belong to their respective
owners and are used only as affectionate references.
