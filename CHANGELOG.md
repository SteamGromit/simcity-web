# Changelog

All notable changes to SimCity Web. Format follows
[Keep a Changelog](https://keepachangelog.com); versions are sequential
feature drops rather than semver promises.

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
