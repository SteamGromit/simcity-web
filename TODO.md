# TODO — single source of truth for upcoming work

Ordered backlog. Work items top-to-bottom unless the user redirects.
When an item ships: mark it done here (move to Done), update CHANGELOG.md,
bump package.json version, and touch README/spec per CLAUDE.md.

## Backlog (in order)

1. **Health services + disasters** — completes civic services: hospital
   coverage; fire outbreaks that spread and burn buildings (fire coverage
   finally pays off), maybe meteor/tornado for fun.
2. **Terrain elevation + bridges** — raise/lower land, slopes, cliffs;
   bridges over water. (Remainder of terrain roadmap item.)
3. **Congestion-aware pathfinding; mass transit** — commute cost rises with
   load; bus/subway to relieve it.
4. **Ordinances; advisors** — city policies with budget/sim effects; advisor
   panel surfacing problems (builds on the tips advisor from v0.8).
5. **Water utility** — pumps + pipes as a second network layer.
6. **Day/night cycle** — visual layer; building windows light up.
7. **Region play** — multiple city tiles, neighbor deals (SC4 headline;
   deferred until single-city play is deep enough).
8. **Modding hooks** — data-driven building/balance definitions.

## Done

- **Sound effects** — shipped v0.9.0 (procedural Web Audio cues per tool,
  ambient population hum, mute on M, `ui/sound.ts`).
- **In-game help/tips** — shipped v0.8.0 (help panel on H/?, contextual
  advisor tip bar driven by `sim/tips.ts`).
- v0.7.0 and earlier: see CHANGELOG.md.
