# Day 2 Morning Backlog

Items carried over from Day 1 verification. Tackle in order; first three are the planned Day 2 morning block (08:00–12:00 Warsaw).

---

## P0 — Reasoning visibility workaround for Opus 4.7 adaptive thinking

**Context.** Opus 4.7 rejects the older `thinking.type = "enabled"` + `budget_tokens` API and requires `thinking.type = "adaptive"` + `output_config.effort`. In adaptive mode, reasoning happens internally and is **not streamed** as separate `thinking_delta` events — only the final text reaches the client.

This blocks PLAN.md §4.5(b) "Extended thinking visible in UI", which is part of the "Most Creative Opus 4.7 Exploration" bonus prize narrative ($5K).

**Planned fix.** Prompt-side reasoning section:

1. Update `backend/services/briefing_engine.py::SYSTEM_PROMPT` to instruct the model to open with a `## Reasoning` section of ~100 words before the briefing.
2. Frontend parses the streamed markdown, splits at `## ` headers, renders `Reasoning` in a collapsible panel under the briefing panel — visually distinct (slightly smaller, dimmer, monospace-ish font).
3. Keep the 150–250 word count for the *briefing portion* (post-Reasoning).

This gives us visible reasoning at zero extra cost (no second API call) and preserves the persona voice throughout.

**Alternatives considered.** Two-pass architecture (first call = reasoning, second call = briefing). Rejected: 2× cost, adds latency, harder to keep voice consistent.

**Acceptance.** After the update, a briefing response for the YR4 fixture shows a `## Reasoning` section with specific numerical chain-of-thought (e.g., magnitude budget analysis, non-detection inference), followed by the three-section briefing. Frontend renders them in separate panels.

---

## P1 — Bayesian ranker (sklearn GBM + isotonic)

**Scope.** `backend/services/ranker.py` implementing:

1. `fit(features, labels)` using `GradientBoostingClassifier` with 100-ish estimators.
2. `predict_proba(features)` returning per-class probabilities.
3. `IsotonicRegression` calibrator fit on a held-out split to yield calibrated `prob_neo` and `prob_pha`.
4. Uncertainty via bootstrap over trees (quick approximation) → `prob_neo_ci_90` tuple.
5. `model_version = "bayesian_v0.1"` persisted in the response.

**Data.** First pass: synthetic labels keyed off digest2 score + rate — creates realistic but not scientifically meaningful training data. Good enough to validate the wiring. Replace with Vereš 2025 supplementary data if accessible within the Day 2 afternoon.

**Endpoint.** `POST /api/rank` taking `list[Candidate]`, returning `list[Prediction]`. Or a simpler model: accept a single `Candidate` and return one `Prediction`, let the caller batch.

**Acceptance.** All 10 mock candidates get a `Prediction`. YR4 analog (`P21YR4A`, digest2=98) gets `prob_neo > 0.85`. Two artifacts (digest2 < 30) get `prob_neo < 0.3`.

---

## P2 — Frontend integration (Paweł's lane, coordinated)

**After Vercel scaffold is live:**

1. Candidate list in left panel fetches `/api/candidates/` on mount.
2. Click candidate → open SSE stream to `/api/briefing/` with candidate + latest prediction in body.
3. Render streamed text in right-upper panel (briefing) and streamed reasoning in right-lower collapsible panel.
4. Top-right cost meter polls `/api/cost/` every 10s, displays `🧠 Opus 4.7 tonight: $X · N calls`.

**Dependencies.** Paweł must confirm Vercel deploy works end-to-end against backend (CORS is already configured for `*.vercel.app`).

---

## P3 — Polish items (not blocking)

- **Rename `Candidate.mean_magnitude` → `Candidate.mean_magnitude_v`** for consistency with other unit-suffixed fields. Breaking change in API contract — coordinate with Paweł before landing.
- **Populate `total_thinking_tokens` in the ledger from an alternative source** (message content-block inspection post-stream), or explicitly document that adaptive mode cannot report thinking tokens. Update `backend/services/cost_tracker.py` comment accordingly.
- **Add `/api/cost/` to the verification smoke test** so that every real API call bumps both `n_calls` and `total_cost_usd` as an assertion.
- **Consider per-request cost ceiling** — reject `/api/briefing/` if `cost_tracker.remaining() < $1`. Defensive against runaway loops in the Managed Agent.

---

## Live-session attendance (08:00–18:00 Warsaw)

- **18:00 Warsaw (12:00 EDT) — AMA with Thariq Shihipar, Claude Code team (Anthropic).** Both Kacper and Paweł attend. Prepare one concrete question about Managed Agents orchestration for our use case.
- Discord `#questions` and `#office-hours` on rotation.
