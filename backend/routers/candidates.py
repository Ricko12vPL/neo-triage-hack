"""Router for NEOCP candidate endpoints."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from backend.data.mock_candidates import MOCK_CANDIDATES
from backend.models.schemas import Candidate

router = APIRouter(prefix="/api/candidates", tags=["candidates"])


@router.get("/", response_model=list[Candidate])
async def list_candidates(
    limit: int = Query(default=10, ge=1, le=100, description="Max candidates to return"),
) -> list[Candidate]:
    """Return up to `limit` mock NEOCP candidates ranked in fixture order."""
    return MOCK_CANDIDATES[:limit]


@router.get("/{trksub}", response_model=Candidate)
async def get_candidate(trksub: str) -> Candidate:
    """Look up a single candidate by its MPC tracklet submitter designation."""
    for candidate in MOCK_CANDIDATES:
        if candidate.trksub == trksub:
            return candidate
    raise HTTPException(status_code=404, detail=f"Candidate not found: {trksub}")
