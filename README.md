# SimCity Web

A browser city-building game inspired by **SimCity 4**, built with TypeScript
and Canvas 2D. No frameworks, no art assets — every building is drawn
procedurally and every sound is synthesized in the browser.

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
  night with glowing windows and streetlights.

## Run it

```sh
npm install
npm run dev      # open the printed localhost URL
```

`npm test` runs the simulation's unit suite; `npm run build` makes a
production bundle.

## How to play

New maps come with lakes, forests, and **rolling hills**. Before you build
anything, the **terrain tools** (Water / Forest / Level Land / Raise /
Lower) are free — sculpt the geography to taste; once the city is founded
they cost money. Nothing can be built on water or forest, but living near
them (or up on a hillside with a view) raises land value.

Roads climb hills one level at a time — a two-level **cliff** stops them
cold, so grade your routes or go around. The Road tool also builds
**bridges** straight over water (§50 a tile). Power lines don't mind
cliffs.

Start with a **coal plant**, draw a **road**, then zone **residential /
commercial / industrial** beside the road (within 2 tiles). Buildings need
both road access and power to develop.

Power conducts through adjacent zones and buildings but **not across roads or
empty land** — string power lines to bridge gaps (lines can be placed on road
tiles to cross them). Unpowered zones show a yellow ⚡ bolt; hook them up with
a line from the plant or by zoning a connected path. The Power data view shows
what's connected.

**Water** works the same way: build a powered **Water Pump** within two
tiles of open water and the supply spreads through adjacent buildings;
**Pipes** bridge gaps and cross under roads. Buildings need running water
to grow past stage 2.

Keep industry (and the coal plant) away from homes: pollution wrecks
residential land value. Parks raise it.

Roads have **capacity** — a jammed artery makes every commute through it
longer, which drags down desirability and land value. Relieve it with
parallel routes, or place **bus stops** near homes *and* jobs: covered
commutes put half the cars on the road.

Growing past small buildings takes **civic services**: fire coverage unlocks
stage 2, police + school coverage unlock stage 3, and a **hospital** in reach
unlocks the tallest towers (industry skips the school and hospital
requirements). Stations need power, cover a radius (see the coverage data
views), and charge monthly upkeep.

Buildings with no fire coverage can **catch fire — and fires spread** to
neighboring buildings, covered or not (coverage resists the jump and fights
the blaze). Watch for the flames and the advisor warning; if the fire
department can't cope, bulldoze a firebreak before the whole block goes.

Watch the budget — roads, plants, and services cost upkeep monthly; taxes
above 9% suppress demand. Open **City Hall** for the advisor board (every
current warning at a glance) and to enact **ordinances** — monthly-cost
policies like the Clean Air Act or Free Bus Service that bend the
simulation in your favor.

| Control | Action |
| --- | --- |
| Left click / drag | apply tool (zones, parks, bulldoze drag out a rectangle; roads paint) |
| Minimap click | jump the camera |
| Charts button | population and funds history |
| Query tool | inspect any tile |
| Middle-drag or Space+drag | pan (arrow keys work too) |
| Q / E (hold) | rotate the view — full 360° |
| Mouse wheel | zoom |
| H or ? | help panel |
| M | mute / unmute sound |
| Esc | deselect tool |
| ⏸ ▶ ▶▶ ▶▶▶ | pause / normal / fast / cheetah |

Save/Load keeps one city in your browser's localStorage.

Stuck? Press **H** for the in-game help panel, and keep an eye on the 💡
**advisor tip** in the bottom-left corner — it watches the city and points
out the most pressing problem (no power, no road access, deficits, fires,
pollution…). Dismiss a tip with × and it stays quiet unless the problem
comes back.

## Design docs

- Spec: `docs/superpowers/specs/2026-07-18-simcity-web-design.md`
- Plan: `docs/superpowers/plans/2026-07-18-simcity-v1.md`
- Backlog: `TODO.md`
