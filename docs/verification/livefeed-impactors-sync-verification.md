# Live Feed ↔ Impactors Library — Sync Verification

**Date:** 2026-04-25 (late evening, post Imminent Impactors Library)
**Branch:** `main`
**Commits:** `3ff2536` → `e25210e` (3 atomic commits across BLOCK_2 – BLOCK_3)

---

## Why this load existed

The earlier Imminent Impactors Library load shipped the IMPACTORS tab
with the real ESA NEOCC 2024 YR4 risk corridor — Pacific → Bangladesh,
~110M people, peak Torino 3, IAWN+SMPAG activated. But the LIVE FEED
flow for the same object (P21YR4A demo) still rendered the legacy
"Manila representative" hypothetical zone. **Same object, two
different stories** — credibility-breaking inconsistency for any
juror who flipped between tabs.

This load synchronizes the two surfaces by making the catalog the
single source of truth.

---

## What changed

### Backend (`3ff2536`)

`Candidate.impactor_case_designation: str | None = None` — nullable
pointer from a candidate to its matching entry in the Imminent
Impactors Library catalog. Set on the P21YR4A demo fixture to
`"2024 YR4"`. Every other demo fixture and every live NEOCP
tracklet keeps the field at `None`.

5 backend tests:

| Test                                                            | Anchored against                          |
| --------------------------------------------------------------- | ----------------------------------------- |
| `test_p21yr4a_links_to_2024_yr4_case`                           | P21YR4A → '2024 YR4'                       |
| `test_other_demo_fixtures_have_null_case`                       | All other demos = None                    |
| `test_candidate_field_defaults_to_none`                         | Default constructor invariant             |
| `test_api_response_includes_impactor_case_designation_for_p21yr4a` | HTTP wire shape on P21YR4A             |
| `test_api_response_other_rows_have_null_designation`            | No row leaks a designation accidentally   |

### Frontend (`e25210e`)

New `useImpactorCase(designation)` hook with module-level cache,
fetches `/api/imminent-impactors/{designation}`. Re-selecting the
same designation is instant.

`PopulationRiskPanel` rewritten to branch on the catalog:

| Branch                  | Trigger                                                  | Renders                          |
| ----------------------- | -------------------------------------------------------- | -------------------------------- |
| `catalog_linked`        | `impactor_case_designation` set + catalog returned a case | Real corridor + catalog numbers  |
| `deferred_pending_od`   | No designation, prob_neo ≥ 0.5, !is_demo                  | DeferredCorridorPlaceholder      |
| `null`                  | Anything else (low-prob, demo without catalog match)     | nothing (hidden)                 |

The catalog-linked panel computes its three numbers from catalog data:

- **Damage zone**: Collins et al. 2017 5-psi scaling from
  `case.diameter_m` + `case.impact_velocity_km_s` (defaults to
  17 km/s for cleared cases without a recorded entry velocity).
  Identical formula to the backend's `impact_damage_model.py`.
- **In corridor**: `case.estimated_population_in_corridor` directly.
  For 2024 YR4 this is 110 000 000 — the figure published by
  BusinessToday Feb 2025 + David Rankin's Catalina Sky Survey
  corridor analysis.
- **Casualties at peak**: `population × peak_impact_probability ×
  0.5`. Casualty fraction Glasstone & Dolan 1977 midpoint;
  probability is the catalog's recorded peak (3.1% for YR4).

The map rendered is `ImpactorsMap` — the same component the
IMPACTORS tab uses — with `cases=[]` so no other markers appear,
and `selectedCase=fullYR4`. Result: identical visual to the
IMPACTORS tab, including the CLEARED 2025-03-25 banner.

Banner copy switched from
> "⚠ Hypothetical corridor — based on ESA NEOCC YR4 publication style"

to

> "✓ Reproduces ESA NEOCC published 2024 YR4 risk corridor (Feb 2025)"

Footer prose now says "Phase 2 roadmap = Find_Orb b-plane Monte
Carlo" — the previous wording sometimes read as if it described
current state.

`IAWN ACTIVATED` / `SMPAG CONVENED` badges shown when the catalog
flags them (true for YR4 only).

---

## Tests

```
186 passed in 91.07s
```

Delta vs. prior load (181 → 186 = +5 backend tests). Frontend
verification is visual + Playwright (no frontend test runner in
this repo).

---

## Frontend bundle

```
dist/assets/jsx-runtime-m7G7yzlP.js                 8.53 kB │ gzip:   3.26 kB
dist/assets/ImminentImpactorsLibrary-C3zQe2UZ.js   13.43 kB │ gzip:   3.77 kB
dist/assets/SkyViewContainer-B5A5eqgN.js           76.65 kB │ gzip:  21.32 kB
dist/assets/index-CH_qs4mG.js                     264.06 kB │ gzip:  79.88 kB
```

Bundle delta vs. pre-load baseline:

- `ImminentImpactorsLibrary` chunk: 6.49 KB → 3.77 KB (smaller —
  `ImpactorsMap` and `world_cities.ts` now consumed by Live Feed
  too, so they migrated into the main chunk and out of the lazy
  split).
- `index.js`: +0.00 KB gzipped (the migrated modules add weight,
  but removing the legacy Manila branch + state offsets it; net
  zero on gzip).
- `SkyViewContainer.js`: +3.23 KB gzipped (`ImpactCorridor2D` is
  retained for `FamousNEOImpactCorridor`, the JPL Sentry real
  corridor case in Sky View, so it now lives in this chunk).

Net: ~3 KB gzipped after-load increase, dominated by the small
re-shuffle. The Natural Earth GeoJSON (54 KB gzipped) is unchanged.

---

## API verification — production (post-deploy)

### `GET /api/rank/?limit=200&include_demo=true`

```json
[
  {
    "trksub": "P21YR4A",
    ...
    "impactor_case_designation": "2024 YR4"
  },
  {
    "trksub": "P22mTAA",
    ...
    "impactor_case_designation": null
  }
]
```

P21YR4A points to the catalog; everything else is null.

### `GET /api/imminent-impactors/2024 YR4`

Returns the full case:
- `corridor_polyline` 11 vertices (Pacific → Bangladesh)
- `estimated_population_in_corridor`: 110 000 000
- `peak_impact_probability`: 0.031
- `cleared_date`: "2025-03-25"
- `iawn_activated`: true, `smpag_activated`: true
- 4 source citations

---

## What changes for the operator (and for the jury)

**Before:**

1. Click P21YR4A in LIVE FEED → see Manila impact zone, "14.4M
   metro population", "172.9k casualties", "⚠ Hypothetical
   corridor — based on ESA NEOCC YR4 publication style".
2. Switch to IMPACTORS tab → see Pacific → Bangladesh corridor,
   "~110M in corridor", "✓ Reproduces ESA NEOCC published Feb 2025".
3. **Same object, two different stories.** Credibility-breaking
   inconsistency.

**After:**

1. Click P21YR4A in LIVE FEED → catalog hook fetches /api/imminent-impactors/2024 YR4
   → panel renders ESA corridor + 110M figure + IAWN/SMPAG badges
   + "Reproduces ESA NEOCC published" banner.
2. Switch to IMPACTORS tab → identical data (same hook, same fetch,
   same payload).
3. **One object, one story.** Cross-tab consistency verified.

For non-demo objects:

- Live MPC tracklet with `prob_neo ≥ 0.5` → DeferredCorridorPlaceholder
  explains the triage → orbit → corridor pipeline (no fake corridor
  rendered).
- Live MPC tracklet with `prob_neo < 0.5` → panel hidden entirely.
- Other demo fixtures without a real-world counterpart → panel
  hidden (no synthetic Manila placeholder anywhere).

---

## Honest disclosure compliance

- Single source of truth (catalog): YES — both tabs fetch from
  `/api/imminent-impactors/{des}` via the same `useImpactorCase`
  hook.
- Cross-tab data parity: YES — verified by the catalog endpoint
  returning identical payloads in both render paths.
- Banner copy matches reality: YES — corridor IS reproducing the
  ESA Feb 2025 publication.
- Phase 2 roadmap clarification: YES — footer says "roadmap" not
  "production".
- No invented data: YES — all numeric values trace to catalog →
  ≥2 cited sources.

---

## Production URLs

- Frontend: https://neo-triage-hack.vercel.app (alias updated to
  `dpl_neb4fqfti...`)
- Backend: https://neo-triage-backend-production.up.railway.app
- Repo: https://github.com/Ricko12vPL/neo-triage-hack
