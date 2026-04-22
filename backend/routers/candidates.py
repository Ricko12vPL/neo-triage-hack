"""Router for NEOCP candidate endpoints."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from backend.data.neocp_fetcher import fetch_neocp_candidates
from backend.models.schemas import Candidate

router = APIRouter(prefix="/api/candidates", tags=["candidates"])


@router.get("/", response_model=list[Candidate])
async def list_candidates(
    limit: int = Query(default=10, ge=1, le=100, description="Max candidates to return"),
) -> list[Candidate]:
    """Return up to `limit` live NEOCP candidates from MPC, cached 15 min."""
    return await fetch_neocp_candidates(limit=limit)


@router.get("/{trksub}", response_model=Candidate)
async def get_candidate(trksub: str) -> Candidate:
    """Look up a single candidate by its MPC tracklet submitter designation."""
    candidates = await fetch_neocp_candidates(limit=100)
    for candidate in candidates:
        if candidate.trksub == trksub:
            return candidate
    raise HTTPException(status_code=404, detail=f"Candidate not found: {trksub}")
