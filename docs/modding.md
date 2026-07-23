# Modding SimCity Web

SimCity Web's own content — every building, ordinance, and skin you see in a
fresh city — is a **data package** loaded through the same validate → register
pipeline a mod uses. This document is the authoring guide for that pipeline.

**Status: there is no player-facing mod manager yet.** You cannot install a
pack from a menu, and packs are not distributed or shared between players.
What exists today is the pipeline itself and a debug hook,
`window.__simcity.loadPack(...)`, that loads a pack into the current browser
tab for the rest of the session. A drawing/authoring UI and a real mod manager
are tracked as their own future item (TODO backlog item #2). If you're reading
this to build tooling against the pipeline, or to hand-author a pack and load
it via the console while testing, you're in the right place.

## The package shape

A pack is one JSON object (or a plain JS object, if you're calling the hook
from code) matching this shape:

```ts
interface Pack {
  id: string;         // package identity; "core" is reserved for the game's own content
  name: string;
  version: string;
  buildings?: BuildingDef[];
  ordinances?: OrdinanceDef[];
  skins?: SkinDef[];
}
```

All three content arrays are optional — a pack can add just an ordinance, or
just a skin. `id`, `name`, and `version` are required, non-empty strings.
`version` is a free-form string (not currently used for compatibility
checks); it's there for your own bookkeeping and for future tooling.

Re-registering a pack with an id that's already loaded **replaces** that
pack's content wholesale — it doesn't merge or duplicate. This is how the
game itself reloads content and how you iterate on a pack across multiple
`loadPack` calls while testing.

## Buildings

```ts
interface BuildingDef {
  id: string;
  slot?: number;
  name: string;
  tool?: string;
  cost: number;
  upkeep: number;
  unlock?: { expr: string; label: string };
  power?: { capacity: number; pollution: number };
  service?: { kind: 'fire' | 'police' | 'school' | 'health' | 'bus'; radius: number; share?: number };
  transit?: { radius: number; share: number };
  siting?: { needsWater?: boolean };
}
```

Field by field:

- **`id`** (required) — stable identity. Namespace it: `mypack:coal_scrubber`,
  not `coal_scrubber`. Two buildings in the same pack cannot share an id, and
  ids must be unique across every pack loaded in the session.
- **`slot`** (optional) — the runtime handle. This is the piece that needs the
  most care; see [Pinned slots](#pinned-slots-and-why-core-ids-never-change)
  below. Omit it for a mod building — one is allocated for you.
- **`name`** (required) — the display name shown in the toolbar and building
  info panels.
- **`tool`** (optional) — the toolbar tool id that places this building.
  Building definitions without a `tool` describe something that isn't
  player-placed via the toolbar (there's no such core content today, but the
  field is optional for exactly this kind of future use — a growable-ladder
  building the sim places automatically, for instance).
- **`cost`** (required) — placement price, `>= 0`.
- **`upkeep`** (required) — monthly upkeep charged while the building stands,
  `>= 0`. Use `0` for things like roads that cost nothing monthly.
- **`unlock`** (optional) — gates the building behind a population/economy
  condition. Omit it and the building is available from the start. See
  [The expression language](#the-expression-language) below. Both `expr` and
  `label` are required together: `label` is the human phrasing the UI prints
  (e.g. a toolbar hint reading "Wind Turbine at pop 2,000") — it can't be
  derived from `expr` automatically because expressions can combine
  conditions in ways that don't reduce to a single readable phrase.
- **`power`** (optional) — marks this as a power plant. `capacity` is how much
  load it can serve; `pollution` is a scale factor (core plants range from
  `0` for wind/solar/hydro to `1.0` for the coal plant).
- **`service`** (optional) — marks this as a civic service building.
  `kind` picks which coverage system it feeds; `radius` is its coverage
  reach; `share` is only meaningful for `kind: 'bus'`, where it means the
  same thing as `transit.share` on a `transit` block (fraction of a
  covered trip's traffic that still hits the road; the core bus stop uses
  0.5).
- **`transit`** (optional) — marks this as a non-bus transit station
  (streetcar, monorail, subway, rail). `radius` is stop coverage; `share` is
  the fraction of a covered trip's traffic that *still hits the road* after
  transit takes its cut — lower is better; the core lineup ranges from 0.4
  (streetcar) down to 0.15 (rail). When both trip ends are covered, the
  worse (higher-share) end bounds the ride.
- **`siting`** (optional) — placement restrictions beyond road/power. Today
  the only key is `needsWater`, which the core hydro plant uses (it must sit
  next to open water).

A building can combine `power`, `service`, or `transit` — nothing stops a
mod building from being, say, a power plant that is also a service building
— but core content never does, and the sim's downstream code generally
assumes at most one of these per definition. Stick to one capability per
building unless you've read the code paths that consume it.

**A mod building registers, but nothing in the current UI lets a player
place it.** The toolbar's build buttons are still a fixed, hand-authored
list keyed by a closed `ToolId` union — they are not generated from
`allBuildings()`. A building you load through `loadPack` becomes fully real
to the content system (it's in the registry, has a slot, is
lookup-able by id/slot/tool, and would round-trip through a save if a tile
ever pointed at its slot), but there is currently no toolbar button, no
build-menu entry, and no way to click-place it in a running game. Ordinances
and skins don't fare any better here, for a related reason — see the caveat
under [Loading a pack](#loading-a-pack-windowsimcityloadpack) below. Wiring
the existing panels (and the toolbar) to reflect the live registry is
exactly the kind of work the mod editor (TODO #2) covers.

## Ordinances

```ts
interface OrdinanceDef {
  id: string;
  label: string;
  blurb: string;
  cost: number;
  effects: Partial<Record<ModifierKey, number>>;
}
```

- **`id`** (required) — see [Pinned slots](#pinned-slots-and-why-core-ids-never-change):
  unlike buildings, an ordinance's id **is** its save identity. Namespace
  mod ordinance ids (`mypack:carbon_tax`); never reuse a core id
  (`cleanAir`, `freeBus`, `fireCode`, `eduGrant`, `healthDrive`).
- **`label`** (required) — the name shown in City Hall's ordinance list.
- **`blurb`** (required) — one sentence of flavor/explanation, shown under
  the label.
- **`cost`** (required) — monthly cost while the ordinance is enacted,
  `>= 0`.
- **`effects`** (required) — a map from [modifier key](#the-modifier-vocabulary)
  to a multiplier. Every key must be one of the seven recognized keys; an
  unrecognized key is a validation error, not a silently ignored typo.

## Skins

```ts
interface SkinDef {
  id: string;
  label: string;
  blurb: string;
  hue: { mode: 'identity' } | { mode: 'wrap'; base: number; span: number };
  sat: { mul?: number; add?: number };
  light: { mul?: number; add?: number };
  outline: number;
  heightScale: number;
  grassSat: number;
  roadFill: string;
}
```

A skin is a declarative HSL transform applied to every procedurally-drawn
building face — there are no image assets to swap; skins restyle the same
draw code.

- **`id` / `label` / `blurb`** (required) — identity and the text shown in
  the skin picker. Like ordinances, a skin's id is stored (in
  `localStorage`, as the active skin), so don't reuse a core skin id
  (`classic`, `springfield`, `nyc`) unless you deliberately want to
  override it.
- **`hue`** (required) — how building hues are remapped.
  - `{ mode: 'identity' }` leaves hue untouched.
  - `{ mode: 'wrap', base, span }` remaps hue to `base + (h % span)` —
    compresses every incoming hue into a `span`-degree band starting at
    `base`. The core `nyc` skin uses `{ base: 15, span: 40 }` to push
    everything toward brownstone/brick tones.
- **`sat`** / **`light`** (required, may be `{}`) — each is
  `output = input * (mul ?? 1) + (add ?? 0)`, clamped to `[0, 100]`.
  `{}` means "leave it alone" (`mul` defaults to `1`, `add` to `0`).
- **`outline`** (required) — cartoon outline width around building faces in
  pixels; `0` means no outline.
- **`heightScale`** (required) — multiplier on building heights; `1` is
  normal, `< 1` squats buildings, `> 1` stretches them.
- **`grassSat`** (required) — multiplier on ground/grass saturation.
- **`roadFill`** (required) — a CSS color string for road fill, e.g.
  `'#3a3d42'`.

## Pinned slots, and why core ids never change

The simulation runs on a numeric `Zone` enum, and every save stores tiles as
raw zone numbers — there are roughly twenty places in the sim that still do
`switch (tile.zone) { ... }`. That enum isn't going away, so the content
system layers stable string identity on top of it instead of replacing it:

- Every `BuildingDef` has a stable **id** (`core:coal_plant`) and a numeric
  **slot** — the `Zone` value the tile actually stores.
- **Core buildings declare their slot explicitly**, pinned to today's
  historic `Zone` numbers, forever. `core:coal_plant` is slot 5 (`Zone.PowerPlant`)
  and always will be, because existing saves have tiles with `zone: 5` on
  them that must keep meaning "coal plant" no matter what packs are loaded
  later.
- **A mod building omits `slot`.** The registry allocates one automatically,
  starting at `MOD_SLOT_BASE` (1000) and counting up, in the order packs are
  registered. You never choose a mod slot number yourself — declaring one
  that collides with a slot another already-registered pack pinned is a
  load error, not a silent overwrite.
- Every save also writes a **legend** (slot → id, for every slot the city
  actually uses). On load, each tile's zone number is resolved through the
  legend's id back to *this session's* slot for that id — so a save you made
  with a mod's buildings loaded still opens correctly even if that mod
  allocated its slots in a different order this time. A slot the legend
  mentions but this session's registry doesn't know clears the tile
  (`Zone.None`) rather than misrendering as whatever now happens to occupy
  that number.

**Ordinances and skins work differently: their ids are the save identity
directly**, not a level of indirection over a numeric slot. A save's
`ordinances` object is keyed by ordinance id (`{ cleanAir: true, ... }`), and
`localStorage` stores the active skin's id as a bare string. There's no slot
layer to remap through, so the ids themselves must be pinned. This is why
core ordinance ids (`cleanAir`, `freeBus`, `fireCode`, `eduGrant`,
`healthDrive`) and core skin ids (`classic`, `springfield`, `nyc`) are
permanent, and why your mod content should namespace its ids
(`mypack:carbon_tax`, `mypack:noir`) to guarantee it never collides with core
content or another mod.

## The modifier vocabulary

Ordinance `effects` may only set these seven keys. Effects **multiply**
across every currently-enacted ordinance — the identity value is `1`, so an
ordinance that doesn't mention a key leaves it untouched, and two ordinances
that both touch the same key compound (two ordinances each halving fire
ignition risk leave it at 25%, not 0%).

| Key | What it scales | Direction |
| --- | --- | --- |
| `pollution.industry` | Pollution emitted by industrial tiles | `< 1` reduces it |
| `pollution.traffic` | Pollution emitted by road traffic | `< 1` reduces it |
| `fire.ignition` | Chance a building catches fire | `< 1` reduces it |
| `transit.share` | Fraction of a transit-covered trip's traffic that still hits the road after transit takes its share | `< 1` removes more cars from the road |
| `coverage.school` | Effective strength of school coverage across its reach | `> 1` makes coverage count for more |
| `disaster.pandemicOdds` | Chance a pandemic starts in a given period | `< 1` reduces it |
| `disaster.pandemicToll` | Severity of an active pandemic (abandonment/demand hit) | `< 1` reduces it |

A pack cannot invent an eighth knob — the sim only reads these seven, so
`validate` rejects any other key in `effects` as an error naming the bad key,
rather than silently ignoring an author's typo.

## The expression language

`unlock.expr` on a `BuildingDef` is a tiny expression evaluated against a
flat record of **city-level scalars** — there's no per-tile context, no
functions, no strings, and no `eval`: a pack from a stranger can't run
arbitrary code through it.

**Context keys available to an expression:**

`population`, `funds`, `jobs`, `month`, `year`, `eduLevel`, `demandR`,
`demandC`, `demandI`, `brownouts`

**Grammar:** number literals, the context identifiers above, parentheses,
unary `-` and `!`, and the binary operators `|| && == != < <= > >= + - * / %`
with ordinary precedence (`||` lowest, then `&&`, then comparisons, then
`+ -`, then `* / %` highest) and left associativity. Division and modulo by
zero evaluate to `0` rather than `NaN` or throwing, so a pathological
expression can't poison downstream balance math.

A result is treated as truthy when non-zero — comparisons and boolean
operators already produce `0` or `1`.

Examples:

```
population >= 2000
population >= 10000 && eduLevel > 0.5
funds > 5000 || year >= 10
```

A malformed expression (bad syntax, an identifier outside the allowed set, a
disallowed function-call-looking token) is a **validation error at load
time**, naming the problem — never a runtime throw.

## The worked example: a complete valid pack

Here's a small pack exercising all three content types, valid against every
rule `validate.ts` checks (unique ids, non-negative cost/upkeep, only
recognized modifier keys, a parseable `unlock.expr`, well-formed skin
transform objects):

```json
{
  "id": "riverside",
  "name": "Riverside Pack",
  "version": "1.0.0",
  "buildings": [
    {
      "id": "riverside:water_treatment",
      "name": "Water Treatment Plant",
      "tool": "riverside_wtp",
      "cost": 4000,
      "upkeep": 80,
      "unlock": { "expr": "population >= 8000", "label": "pop 8,000" },
      "service": { "kind": "health", "radius": 6 },
      "siting": { "needsWater": true }
    },
    {
      "id": "riverside:tidal_turbine",
      "name": "Tidal Turbine",
      "tool": "riverside_tidal",
      "cost": 3200,
      "upkeep": 40,
      "unlock": { "expr": "population >= 12000 && eduLevel > 0.4", "label": "pop 12,000, educated workforce" },
      "power": { "capacity": 180, "pollution": 0 },
      "siting": { "needsWater": true }
    }
  ],
  "ordinances": [
    {
      "id": "riverside:river_cleanup",
      "label": "River Cleanup Initiative",
      "blurb": "Dredging and shoreline restoration cut industrial runoff sharply.",
      "cost": 175,
      "effects": { "pollution.industry": 0.6 }
    }
  ],
  "skins": [
    {
      "id": "riverside:overcast",
      "label": "Overcast",
      "blurb": "A cool, desaturated look for a rainy river town.",
      "hue": { "mode": "wrap", "base": 200, "span": 60 },
      "sat": { "mul": 0.7 },
      "light": { "mul": 0.95, "add": -3 },
      "outline": 0,
      "heightScale": 1,
      "grassSat": 0.8,
      "roadFill": "#41474d"
    }
  ]
}
```

Note the namespaced ids throughout (`riverside:water_treatment`, not
`water_treatment`) and that neither building declares a `slot` — both get
one allocated at or above `MOD_SLOT_BASE` (1000) the moment the pack loads.

## Loading a pack: `window.__simcity.loadPack`

There is no in-game UI for this yet. The only way to get a pack into a
running session is the browser console:

```js
__simcity.loadPack({ id: 'riverside', name: 'Riverside Pack', version: '1.0.0', /* ...as above... */ });
```

`loadPack` accepts either a JSON string (it will `JSON.parse` it for you) or
a plain object. It returns synchronously:

- **`{ ok: true }`** — the pack is registered in the content system: its
  buildings, ordinances, and skins are immediately in the registry, reachable
  by id/slot/tool, and would participate correctly in a save made from this
  point on. The renderer is reseeded so any newly-registered content picks up
  correct per-tile visual variation. **This is registry-level availability,
  not UI availability** — see the important caveat right below.
- **`{ ok: false, errors: string[] }`** — the pack was rejected and *nothing*
  changed. Each string in `errors` names a specific problem (which entry,
  which field, what was wrong), and validation collects every problem it
  finds rather than stopping at the first — so a single call tells you
  everything wrong with the pack, not just the first mistake.

Example of a rejected pack, and why:

```js
__simcity.loadPack({
  id: 'bad', name: 'Bad', version: '1',
  ordinances: [{ id: 'x', label: 'X', blurb: 'X', cost: 1, effects: { nope: 1 } }],
});
// => { ok: false, errors: ['ordinances[0] (x): unknown modifier key "nope"'] }
```

This hook mirrors the existing `localStorage.simcity.nightlock` debug-hook
convention elsewhere in the codebase: a low-ceremony escape hatch for
exercising a code path that doesn't have — and isn't meant to have, yet — a
player-facing surface.

**Important: existing panels build their rows once at page load, not from
the live registry on every open.** City Hall's ordinance checkboxes and
Config's skin buttons are each constructed a single time when their panel is
first built (at page load), by iterating the registry *at that moment*.
Calling `loadPack` afterward registers the new content correctly, but does
not retroactively add a row to either panel — so a newly-loaded ordinance or
skin will not visibly appear there in the running tab. Worse, if you open
City Hall *after* registering a new ordinance mid-session, its checkbox-sync
logic indexes into the (now too-short) list of DOM checkboxes positionally
and throws a `TypeError` in the console; the panel still opens, but stops
updating that pass. Reloading the page rebuilds both panels against
whatever's registered at that reload — but a pack loaded only through
`loadPack` isn't persisted anywhere, so a reload takes you back to just the
core pack, not forward to a working view of your pack. In short: today,
`loadPack` is a way to exercise and test the validate → register pipeline
itself (and to affect sim state directly, e.g. by toggling
`city.ordinances['mypack:thing'] = true` yourself), not a way to get modded
content in front of a player through the existing UI. Making these panels
(and the toolbar) reflect the live registry is exactly what the mod manager
(TODO #2) needs to do.

## What this doesn't do (yet)

This pass ships the data pipeline and the debug hook, nothing more:

- **No mod manager.** There's no in-game menu to browse, enable, disable, or
  persist packs across sessions — `loadPack` affects only the current tab
  for as long as it stays open. Reload the page and you're back to just the
  core pack.
- **No pack distribution or sharing.** There's no file format for
  distributing a pack, no way to attach one to a save, and no registry or
  marketplace. A save made with a mod's buildings placed will still open
  later (via the legend), but the mod itself isn't bundled with the save —
  you'd need to load that same pack again yourself.
- **No authoring UI.** Packs are hand-written JSON/JS objects today. A
  drawing/property-editor UI for building content visually is tracked
  separately as its own future item.
- **Growable R/C/I ladders are still hardcoded.** Placeable buildings
  (plants, services, transit stations) are content; the zoning-grown
  residential/commercial/industrial stage ladder, its population/jobs
  tables, and its archetypes are not, and are out of scope for this pass.

If you're building against this pipeline expecting any of the above, it
isn't there yet — check `TODO.md` for what's planned next.
