"""REST API for the Imminent Impactors Library.

Three endpoints:

  GET /api/imminent-impactors/                  — compact list (summaries)
  GET /api/imminent-impactors/{designation}     — full case detail
  GET /api/imminent-impactors/sorted-by-date    — chronological full detail

The catalog is a static curated dataset (loaded once per process), so
all three endpoints are safe to cache aggressively at the CDN layer.
"""
from __future__ import annotations

from urllib.parse import unquote

from fastapi import APIRouter, HTTPException

from backend.models.imminent_impactor import (
    ImminentImpactorCase,
    ImminentImpactorsSummary,
)
from backend.services.imminent_impactors import get_library

router = APIRouter(prefix="/api/imminent-impactors", tags=["imminent-impactors"])


@router.get("/", response_model=list[ImminentImpactorsSummary])
async def list_imminent_impactors() -> list[ImminentImpactorsSummary]:
    """Compact summary list — used by the IMPACTORS tab to render cards."""
    return get_library().list_summaries()


@router.get("/sorted-by-date", response_model=list[ImminentImpactorCase])
async def list_imminent_impactors_chronological() -> list[ImminentImpactorCase]:
    """Full case detail, chronological by discovery date.

    Order matches the global pre-impact-prediction timeline:
    2008 TC3 → 2014 AA → 2022 EB5 → 2023 CX1 → 2024 BX1 → 2024 YR4.
    """
    return get_library().list_sorted_by_date()


@router.get("/{designation:path}", response_model=ImminentImpactorCase)
async def get_imminent_impactor(designation: str) -> ImminentImpactorCase:
    """Look up one case by IAU designation (URL-encoded; spaces allowed).

    Raises 404 with a helpful list of known designations if the lookup
    misses.
    """
    decoded = unquote(designation).strip()
    case = get_library().get_case(decoded)
    if case is None:
        known = [c.designation for c in get_library().list_cases()]
        raise HTTPException(
            status_code=404,
            detail={
                "error": "designation_not_found",
                "designation": decoded,
                "known_designations": known,
            },
        )
    return case
