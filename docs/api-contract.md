# API Contract — neo-triage

| | |
|---|---|
| **Version** | 0.0.2 (hackathon, Day 2) |
| **Status** | Active — Day 2 ranker + reasoning visibility integrated |
| **Base URL (local)** | `http://localhost:8000` |
| **Last Updated** | 2026-04-22 |

## Overview

The neo-triage backend exposes a REST + SSE API consumed by the Next.js frontend and, later, by the Claude Managed Agent. Endpoints return NEOCP candidate data, Bayesian classifier posteriors, and Claude Opus 4.7 briefings with visible reasoning.

## Conventions

- **Timestamps:** ISO 8601 with explicit UTC offset (e.g. `2026-04-21T22:30:00+00:00`).
- **Angles:** Degrees only. RA in `[0, 360)`, Dec in `[-90, 90]`.
- **Magnitudes:** V band, denoted with `_v` suffix (`mean_magnitude_v`).
- **Rates of motion:** `arcsec / minute`.
- **Streaming:** Server-Sent Events (`text/event-stream`). Each event framed as:
  ```
  event: {type}
  data: {json-payload}

  ```
  Two newlines after the payload per SSE spec.
- **Errors:** FastAPI default JSON shape — `{"detail": "message"}` for 4xx/5xx.
- **Versioning:** No `/v1` prefix during hackathon. Breaking changes handled via minor-version bump post-hackathon.

## Endpoints

| Method | Path | Request | Response | Streaming |
|--------|------|---------|----------|-----------|
| `GET`  | `/health` | — | `{"status":"ok","service":"neo-triage","version":"0.0.1"}` | no |
| `GET`  | `/api/candidates/` | query `limit` (1–100, default 10) | `list[Candidate]` | no |
| `GET`  | `/api/candidates/{trksub}` | — | `Candidate` (404 if unknown) | no |
| `GET`  | `/api/rank/` | query `limit` (1–100, default 10) | `list[RankedCandidate]`, sorted by `prob_neo` desc | no |
| `GET`  | `/api/rank/{trksub}` | — | `Prediction` (404 if unknown) | no |
| `POST` | `/api/briefing/` | `BriefingRequest` | SSE stream of `BriefingChunk` | **yes** |
| `GET`  | `/api/cost/` | — | `CostSummary` | no |

### Error responses

| Status | Trigger |
|--------|---------|
| `404 Not Found` | Unknown `trksub` on `GET /api/candidates/{trksub}` or `GET /api/rank/{trksub}` |
| `422 Unprocessable Entity` | Request body fails Pydantic validation |
| `500 Internal Server Error` | Upstream Claude API error (wrapped) or unexpected exception |

## Schemas

### `Candidate` — observed NEOCP tracklet

| Field | Type | Notes |
|-------|------|-------|
| `trksub` | `str` | MPC submitter designation (e.g. `P21YR4A`) |
| `ra_deg` | `float` | `[0, 360)` |
| `dec_deg` | `float` | `[-90, 90]` |
| `mean_magnitude_v` | `float` | V band (renamed from `mean_magnitude` at Day 2) |
| `rate_arcsec_min` | `float` | `arcsec / minute` |
| `observatory_code` | `str` | MPC site code |
| `first_obs_datetime` | `datetime` | UTC |
| `n_observations` | `int` | ≥ 2 |
| `arc_length_minutes` | `float` | > 0 |
| `digest2_neo_noid` | `int` | `[0, 100]` |
| `ecliptic_latitude_deg` | `float` | Derived from RA/Dec |

### `Prediction` — Bayesian ranker posterior

| Field | Type | Notes |
|-------|------|-------|
| `trksub` | `str` | — |
| `prob_neo` | `float` | `[0, 1]` |
| `prob_pha` | `float` | `[0, 1]` — currently `prob_neo × 0.15` (PHA-among-NEO fraction) |
| `prob_neo_ci_90` | `[float, float]` | 90% credible interval (CV-fold std proxy) |
| `map_class` | enum | `NEO` \| `MBA` \| `COMET` \| `ARTIFACT` \| `UNCONFIRMED` |
| `uncertainty_entropy_bits` | `float` | Shannon entropy of class posterior |
| `model_version` | `str` | e.g. `bayesian_v0.1_gbm_isotonic` |

### `RankedCandidate` — `Candidate` + its `Prediction` (response shape for `/api/rank/`)

```json
{
  ...all Candidate fields...,
  "prediction": Prediction
}
```

### `BriefingRequest`

```json
{
  "candidate": Candidate,
  "prediction": Prediction | null,
  "cross_survey_context": "string | null",
  "include_reasoning": true,
  "observer_location": "string | null"
}
```

If `prediction` is `null`, the backend auto-fills it from the ranker before building the prompt — Claude reasons over the actual model numbers, not invented ones.

### `BriefingChunk` — SSE payload

```json
{
  "type": "reasoning" | "text" | "thinking" | "meta" | "done" | "error",
  "content": "string",
  "cumulative_cost_usd": 0.0234
}
```

`cumulative_cost_usd` is populated only on `done` events.

**Chunk routing semantics**:

- `reasoning` — the model's `## Reasoning` section, streamed before the `## Briefing` marker. Render in a collapsible "Claude's reasoning" panel — this is how Opus 4.7 thinking is made visible (adaptive thinking does not stream `thinking_delta` events, so the prompt forces a structured Reasoning block instead).
- `text` — the `## Briefing` section content. Render in the main briefing panel.
- `thinking` — legacy: only emitted if the API actually produces `thinking_delta` events. Treat as `reasoning` for display.
- `done` — final event with `content` either `"ok"` (live call) or `"cache_hit"` (replay).
- `error` — upstream failure surfaced to the client.

The `## Reasoning` and `## Briefing` markers themselves are stripped from the streamed content — they're control tokens, not visible output.

### `BriefingResponse` — aggregated (cache + tests)

```json
{
  "trksub": "P21YR4A",
  "briefing_markdown": "...",        // post-marker content only
  "reasoning_markdown": "...",       // pre-marker content only
  "reasoning_trace": "... | null",   // legacy thinking_delta capture
  "model_version": "claude-opus-4-7",
  "input_tokens": 645,
  "output_tokens": 1251,
  "thinking_tokens": 0,              // adaptive mode does not report
  "cost_usd": 0.0738,
  "generated_at": "2026-04-22T08:06:17+00:00",
  "cache_hit": false
}
```

### `CostSummary`

```json
{
  "total_spent_usd": 0.2376,
  "n_calls": 4,
  "budget_remaining_usd": 499.7624,
  "total_input_tokens": 3137,
  "total_output_tokens": 2540,
  "total_thinking_tokens": 0,
  "last_call_at": "2026-04-22T08:06:17+00:00"
}
```

## CORS

Allowed origin pattern: localhost on any port, and `*.vercel.app`. Credentialed requests permitted. Production deployment will tighten this to the specific Vercel URL.

## SSE notes for the frontend

The browser `EventSource` API does **not** support `POST`. For `/api/briefing/`, use `fetch` with `ReadableStream.getReader()` or a streaming helper such as `@microsoft/fetch-event-source`.

Recommended client-side dispatch:

```ts
const resp = await fetch("/api/briefing/", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(request),
});
// Parse SSE line by line. Dispatch by `event:` header:
//   reasoning  → collapsible reasoning panel
//   text       → main briefing panel
//   thinking   → legacy fallback, treat as reasoning
//   done       → cost meter update + stream complete
//   error      → toast / inline error
```

## What is not yet implemented

- `/api/schedule` — Day 3+ (optimizer / ranking-aware scheduling).
- Managed Agent integration — Day 3.
- Real Vereš 2025 training data — v1.1 post-hackathon (synthetic placeholder used in v0.1).
