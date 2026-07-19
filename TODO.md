# TODO — single source of truth for upcoming work

Ordered backlog. Work items top-to-bottom unless the user redirects.
When an item ships: mark it done here (move to Done), update CHANGELOG.md,
bump package.json version, and touch README/spec per CLAUDE.md.

## Backlog (in order)

1. **Keyboard shortcuts for tools** — B bulldoze, R road, 1/2/3 zones, etc.;
   shown on the buttons and in help. *(user-requested 2026-07-19)*
2. **Collapsible toolbar categories** — click a section header to fold its
   tools away; state persists. *(user-requested 2026-07-19)*
3. **Movable panels** — drag the control/info panels (toolbar, budget,
   charts, City Hall, help) by their title bars; positions persist.
   *(user-requested 2026-07-19)*
4. **Road line tool** — click-drag previews a full road line that adjusts
   with the cursor before committing on release (4-connected stairstep for
   diagonals). *(user-requested 2026-07-19)*
5. **Disasters** — tornados, hurricanes, pandemics (fire framework exists
   to build on). *(user-requested 2026-07-19)*
6. **Weather** — rain/snow/etc., visual layer at minimum, maybe sim
   effects. *(user-requested 2026-07-19)*
7. **Terrain: mountains + desert** — taller peaks and a desert biome /
   map style. *(user-requested 2026-07-19)*
8. **Skins/styles** — selectable overall appearance, e.g. 'Springfield'
   cartoon style, 'NYC' architecture; more later, eventually user-made.
   *(user-requested 2026-07-19)*
9. **Region play** — multiple city tiles, neighbor deals (SC4 headline;
   deferred until single-city play is deep enough).
10. **Modding hooks** — data-driven building/balance definitions; folds in
    user-made skins from item 8.

## Done

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
