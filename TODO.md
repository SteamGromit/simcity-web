# TODO — single source of truth for upcoming work

Ordered backlog. Work items top-to-bottom unless the user redirects.
When an item ships: mark it done here (move to Done), update CHANGELOG.md,
bump package.json version, and touch README/spec per CLAUDE.md.

## Backlog (in order)

1. **Ordinances; advisors** — city policies with budget/sim effects; advisor
   panel surfacing problems (builds on the tips advisor from v0.8).
2. **Water utility** — pumps + pipes as a second network layer.
3. **Day/night cycle** — visual layer; building windows light up.
4. **Region play** — multiple city tiles, neighbor deals (SC4 headline;
   deferred until single-city play is deep enough).
5. **Modding hooks** — data-driven building/balance definitions.

## Done

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
