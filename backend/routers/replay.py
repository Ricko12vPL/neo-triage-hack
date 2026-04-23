"""2024 YR4 replay mode endpoints.

Serves the historical 2024 YR4 event timeline for the demo's hero moment.
The Torino-3 threshold crossing at hour +18 triggers a live-written Claude
alert (NN-10: never cached — each invocation is fresh).

Routes:
  GET  /api/replay/yr4               full timeline
  GET  /api/replay/yr4/{hour}        single milestone (exact or 404)
  POST /api/replay/yr4/{hour}/brief  streaming briefing for that moment
  POST /api/replay/yr4/alert         live-written hazard alert (NN-10: no cache)
"""
from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from backend.data.yr4_replay import (
    YR4Milestone,
    get_closest_milestone,
    get_milestone,
    get_timeline,
)
from backend.models.schemas import (
    BriefingChunk,
    BriefingRequest,
    Candidate,
    Prediction,
)
from backend.services.briefing_engine import generate_yr4_alert, stream_briefing
from backend.services.ranker import get_ranker

router = APIRouter(prefix="/api/replay", tags=["replay"])


def _milestone_to_candidate(m: YR4Milestone) -> Candidate:
    """Synthesise a Candidate snapshot from a YR4 milestone for the briefing engine."""
    return Candidate(
        trksub="P21YR4A",
        ra_deg=83.82,    # approximate RA of 2024 YR4 during event
        dec_deg=-14.21,  # approximate Dec of 2024 YR4 during event
        mean_magnitude_v=m.mean_magnitude_v,
        rate_arcsec_min=m.rate_arcsec_min,
        observatory_code="695",  # Kitt Peak (real first detection site)
        first_obs_datetime=datetime(2024, 12, 27, tzinfo=UTC),
        n_observations=m.n_observations,
        arc_length_minutes=m.arc_length_minutes,
        digest2_neo_noid=m.digest2_neo_noid,
        ecliptic_latitude_deg=-9.84,
        impact_probability=m.impact_probability,
        absolute_magnitude_h=m.absolute_magnitude_h,
    )


def _milestone_to_prediction(m: YR4Milestone) -> Prediction:
    """Synthesise a Prediction from a YR4 milestone."""
    ranker = get_ranker()
    candidate = _milestone_to_candidate(m)
    pred = ranker.predict(candidate)
    return pred.model_copy(update={"trksub": "P21YR4A"})


async def _sse_stream(gen: AsyncIterator[BriefingChunk]) -> AsyncIterator[str]:
    async for chunk in gen:
        yield f"data: {chunk.model_dump_json()}\n\n"


@router.get("/yr4", response_model=list[dict[str, Any]])
async def list_timeline() -> list[dict[str, Any]]:
    """Return the full 2024 YR4 event timeline (7 milestones)."""
    from dataclasses import asdict
    return [asdict(m) for m in get_timeline()]


@router.get("/yr4/{hour}", response_model=dict[str, Any])
async def get_milestone_endpoint(hour: int) -> dict[str, Any]:
    """Return a specific milestone by exact hour. 404 if not in timeline."""
    from dataclasses import asdict
    m = get_milestone(hour)
    if m is None:
        raise HTTPException(
            status_code=404,
            detail=f"No milestone at hour={hour}. Valid hours: "
            + str([m.hour for m in get_timeline()]),
        )
    return asdict(m)


@router.post("/yr4/{hour}/brief")
async def replay_brief(hour: int) -> StreamingResponse:
    """Stream a Claude briefing for the YR4 candidate state at the given hour.

    Uses the closest milestone if exact hour not found.
    Cached per-hour for demo consistency (NN-03).
    Prompt is enriched with historical-moment context.
    """
    m = get_milestone(hour) or get_closest_milestone(hour)
    candidate = _milestone_to_candidate(m)
    prediction = _milestone_to_prediction(m)

    context = (
        f"Historical replay: 2024 YR4 event at hour +{m.hour} after first posting. "
        f"Event: {m.event_description} "
        f"Observer context: {m.narrative_context} "
        f"Write as the follow-up astronomer reviewing this candidate at that exact moment, "
        f"without knowledge of future observations."
    )

    request = BriefingRequest(
        candidate=candidate,
        prediction=prediction,
        cross_survey_context=context,
        include_reasoning=True,
    )

    return StreamingResponse(
        _sse_stream(stream_briefing(request)),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/yr4/alert")
async def yr4_alert() -> StreamingResponse:
    """Stream a live-written YR4 hazard alert from Claude Opus 4.7.

    NN-10: This endpoint NEVER caches. Every call generates fresh output.
    Rate-limited to 1 call per 10 seconds to prevent accidental cost spikes.
    """
    return StreamingResponse(
        _sse_stream(generate_yr4_alert()),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
