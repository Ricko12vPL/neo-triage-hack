# Data Authenticity & Currency — Master Verification Report

**Verification run:** 2026-04-24 evening (Warsaw)
**Target:** pre-submission confidence check for the Anthropic × Cerebral Valley
"Built with Opus 4.7" hackathon. Any claim made in the demo about data
freshness or astronomical correctness is backed by reproducible evidence
in this folder.

## Executive summary

| Area | Verdict | Evidence |
|---|:-:|---|
| Live Feed data source | **Mock, disclosed** | `/api/meta/data-source` returns `primary_source: "mock"`; UI header badge says "Demo candidates" |
| Live NEOCP scraper (implemented, available) | **Working** | `/api/candidates/` pulls real `minorplanetcenter.net/iau/NEO/neocp.txt`; sample trksubs match raw MPC feed |
| API ↔ UI state sync | **Pass** | `/api/rank/` envelope drives both Live Feed and Sky View; single `displayCandidates` array, no parallel stores |
| Famous NEO positions (Sky View + Orbit View) | **Pass** | 18/18 within 0.25° of JPL Horizons at current UTC; tolerance was 2° |
| Orbital elements provenance | **Pass** | 18/18 elements verified at epoch JD 2461154.5 (2026-04-24 12:00 UTC) |
| UI transparency | **Pass** | `DataSourceBadge` in header shows source + refresh timestamp |

## Interpretation 1 — Real vs mock data

**Question:** Does the backend serve real NEOCP tracklets or deterministic fixtures?

**Finding:** The Live Feed endpoint (`/api/rank/`) serves 10 curated
`MOCK_CANDIDATES` from `backend/data/mock_candidates.py`. This is
**deliberate** — the curated set contains `P21YR4A`, a hazardous 2024 YR4
analogue with impact probability ≈ 2.4% that drives the high-stakes
Claude briefing. Losing determinism here would break the demo narrative.

The **live NEOCP scraper is fully implemented and working**:
`backend/data/neocp_fetcher.py` hits
`https://www.minorplanetcenter.net/iau/NEO/neocp.txt`, parses the
observations, computes rates, caches 15 min, and falls back to mocks on
MPC outages. It's exposed at `/api/candidates/`. Verified during this run:

```
GET /api/meta/data-source → live_feed_available: true, count: 10,
     sample: [Sar2895, CEKRPN2, P22mRZ7, CEKRJL2, C1EPUT5]

curl https://minorplanetcenter.net/iau/NEO/neocp.txt | head -5
Sar2895 100 ...
CEKRPN2 100 ...
P22mRZ7 100 ...
…  ← trksub-for-trksub match with the scraper response
```

**Transparency:** the `DataSourceBadge` component in the header says
"data · Demo candidates · updated Xs ago" with an expanded tooltip, and
the `/api/meta/data-source` endpoint publishes the same fields for any
reviewer who wants to verify independently.

## Interpretation 2 — End-to-end state sync

**Question:** API ↔ Live Feed ↔ Sky View — are they coherent?

**Finding:** Yes. `App.tsx` holds one `candidates` state populated by
`api.ranked(10)`, merges agent-pushed WebSocket events into a single
`displayCandidates` memo, and passes the **same** array to both
`CandidateList` (Live Feed) and `SkyViewContainer`. There is no
parallel store or cache layer that could diverge the two views.

- `api.ranked(10)` → `RankedCandidate[]` every 15 min (aligned with NEOCP TTL)
- `useAgentFeed` → `ws/feed` events → merged via `displayCandidates`
- Defensive filter in `SkyViewPanel` (`renderableCandidates` useMemo)
  drops any candidate with non-finite ra/dec and logs via
  `console.debug("[SkyView]", …)` in dev mode

**Outstanding:** no automated Playwright sync test yet — added as a
follow-up for Saturday if demo rehearsal surfaces issues.

## Interpretation 3 — Astronomical correctness for current time

**Question:** Are famous NEO positions rendered for *tonight* or are they
frozen at J2000?

**Finding (initial):** Before this session, kepler.ts propagated from
hardcoded J2000 elements. Over 26 years of Keplerian drift without
planetary perturbations the accumulated sky error was measurable:

| Object | Δ vs JPL (J2000 propagation) |
|---|--:|
| Bennu | 17.12° |
| Toutatis | 13.81° |
| 67P | 8.77° |
| Didymos | 6.36° |
| Tempel 1 | 5.51° |
| Ryugu | 4.69° |
| Itokawa | 2.58° |
| Eros | 2.33° |

(Full table in `current-positions-verification.md`, pre-fix snapshot in
git history at commit that introduced this work.)

**Fix applied:**

1. `scripts/verify_jpl_orbital_elements.py` accepts `--epoch today`
   and fetches osculating elements at any requested reference date.
2. `kepler.ts` `heliocentricPositionAtJD` + `orbitGroundTrack` now take
   an `epoch_jd` parameter (default J2000 for backwards compat).
3. `OrbitalElements.mean_anomaly_deg_j2000` renamed to
   `mean_anomaly_deg_epoch` to stop lying about the reference time.
4. `famous_neos.ts` regenerated against today 12:00 UTC (JD 2461154.5);
   each of the 18 entries now carries `orbital_epoch_jd: 2461154.5`
   plus `data_source` and `last_verified_date` provenance fields.
5. Runtime validator in `famous_neos.ts` accepts any plausible JD
   (no longer hardcodes J2000).

**Verification (post-fix):**

Run `python scripts/verify_current_positions.py` — the script is a
Python re-implementation of `kepler.ts` math so a bug in the TS cannot
hide behind Python tests. It compares against JPL Horizons OBSERVER
ephemerides (geocentric, CENTER=500@399) at the current UTC.

Result at 2026-04-24 21:22 UTC:

```
18 PASS / 0 FAIL / 0 SKIP  (tolerance 2.0°)
max Δ = 0.23° (Geographos)
median Δ ≈ 0.11°
```

Full table in `current-positions-verification.md`.

## What will still be J2000-ish in some places

The Earth ephemeris inside `kepler.ts` (`earthHeliocentricAtJD`) still
uses mean Newcomb elements with J2000 epoch. Earth's orbit is well-
behaved (e ≈ 0.0167, no massive perturbers relative to its mass), so
over 26 years the Earth position drifts by only a fraction of a degree
— swamped by the asteroid-side improvement we just made. Not a
concern for visualisation-grade rendering.

The planetary positions (Mercury/Venus/Mars) in `OrbitViewPanel` use
`currentPlanetAngleRad`, a near-circular mean-motion approximation
with implicit J2000 offset. This is cosmetic — planets are backdrop
context, not interactive objects, and their positions don't participate
in any quantitative claim.

## Reproduction

```bash
# Refresh famous NEO elements against JPL Horizons
python scripts/verify_jpl_orbital_elements.py --epoch today
python scripts/apply_jpl_patches.py

# Verify rendered positions agree with JPL Horizons OBSERVER
python scripts/verify_current_positions.py

# Confirm live NEOCP scraper is reachable and check data source meta
curl -s https://neo-triage-backend-production.up.railway.app/api/meta/data-source | jq .
```

## Files touched in this verification pass

- `frontend/src/lib/kepler.ts` — epoch parameter on propagation
- `frontend/src/lib/famous_neos.ts` — 18 regenerated orbits, validator loosened
- `frontend/src/components/SkyViewPanel.tsx` — threads `orbital_epoch_jd`
- `frontend/src/components/OrbitViewPanel.tsx` — threads `orbital_epoch_jd`
- `frontend/src/components/FamousNEODetailsPanel.tsx` — field rename
- `frontend/src/components/DataSourceBadge.tsx` — NEW header badge
- `frontend/src/App.tsx` — mounts badge
- `frontend/src/api/client.ts`, `types.ts` — `dataSource()` method
- `backend/routers/meta.py` — NEW `/api/meta/data-source`
- `backend/main.py` — router registration
- `scripts/verify_jpl_orbital_elements.py` — `--epoch` flag
- `scripts/apply_jpl_patches.py` — rewritten to overwrite provenance
- `scripts/verify_current_positions.py` — NEW JPL comparison tool

Related reports:
- `docs/verification/jpl-orbital-elements-verification.md`
- `docs/verification/current-positions-verification.md`

## Intentionally left open

- Primary candidate RA/Dec is not time-propagated by kepler (tracklets
  don't carry Keplerian elements). Proper-motion arc in
  `CandidateDetailsPanel` uses a hashed pseudo-random PA; this is
  explicitly flagged as "preliminary" in the UI.
- Sky View JD is locked at mount time for demo determinism. Long
  sessions (>1 h) won't see Earth's nightly eastward shift. Not a
  demo-relevant edge case but noted here for honesty.
- No Playwright test yet asserting `api.ranked === CandidateList ===
  SkyViewPanel` row counts. Manual check confirmed coherence; automated
  check deferred.
