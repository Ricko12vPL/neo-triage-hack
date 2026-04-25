# Production-Readiness Roadmap

## Scope statement

**neo-triage is a triage layer for the Rubin/LSST data flood era.** It is **not**
a replacement for [NASA JPL CNEOS Sentry-II](https://cneos.jpl.nasa.gov/sentry/)
or [ESA NEOCC Aegis v5](https://neo.ssa.esa.int/) — it complements them by
handling the post-Rubin scale of NEOCP submissions (~130 candidates per
night, an order of magnitude beyond today's load).

Production planetary defense currently runs on:

- **NASA JPL CNEOS** — Sentry-II impact monitor (IOBS / LOV / MC), JPL CAD
  close-approach data, JPL Horizons ephemerides, ADES astrometry.
- **ESA NEOCC** — Aegis v5 risk list, NEOCC orbit determination, public
  risk-list portal.
- **MPC** — NEOCP intake, observatory coordination.
- **IAWN / SMPAG** — alert distribution, mitigation coordination.

neo-triage cross-validates against these systems and triages the
submission queue; it does not replace any of them.

## What neo-triage does at production-grade level today

The following capabilities are real, code-anchored, and shipped on
`main`:

1. **Calibrated probability ranker** (sklearn GBM + isotonic
   calibration) over real NEOCP tracklets.
2. **LLM expert review** (Claude Opus 4.7, adaptive thinking + tool_use)
   that delivers structured CONCUR / PARTIAL_CONCUR / DISSENT verdicts
   with reasoning traces, caveats, and suggested actions.
3. **Live MPC NEOCP polling** every 2 minutes with diff-detection — the
   system broadcasts new tracklets via WebSocket as MPC adds them.
4. **JPL CNEOS Sentry-II cross-validation** — official IP_cum / PS_cum /
   PS_max / Torino + virtual-impactor empirical uncertainty bands.
5. **ESA NEOCC Aegis v5 cross-validation** — independent OD-system
   risk-list lookup, three-way convergence indicator.
6. **JPL CAD close-approach timeline** — historical and projected Earth
   close approaches (e.g. Apophis 2029) per object.
7. **Find_Orb-style A/B/C/F astrometric quality grading** per tracklet.
8. **Population-weighted impact risk** (Collins et al. 2017 damage model
   + synthetic top-50 metro grid + Pravec–Harris H→diameter).
9. **Impact corridor visualization** (Equirectangular projection, top-30
   metro markers, hypothetical corridor for YR4-class candidates).
10. **Sky View** with 18 famous NEOs at current epoch, JPL Horizons
    elements, propagated via Newton-Raphson Kepler solver to <0.25°
    accuracy vs JPL Horizons OBSERVER ephemeris.
11. **Stateful Managed Agent** running 320+ cycles with cost circuit
    breaker, real MPC diff detection, and on-demand expert reviews.
12. **Per-source provenance** in every UI surface — every datum is
    tagged with its origin (LIVE_MPC_NEOCP / DEMO_FIXTURE /
    JPL_CNEOS_SENTRY_II / ESA_NEOCC_AEGIS_V5 / JPL_CNEOS_CAD).

## What neo-triage does NOT do today (limitations to disclose)

These are explicitly out of scope at the prototype stage. Each is
mapped to a Phase 2/3/4 milestone below.

| Limitation                                  | Mitigation                                                        |
| ------------------------------------------- | ----------------------------------------------------------------- |
| No independent orbit determination          | Cross-validate against JPL/ESA OD; document scope in every panel  |
| Population grid is synthetic top-50 cities  | Banner labels every render "demo-grade"; Phase 2 → CIESIN GPWv4   |
| Impact corridor is hypothetical (YR4-style) | Banner cites ESA NEOCC YR4 publication as visual reference        |
| No Yarkovsky thermal model                  | Phase 2; relevant only beyond ~10-year prediction horizons        |
| ADES astrometry intake not parsed           | NEOCP `.txt` is current intake; ADES is the Rubin/Flyeye target   |
| No multi-tenant auth, no 24/7 SLA           | Hackathon prototype scope; Phase 3 institutional partnership      |

## Phase 2 (3–6 month engineering)

1. **Find_Orb integration** — real orbit determination on every
   accepted tracklet. Replace the manual `impact_probability` field on
   demo fixtures with a derived value.
2. **ADES astrometry parsing** — Rubin/Flyeye/ATLAS feed ready.
3. **Yarkovsky thermal model** (Vokrouhlický 2015 + Monte Carlo
   ensembles).
4. **Real CIESIN GPWv4 1° population raster** behind the same
   `population_in_circle` API. No caller change required —
   architectural pattern is in place.
5. **Real impact corridor from b-plane Monte Carlo** — replace the
   ESA-style hypothetical band with computed corridors per candidate.
6. **NEOExchange integration** for telescope time allocation.
7. **Postgres + TimescaleDB** backend (replace SQLite in-memory).
8. **Multi-tenant authentication** — observer accounts, observatory
   roles, audit log.

## Phase 3 (1–3 year, team)

1. **MOU with MPC** for high-rate API access (current scrape is fair-use
   public).
2. **MOU with IAWN** for alert distribution channel.
3. **24/7 ops** with rotating on-call rotation.
4. **Independent OD/IM system** — full Sentry-II equivalent computation
   inside neo-triage.
5. **POLSA institutional partnership** (Polish Space Agency — natural
   home for an EU planetary defense triage layer).
6. **EU Horizon Europe funding application** (€5–15M / 5y for
   continuous operations).

## Phase 4 (3–5+ year, full operational center)

1. Stand up a third independent OD/IM system alongside Sentry-II + Aegis
   to expand the triangulation network.
2. Co-locate or federate with **ESA Frascati / NEOCC**.
3. Coordinate **European amateur observer** follow-up via NEOExchange.
4. Polish **dedicated survey telescope** (1–2m class, southern
   hemisphere — fills a gap left by current Catalina/PanSTARRS).

## Honest acknowledgment

Building production-grade planetary defense from prototype to
operational center is a 5–10 year programme for a 20–50 person team.
This hackathon prototype demonstrates an architectural pattern:
**triage layer above existing OD systems, scaling to Rubin volume,
with calibrated probabilities + LLM reasoning + per-source provenance
end-to-end.** It does not match Sentry-II or Aegis capabilities and
should not be presented as doing so.

What it adds, that production systems do not currently expose:

- A triage queue ready for ~130 NEOCP tracklets/night Rubin volume.
- LLM expert reasoning with extended thinking visible in the UI —
  experimental but novel, and demonstrably catches inconsistencies the
  ranker alone misses (e.g., the P21LOWRT DISSENT case in the demo).
- Population-weighted risk in the operator-facing flow (research
  frontier per Liu et al. 2025 _Nature_ on YR4 risk).
- Per-source provenance and three-way cross-validation framing as
  first-class UI elements rather than implicit assumptions.

## Verification + audit

- 47 backend unit tests cover external API consumers, damage model,
  astrometric grading, and the cross-validation logic (`pytest tests/`).
- TypeScript type-check + Vite production build pass on `main`.
- API integrations are exercised against canned responses captured
  from real JPL/ESA endpoints during BLOCK_0 verification (2026-04-25).
- Apophis 2029 close-approach values verified: 0.000254 au, 7.42 km/s,
  match the public JPL CAD record.
- Bennu Sentry summary verified: IP=5.7×10⁻⁴, PS=−1.40, method=MC, 157
  virtual impactors — matches https://cneos.jpl.nasa.gov/sentry/.
- Famous-NEO sky positions <0.25° vs JPL Horizons OBSERVER ephemeris;
  see `docs/verification/current-positions-verification.md`.

## References

- Liu et al. 2025, "Population-weighted impact risk for 2024 YR4",
  _Nature_ — population framing of risk used here.
- Collins, Melosh, Marcus 2017, "Earth Impact Effects Program" — damage
  scaling used here.
- Pravec & Harris 2007, _Icarus_ — H→diameter relation.
- Glasstone & Dolan 1977, _The Effects of Nuclear Weapons_ — 5-psi
  overpressure scaling.
- Vokrouhlický et al. 2015, _Asteroids IV_ — Yarkovsky thermal effect
  (Phase 2 target).
- ESA NEOCC, "Asteroid 2024 YR4 no longer poses significant impact
  risk", Feb 2025.
