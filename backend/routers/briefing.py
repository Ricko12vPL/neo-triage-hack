"""SSE streaming endpoint for Opus 4.7 briefings."""
from __future__ import annotations

import logging
import os
from collections.abc import AsyncIterator

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from slowapi import Limiter
from slowapi.util import get_remote_address

from backend.models.schemas import BriefingChunk, BriefingRequest
from backend.services.briefing_engine import stream_briefing
from backend.services.ranker import get_ranker

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/briefing", tags=["briefing"])

# Standalone limiter so this module can decorate routes even before the
# global app limiter is installed. Per-IP cap protects the Opus-streaming
# endpoint from someone spamming briefings to burn API budget.
_limiter = Limiter(key_func=get_remote_address)
_BRIEFING_RATE = os.environ.get("BRIEFING_RATE_LIMIT", "3/minute")


def _format_sse(chunk: BriefingChunk) -> str:
    return f"event: {chunk.type}\ndata: {chunk.model_dump_json()}\n\n"


def _populate_prediction(request: BriefingRequest) -> BriefingRequest:
    """If caller did not pass a Prediction, fill one from the ranker.

    This closes the ranker ↔ briefing loop: Claude reasons over numbers
    the model actually produced, not invented ones.
    """
    if request.prediction is not None:
        return request
    try:
        ranker = get_ranker()
        prediction = ranker.predict(request.candidate)
        prediction = prediction.model_copy(update={"trksub": request.candidate.trksub})
    except Exception as exc:  # noqa: BLE001 — ranker is advisory here
        logger.warning("Ranker unavailable for %s: %s", request.candidate.trksub, exc)
        return request
    return request.model_copy(update={"prediction": prediction})


async def _sse_source(request: BriefingRequest) -> AsyncIterator[str]:
    enriched = _populate_prediction(request)
    async for chunk in stream_briefing(enriched):
        yield _format_sse(chunk)


@router.post("/")
@_limiter.limit(_BRIEFING_RATE)
async def briefing(request: Request, payload: BriefingRequest) -> StreamingResponse:
    """Stream a Claude-generated briefing as Server-Sent Events.

    Rate-limited via slowapi to prevent anonymous Opus-burn from public
    visitors. Default cap is BRIEFING_RATE_LIMIT (3/minute per IP). If the
    request omits a `prediction`, the ranker fills one in before the prompt
    is built. Chunks are dispatched by SSE `event:` header so the frontend
    can route reasoning chunks (collapsible panel) separately from the
    briefing text (main panel).

    Note: slowapi requires `request: Request` as the first argument to
    extract the client IP — `payload` carries the actual BriefingRequest body.
    """
    return StreamingResponse(
        _sse_source(payload),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
