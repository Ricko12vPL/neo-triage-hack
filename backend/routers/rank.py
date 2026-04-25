"""Bayesian ranker endpoints.

The Live Feed surfaces both real NEOCP tracklets (for "what's actually
on the sky tonight") and a small set of curated demo candidates
including `P21YR4A`, the YR4 hazardous analogue that anchors the demo
narrative. Both populations flow through the same ranker so the
client gets one ordered list.

Endpoints:
- GET /api/rank/            — rank merged (live + demo) candidates by
                              P(NEO) descending. Default limit 50.
- GET /api/rank/{trksub}    — single-candidate Prediction lookup, in
                              live + demo merged set.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query

from backend.data.mock_candidates import MOCK_CANDIDATES
from backend.data.neocp_fetcher import fetch_neocp_candidates
from backend.models.expert_review import ExpertReview
from backend.models.schemas import Candidate, Prediction
from backend.services.expert_classifier import (
    ExpertClassifier,
    get_expert_classifier,
)
from backend.services.ranker import get_ranker

router = APIRouter(prefix="/api/rank", tags=["rank"])

_log = logging.getLogger(__name__)


class RankedCandidate(Candidate):
    """Candidate + its Prediction — the wire shape for /api/rank.

    `is_demo` flags rows that come from the curated demo set
    (`MOCK_CANDIDATES`) rather than the live NEOCP feed. Frontend uses
    it to render a small "DEMO" badge so reviewers can tell at a glance
    which rows are historical narrative anchors vs. live tracklets.

    `expert_review` is populated only on the top-K rows when the caller
    asks for `?expert=true`. It carries Opus 4.7's structured second
    opinion so the dashboard can render CONCUR / PARTIAL_CONCUR /
    DISSENT alongside the ranker's calibrated probability.
    """

    prediction: Prediction
    is_demo: bool = False
    expert_review: ExpertReview | None = None


async def _gather_universe(include_demo: bool, fetch_limit: int) -> list[Candidate]:
    """Return live NEOCP tracklets + curated demo mocks, deduped by trksub.

    On NEOCP failure we still return the demo set so the UI never empties.
    """
    universe: list[Candidate] = []
    seen: set[str] = set()

    try:
        live = await fetch_neocp_candidates(limit=fetch_limit)
        for cand in live:
            if cand.trksub in seen:
                continue
            universe.append(cand)
            seen.add(cand.trksub)
    except Exception as exc:  # noqa: BLE001 — non-fatal, fallback to mocks
        _log.warning("Live NEOCP fetch failed (%s); demo-only feed", exc)

    if include_demo:
        for cand in MOCK_CANDIDATES:
            if cand.trksub in seen:
                continue
            universe.append(cand)
            seen.add(cand.trksub)

    return universe


@router.get("/", response_model=list[RankedCandidate])
async def rank_candidates(
    limit: int = Query(default=200, ge=1, le=500),
    include_demo: bool = Query(
        default=True,
        description="Include curated demo candidates (e.g. P21YR4A YR4 analogue)",
    ),
    expert: bool = Query(
        default=False,
        description=(
            "When true, also populate `expert_review` for the top-`k` rows"
            " using the Opus 4.7 hybrid classifier. Default OFF preserves"
            " baseline behaviour."
        ),
    ),
    k: int = Query(
        default=20,
        ge=1,
        le=500,
        description=(
            "Number of top rows (by P(NEO) descending) to send through the"
            " expert reviewer when `expert=true`. Up to 500 — the 15-min"
            " review cache keeps repeat refreshes essentially free."
        ),
    ),
) -> list[RankedCandidate]:
    """Rank live NEOCP + demo candidates by P(NEO) descending.

    Default `limit=200` is intentionally well above the typical NEOCP
    population (5–50 tracklets) so the Live Feed surfaces every reported
    object. The fetcher caches the full parsed NEOCP list, so a single
    high-`limit` call won't exhaust the source.

    When `expert=true`, the top `k` rows additionally carry an
    `expert_review` payload from the Opus 4.7 hybrid classifier — see
    docs/data-classification-provenance.md for the architecture.
    """
    ranker = get_ranker()
    universe = await _gather_universe(include_demo=include_demo, fetch_limit=limit)
    demo_trksubs = {c.trksub for c in MOCK_CANDIDATES}

    items: list[tuple[Candidate, Prediction]] = []
    for candidate in universe:
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

    expert_reviews: dict[str, ExpertReview] = {}
    if expert:
        try:
            classifier = get_expert_classifier()
            top_k_pairs = items[:k]
            reviews = await classifier.review_batch(top_k_pairs)
            expert_reviews = {r.trksub: r for r in reviews}
        except Exception as exc:  # noqa: BLE001 — review failure must not break Live Feed
            _log.warning("expert review batch failed (%s) — serving without reviews", exc)

    return [
        RankedCandidate(
            **candidate.model_dump(),
            prediction=prediction,
            is_demo=candidate.trksub in demo_trksubs,
            expert_review=expert_reviews.get(candidate.trksub),
        )
        for candidate, prediction in items[:limit]
    ]


@router.get("/expert-review/{trksub}", response_model=ExpertReview)
async def expert_review_single(trksub: str) -> ExpertReview:
    """On-demand expert review for any tracklet by trksub.

    Useful for the UI's "review this" button on a row that wasn't in the
    initial top-K. Looks the candidate up in the merged universe (live +
    demo), invokes the ranker for a fresh prediction, then fires Opus.
    Cached for 15 min same as the batch path.
    """
    universe = await _gather_universe(include_demo=True, fetch_limit=200)
    candidate = next((c for c in universe if c.trksub == trksub), None)
    if candidate is None:
        raise HTTPException(status_code=404, detail=f"Candidate {trksub} not found")
    ranker = get_ranker()
    prediction = ranker.predict(candidate).model_copy(update={"trksub": trksub})
    classifier = get_expert_classifier()
    return await classifier.review_one(candidate, prediction)


@router.get("/{trksub}", response_model=Prediction)
async def rank_single(trksub: str) -> Prediction:
    """Prediction for a single candidate (404 if trksub unknown).

    Searches both live NEOCP and demo mocks.
    """
    universe = await _gather_universe(include_demo=True, fetch_limit=200)
    candidate = next((c for c in universe if c.trksub == trksub), None)
    if candidate is None:
        raise HTTPException(status_code=404, detail=f"Candidate {trksub} not found")
    ranker = get_ranker()
    prediction = ranker.predict(candidate)
    return prediction.model_copy(update={"trksub": candidate.trksub})
