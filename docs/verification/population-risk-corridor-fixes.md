# Population Risk + Corridor Visual Fixes — Verification

**Date:** 2026-04-25 (evening, post quality-viz upgrade)
**Branch:** `main`
**Commits:** `368b138` → `6a6ff8c` (5 atomic commits across BLOCK_1 – BLOCK_5)

---

## Five blocks shipped

| Block | Description                                                                                                  | Status | Commit    |
| ----- | ------------------------------------------------------------------------------------------------------------ | ------ | --------- |
| 1     | ImpactCorridor2D continents (Natural Earth 1:110m) + city tooltips + pan/zoom + scale bar                    | ✅      | `368b138` |
| 2     | Real impact corridor for famous NEOs from JPL Sentry-II top virtual impactor + frontend integration          | ✅      | `2dfd9b5` |
| 3     | DeferredCorridorPlaceholder for live MPC tracklets that score as likely NEOs but lack orbit determination    | ✅      | `8e874b0` |
| 4     | AstrometricQualityLegend typography + grid layout redesign                                                   | ✅      | `8693e70` |
| 5     | PopulationRiskPanel header polish + production deploy + smoke test                                            | ✅      | `6a6ff8c` |

---

## Tests

```
161 passed in 27.12s
```

5 new tests added by BLOCK_2:

| File                           | New tests | Anchored against                                              |
| ------------------------------ | --------- | ------------------------------------------------------------- |
| test_jpl_sentry_client.py      | 5         | Bennu corridor, sigma scaling, REMOVED → null, NOT_FOUND → null, caveat content (JPL Sentry + Phase 2 + Monte Carlo) |

Total 161/161 backend tests pass overall.

---

## Frontend build

```
dist/index.html                             0.83 kB │ gzip:   0.43 kB
dist/assets/index-Bc2wLvl6.js              88.26 kB │ gzip:  24.71 kB
dist/assets/SkyViewContainer-o7TkllJX.js   66.30 kB │ gzip:  18.04 kB
dist/assets/index-Bz4DF0T1.css             63.92 kB │ gzip:  11.04 kB
```

Bundle delta vs. pre-load baseline:
- `index.js`: +3.15 KB gzipped (geojson_to_svg + ImpactCorridor2D rewrite + FamousNEOImpactCorridor + DeferredCorridorPlaceholder + corridor-type logic)
- `SkyViewContainer.js`: +0.67 KB gzipped (FamousNEOImpactCorridor wired through FamousNEODetailsPanel)
- CSS: +0.25 KB gzipped (additional Tailwind utility combinations)

`public/data/world-countries-110m.json` — Natural Earth 1:110m
public-domain GeoJSON, 167 KB raw / **54 KB gzipped** after stripping
to `{type, features[].{type, geometry, properties.NAME}}` and rounding
coordinates to 2 decimals (~1 km at equator, well under the 110m
source resolution).

**Total: ~58 KB gzipped after-load increase**, dominated by the public
data file served separately from the bundle.

---

## Deployment

- **Backend:** Pushed to GitHub; `railway up --detach` triggered the
  manual rebuild (Railway auto-deploy quirk persists). Backend redeployed
  cleanly, uptime reset to 23 s; verified via Monitor poll-loop.
- **Frontend:** `vercel --prod --yes` from repo root → deployment
  `dpl_DyZA7jGuinzrg7jr9Mv9j9Wa9Mqh`, manually aliased to
  `https://neo-triage-hack.vercel.app` because the deployment URL is the
  preview-style name.

---

## Production smoke test — 2026-04-25 ~20:50 CEST

### 1. API wire shape — `GET /api/risk/corridor/101955%20Bennu`

```
{
  "designation": "101955",
  "center_latitude_deg": 0.0,
  "center_longitude_deg": -46.0,
  "major_axis_km": 50.0,
  "minor_axis_km": 20.0,
  "orientation_deg": 0.0,
  "based_on_vi_date": "2182-09-24.85",
  "based_on_vi_ip": 0.0003702,
  "based_on_vi_sigma": 0.9093,
  "method": "jpl_sentry_approximate_b_plane",
  "caveat": "Approximate corridor from JPL Sentry-II top virtual impactor sigma + Earth-rotation uncertainty. Real production output uses full b-plane Monte Carlo (Phase 2).",
  "source": "JPL_CNEOS_SENTRY_II",
  "source_url": "https://cneos.jpl.nasa.gov/sentry/"
}
```

### 2. Apophis (REMOVED) — `GET /api/risk/corridor/99942%20Apophis`

```
null
```

Both branches behave correctly: Bennu (IN_RISK_LIST) returns a real
corridor estimate, Apophis (REMOVED) returns null so the frontend
falls back to the honest "No active Sentry-II corridor" message.

### 3. UI verification (live browser session, Vercel production)

Captured via Playwright MCP. Screenshots in `.playwright-mcp/` plus
`block5-*.png` at repo root.

| #  | Check                                                                                                           | Status |
| -- | --------------------------------------------------------------------------------------------------------------- | ------ |
| 1  | Live Feed renders QualityLegend with `A · B · C · F` colored dots in the collapsed pill                          | ✅     |
| 2  | QualityLegend expanded: 4 grade rows aligned in 2-column grid, no awkward text wraps                             | ✅     |
| 3  | Grade letters bold mono in matching colour, threshold + context stacked below the label                         | ✅     |
| 4  | Footer: "Find_Orb-style A/B/C/F grading · Bill Gray · projectpluto.com" + "Simplified — Phase 2 = full residual analysis" | ✅     |
| 5  | 54 quality badges rendered in Live Feed (one per candidate)                                                     | ✅     |
| 6  | Click P21YR4A demo → PopulationRiskPanel header shows three big numbers: 12.8 km / 14.4M / 172.9k                | ✅     |
| 7  | Three-number redesign: text-[22px] bold, slate-100/amber/rose tones, italic caveat below                        | ✅     |
| 8  | Amber `HYPOTHETICAL CORRIDOR` banner — "based on ESA NEOCC YR4 publication style (Phase 2 = full orbit determination)" | ✅     |
| 9  | Continent outlines render (`svg path[d^="M"]` count: 178 = 177 country features + ellipse path)                  | ✅     |
| 10 | 30 city dots visible across continents (`svg circle[fill="#94a3b8"]` count: 30)                                  | ✅     |
| 11 | Hover Tokyo dot → tooltip "Tokyo · Japan / 37.4M metro population / 35.7°, 139.7°"                                | ✅     |
| 12 | ZOOM 1.0× / RESET HUD top-left, N compass top-right, scale bar `4.0k km` bottom-left                              | ✅     |
| 13 | Damage circle (red dashed) at impact hypothesis (Manila)                                                         | ✅     |
| 14 | Click P22mTAx (live MPC, prob_neo=0.999) → DeferredCorridorPlaceholder appears below the briefing                 | ✅     |
| 15 | Header pill reads `DEFERRED · PENDING OD` with neutral slate styling                                             | ✅     |
| 16 | Body: "POPULATION RISK DEFERRED. P22mTAx has 173 min of arc across 5 observations — insufficient for the orbit determination…" | ✅     |
| 17 | Educational paragraph: "neo-triage exists to triage candidates before this stage… JPL Sentry-II / ESA Aegis"     | ✅     |
| 18 | "Phase 2: Find_Orb integration ↗ → orbit fits in seconds → b-plane Monte Carlo"                                   | ✅     |
| 19 | `/api/risk/corridor/101955 Bennu` returns a real estimate; `/api/risk/corridor/99942 Apophis` returns `null`     | ✅     |
| 20 | Footer attribution: "continent outlines from Natural Earth (1:110m, public domain)"                              | ✅     |

All 20 production smoke-test points pass.

---

## Three corridor types — honest disclosure compliance

| Source                    | Banner colour | Banner text                                                                                       |
| ------------------------- | ------------- | ------------------------------------------------------------------------------------------------- |
| `real_jpl_sentry`         | Emerald       | "✓ Real corridor — approximate from JPL Sentry-II top virtual impactor … · Phase 2 = full b-plane Monte Carlo" |
| `demo_hypothetical`       | Amber         | "⚠ Hypothetical corridor — based on ESA NEOCC YR4 publication style (Phase 2 = full orbit determination)" |
| `deferred_pending_od`     | Slate         | DeferredCorridorPlaceholder body (no map, full educational message)                                |

Every visible surface credits its data origin and references the
Phase 2 path. The Find_Orb attribution is preserved on the
QualityLegend redesign and on the deferred placeholder. The Natural
Earth GeoJSON is cited in the corridor footer and tracked in
`frontend/public/data/world-countries-110m.LICENSE.txt`.

---

## What changes for the operator (and for the jury)

**Before this load:**
1. The corridor map showed grey city dots floating in a slate void — no
   continents, native title-tooltips only.
2. PopulationRiskPanel only rendered for the demo P21YR4A. Live MPC
   tracklets that the ranker called as likely NEOs silently dropped
   the panel.
3. The QualityLegend in the Live Feed had ill-fitting text — context
   ran into thresholds, footer attributions overflowed.
4. The three-number header (12.8 km / 14.4M / 172.9k) was visually
   uniform — the eye couldn't tell casualty count apart from population
   count at a glance.

**After this load:**
1. **Continent outlines** — 177 Natural Earth countries render as
   slate-700 strokes on slate-800 fill. Cities sit on the actual
   continents. Pan/zoom/reset/scale bar make the map feel like a map.
2. **City tooltips** — every dot reveals name, country, metro
   population and coordinates on hover. No more "what are these?"
3. **Three corridor types**, all honestly labelled:
   - Famous NEO with active Sentry-II entry → emerald banner +
     approximate b-plane corridor sized from sigma.
   - Demo P21YR4A → amber banner + ESA NEOCC YR4-style hypothetical
     band (preserved exactly as before).
   - Live MPC tracklet without OD → slate banner +
     DeferredCorridorPlaceholder explaining the
     triage → orbit → corridor pipeline.
4. **QualityLegend grid layout** — 2-column dot-and-content with three
   stacked rows per grade (letter+label / thresholds / context). Find_Orb
   attribution and Phase 2 caveat split onto separate lines so neither
   can overflow.
5. **Three-number header** — text-[22px] bold, semantic tone palette
   (amber for damage, slate-100 headline weight for population, rose
   for casualties). Context line below the value, italic caveat below
   that.

The honest-disclosure pattern from the planetary-defense-grade and
quality-visualization upgrades is preserved on every new surface:
each corridor source declares its provenance, each placeholder names
its Phase 2 path, the GeoJSON is licence-tracked.

---

## Resources used

- Development time: ~2.5 h (under the 3.17 h budget)
- Anthropic API spend during this session: ~$0 (no Opus calls outside
  the cached briefings on the page; all API verification via curl)
- Repository commits: 5 atomic commits, each independently revertable
- Lines added: ~1 100 (Natural Earth GeoJSON 167 KB strip, geojson_to_svg
  helper +56, world_cities expansion +35, ImpactCorridor2D rewrite
  +400, FamousNEOImpactCorridor +180, DeferredCorridorPlaceholder +75,
  Sentry corridor backend +100, tests +60)

---

## Production URLs

- Frontend: https://neo-triage-hack.vercel.app
- Backend: https://neo-triage-backend-production.up.railway.app
- Repo: https://github.com/Ricko12vPL/neo-triage-hack
