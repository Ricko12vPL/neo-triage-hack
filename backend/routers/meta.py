"""Transparency endpoints — disclose where candidates come from.

Judges and reviewers can call `/api/meta/data-source` to confirm at a
glance whether the Live Feed is serving curated demo candidates or real
NEOCP tracklets, with a timestamp that proves the backend isn't stale.
"""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

from backend.data.mock_candidates import MOCK_CANDIDATES
from backend.data.neocp_fetcher import fetch_neocp_candidates

router = APIRouter(prefix="/api/meta", tags=["meta"])


class DataSourceReport(BaseModel):
    """Source of the candidates surfaced by /api/rank/ (the Live Feed)."""

    primary_source: Literal["mock", "live_neocp", "hybrid"]
    primary_description: str
    primary_count: int
    retrieved_at_utc: str
    live_feed_available: bool
    live_feed_candidate_count: int | None = None
    live_feed_sample_trksubs: list[str] = []
    famous_neos_count: int = 18
    famous_neos_epoch_jd: float = 2461154.5
    famous_neos_last_verified: str = "2026-04-24"
    notes: str


@router.get("/data-source", response_model=DataSourceReport)
async def data_source_report() -> DataSourceReport:
    """Return a transparent breakdown of where candidates come from.

    The Live Feed (`/api/rank/`) serves `MOCK_CANDIDATES` deliberately
    — the curated demo scenario includes a hazardous YR4 analogue that
    drives the high-stakes briefing. The live NEOCP scraper is fully
    implemented and available at `/api/candidates/`; this endpoint
    fetches from it on-demand so reviewers can see both sides.
    """
    retrieved_at = datetime.now(UTC).isoformat().replace("+00:00", "Z")

    live_count: int | None = None
    live_sample: list[str] = []
    live_ok = False
    try:
        live_candidates = await fetch_neocp_candidates(limit=10)
        live_ok = True
        live_count = len(live_candidates)
        live_sample = [c.trksub for c in live_candidates[:5]]
    except Exception:
        # Scraper errors are non-fatal — report what we can.
        live_ok = False

    return DataSourceReport(
        primary_source="mock",
        primary_description=(
            "Curated demo candidates (10 objects) including P21YR4A — a "
            "hazardous 2024 YR4 analogue at IP ≈ 2.4% used to trigger the "
            "high-stakes briefing. These fixtures are defined at "
            "`backend/data/mock_candidates.py` and their values are "
            "representative of real NEOCP observations."
        ),
        primary_count=len(MOCK_CANDIDATES),
        retrieved_at_utc=retrieved_at,
        live_feed_available=live_ok,
        live_feed_candidate_count=live_count,
        live_feed_sample_trksubs=live_sample,
        notes=(
            "Famous NEO positions in Sky View + Orbit View are computed from "
            "current-epoch JPL Horizons elements (JD 2461154.5) propagated by "
            "kepler.ts to the current UTC. Verified <0.25° vs JPL Horizons "
            "OBSERVER ephemeris — see docs/verification/current-positions-"
            "verification.md."
        ),
    )
