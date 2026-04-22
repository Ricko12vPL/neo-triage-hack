"""SSE streaming endpoint for Opus 4.7 briefings."""
from __future__ import annotations

from collections.abc import AsyncIterator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from backend.models.schemas import BriefingChunk, BriefingRequest
from backend.services.briefing_engine import stream_briefing

router = APIRouter(prefix="/api/briefing", tags=["briefing"])


def _format_sse(chunk: BriefingChunk) -> str:
    return f"event: {chunk.type}\ndata: {chunk.model_dump_json()}\n\n"


async def _sse_source(request: BriefingRequest) -> AsyncIterator[str]:
    async for chunk in stream_briefing(request):
        yield _format_sse(chunk)


@router.post("/")
async def briefing(request: BriefingRequest) -> StreamingResponse:
    """Stream a Claude-generated briefing as Server-Sent Events.

    Dispatches chunks by SSE `event:` header so the frontend can route
    thinking deltas (for the reasoning panel) separately from text deltas
    (for the briefing panel).
    """
    return StreamingResponse(
        _sse_source(request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
