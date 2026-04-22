# Changelog

## [1.0.0] — 2026-04-27 (Hackathon Submission)

### Features

- Bayesian ranker with calibrated uncertainty — sklearn GBM + isotonic calibration
- Claude Opus 4.7 briefing engine — streaming SSE + extended thinking visible in UI
- Managed Agent — continuous 5-minute cycle, WebSocket broadcast, JSONL decision log
- 2024 YR4 historical replay — 7 curated milestones h+0 → h+168
- Live-written global alert at Torino threshold — fresh every invocation, no cache
- Observer-aware tonight visibility — pure-TypeScript Meeus GMST/LST/altitude
- Torino Scale badge across CandidateList, PredictionCard, YR4 timeline, AgentAlertBanner
- Sort + filter candidate list — 5 dimensions (P(NEO), P(PHA), digest2, magnitude, rate) + PHA-only
- Briefing history — session-scoped, last 20, instant restore (no re-stream cost)
- Copy / export briefing — Markdown, Slack flavor, `.md` file download
- Cost meter — per-call token logging with live USD spend

### Architecture

- Python 3.12 + FastAPI + Pydantic v2 backend
- Vite 8 + React 19 + TypeScript + Tailwind v4 frontend
- scikit-learn GBM ranker + content-addressable JSON cache (no pickle)
- Railway (backend) + Vercel (frontend) deployment

### Known Limitations

- Mock NEOCP candidate list for the demo (live MPC fetcher exists but backs off to mock when unreachable)
- Synthetic ranker training data (Vereš 2025 integration is v1.1 scope)
- Railway ephemeral filesystem — `data/agent_log.jsonl` resets on redeploy; local agent holds cumulative evidence
- Per-telescope scheduling optimizer not implemented — greedy ranking only (FR-4 partial)
- Single-object briefings; batched multi-object briefings not in v1

### Non-Negotiables Enforced (NN-01..NN-11)

- NN-01 — No pickle in persisted artifacts
- NN-02 — Explicit units in variable names
- NN-03 — Cache before every Claude call (except NN-10 alert bypass)
- NN-04 — Model string `claude-opus-4-7` exact
- NN-05 — Persona v6 dry / skeptical / specific (11-iteration selection)
- NN-06 — All code post-kickoff 2026-04-21 18:30 EST
- NN-07 — Cost formula $15 / $75 per Mtok input/output
- NN-08 — Unit tests mock Anthropic SDK
- NN-09 — Temporal splits only for ML training
- NN-10 — YR4 alert bypasses cache (uniqueness preserved)
- NN-11 — Production secrets via env vars only — never committed

### Test Metrics

- Backend pytest: 78 / 78 passing
- Frontend ESLint: 0 errors
- Frontend TypeScript: 0 errors
- Frontend bundle: 71.19 kB gzipped
- End-to-end Playwright coverage: 30 / 30 UI behavior checks
