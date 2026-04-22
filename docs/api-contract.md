# API Contract — neo-triage

| | |
|---|---|
| **Version** | 0.0.1 (hackathon) |
| **Status** | In development — Day 1 Block A deliverable |
| **Base URL (local)** | `http://localhost:8000` |
| **Last Updated** | 2026-04-21 |

## Overview

The neo-triage backend exposes a REST + SSE API consumed by the Next.js frontend (Paweł's lane) and, later, by the Claude Managed Agent. Endpoints return NEOCP candidate data, Bayesian classifier posteriors, and Claude Opus 4.7 briefings.

## Conventions

- **Timestamps:** ISO 8601 with explicit UTC offset (e.g. `2026-04-21T22:30:00+00:00`).
- **Angles:** Degrees only. RA in `[0, 360)`, Dec in `[-90, 90]`.
- **Magnitudes:** V band unless suffixed (`_g`, `_r`).
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
| `GET` | `/health` | — | `{"status":"ok","service":"neo-triage","version":"0.0.1"}` | no |
| `GET` | `/api/candidates/` | query `limit` (1–100, default 10) | `list[Candidate]` | no |
| `GET` | `/api/candidates/{trksub}` | — | `Candidate` (404 if unknown) | no |
| `POST` | `/api/briefing/` | `BriefingRequest` | SSE stream of `BriefingChunk` | **yes** |
| `GET` | `/api/cost/` | — | `CostSummary` | no |

### Error responses

| Status | Trigger |
|--------|---------|
| `404 Not Found` | Unknown `trksub` on `GET /api/candidates/{trksub}` |
| `422 Unprocessable Entity` | Request body fails Pydantic validation |
| `500 Internal Server Error` | Upstream Claude API error (wrapped) or unexpected exception |

## Schemas

### `Candidate` — observed NEOCP tracklet

| Field | Type | Notes |
|-------|------|-------|
| `trksub` | `str` | MPC submitter designation (e.g. `P21YR4A`) |
| `ra_deg` | `float` | `[0, 360)` |
| `dec_deg` | `float` | `[-90, 90]` |
| `mean_magnitude` | `float` | V band |
| `rate_arcsec_min` | `float` | `arcsec / minute` |
| `observatory_code` | `str` | MPC site code |
| `first_obs_datetime` | `datetime` | UTC |
| `n_observations` | `int` | ≥ 2 |
| `arc_length_minutes` | `float` | > 0 |
| `digest2_neo_noid` | `int` | `[0, 100]` |
| `ecliptic_latitude_deg` | `float` | Derived from RA/Dec |

### `Prediction` — classifier posterior (Day 2+)

| Field | Type | Notes |
|-------|------|-------|
| `trksub` | `str` | — |
| `prob_neo` | `float` | `[0, 1]` |
| `prob_pha` | `float` | `[0, 1]` |
| `prob_neo_ci_90` | `[float, float]` | 90% credible interval |
| `map_class` | enum | `NEO` \| `MBA` \| `COMET` \| `ARTIFACT` \| `UNCONFIRMED` |
| `uncertainty_entropy_bits` | `float` | Shannon entropy of posterior |
| `model_version` | `str` | e.g. `bayesian_v0.1` |

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

### `BriefingChunk` — SSE payload

```json
{
  "type": "thinking" | "text" | "meta" | "done" | "error",
  "content": "string",
  "cumulative_cost_usd": 0.0234
}
```

`cumulative_cost_usd` is populated only on `done` events. `thinking` chunks stream Opus 4.7 extended-thinking tokens; the UI renders them in a collapsible "reasoning" panel for the Most Creative Opus 4.7 bonus prize.

### `BriefingResponse` — aggregated (cache + tests)

```json
{
  "trksub": "P21YR4A",
  "briefing_markdown": "...",
  "reasoning_trace": "... | null",
  "model_version": "claude-opus-4-7",
  "input_tokens": 420,
  "output_tokens": 180,
  "thinking_tokens": 540,
  "cost_usd": 0.061,
  "generated_at": "2026-04-21T22:42:11+00:00",
  "cache_hit": false
}
```

### `CostSummary`

```json
{
  "total_spent_usd": 0.061,
  "n_calls": 1,
  "budget_remaining_usd": 499.94,
  "total_input_tokens": 420,
  "total_output_tokens": 180,
  "total_thinking_tokens": 540,
  "last_call_at": "2026-04-21T22:42:11+00:00"
}
```

## CORS

Allowed origin pattern: localhost on any port, and `*.vercel.app`. Credentialed requests permitted. Production deployment will tighten this to the specific Vercel URL.

## SSE notes for the frontend

The browser `EventSource` API does **not** support `POST`. For `/api/briefing/`, use `fetch` with `ReadableStream.getReader()` or a streaming helper such as `@microsoft/fetch-event-source`.

The recommended client-side dispatch:

```ts
const resp = await fetch("/api/briefing/", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(request),
});
// Parse SSE line by line, dispatch by `event:` header into
// thinking-panel / briefing-panel / done-handler / error-handler.
```

## What is not yet implemented

- `POST /api/briefing/` — Block B deliverable (in progress).
- `GET /api/cost/` — Block B deliverable.
- `/api/rank` — Day 2 morning (Bayesian ranker).
- `/api/schedule` — Day 3+ (optimizer).
