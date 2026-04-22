"""Bayesian ranker endpoints.

Endpoints:
- GET /api/rank/            — rank all mock candidates by P(NEO) descending
- GET /api/rank/{trksub}    — single-candidate Prediction lookup
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from backend.data.mock_candidates import MOCK_CANDIDATES
from backend.models.schemas import Candidate, Prediction
from backend.services.ranker import get_ranker

router = APIRouter(prefix="/api/rank", tags=["rank"])


class RankedCandidate(Candidate):
    """Candidate + its Prediction — the wire shape for /api/rank."""

    prediction: Prediction


@router.get("/", response_model=list[RankedCandidate])
async def rank_candidates(
    limit: int = Query(default=10, ge=1, le=100),
) -> list[RankedCandidate]:
    """Rank candidates by P(NEO) descending."""
    ranker = get_ranker()
    items: list[tuple[Candidate, Prediction]] = []
    for candidate in MOCK_CANDIDATES[:limit]:
        prediction = ranker.predict(candidate)
        # The ranker cannot know trksub when given a feature vector, so
        # the predict() method returns "<unknown>" in that case. Here we
        # pass the Candidate, so trksub is set; still normalize to avoid
        # surprises in downstream cache keys.
        prediction_with_trksub = prediction.model_copy(
            update={"trksub": candidate.trksub}
        )
        items.append((candidate, prediction_with_trksub))

    items.sort(key=lambda pair: pair[1].prob_neo, reverse=True)

    return [
        RankedCandidate(
            **candidate.model_dump(),
            prediction=prediction,
        )
        for candidate, prediction in items
    ]


@router.get("/{trksub}", response_model=Prediction)
async def rank_single(trksub: str) -> Prediction:
    """Prediction for a single candidate (404 if trksub unknown)."""
    candidate = next(
        (c for c in MOCK_CANDIDATES if c.trksub == trksub), None
    )
    if candidate is None:
        raise HTTPException(status_code=404, detail=f"Candidate {trksub} not found")
    ranker = get_ranker()
    prediction = ranker.predict(candidate)
    return prediction.model_copy(update={"trksub": candidate.trksub})
