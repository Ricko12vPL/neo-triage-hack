"""External-data router — JPL CNEOS, ESA NEOCC, JPL CAD passthrough.

Cross-validation surface for the frontend. Every endpoint here proxies a
production planetary-defense API (JPL Sentry-II initially, ESA Aegis +
JPL CAD added in BLOCK_2/3) so the UI can render side-by-side
comparisons without bundling a second API key set or CORS-friendly
public mirrors. All payloads carry explicit `source` + `source_url`
provenance fields straight from the external-models schemas.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from backend.models.external import SentryDetailReport, SentryObjectSummary
from backend.services.jpl_sentry_client import get_jpl_sentry_client

router = APIRouter(prefix="/api/external", tags=["external"])


@router.get("/jpl-sentry/summary", response_model=list[SentryObjectSummary])
async def jpl_sentry_summary() -> list[SentryObjectSummary]:
    """Mode S — full JPL Sentry-II risk list (cumulative IP only).

    Cached for 6h on disk. The first call after server start may take
    1-2 seconds against JPL; subsequent calls return instantly.
    """
    client = get_jpl_sentry_client()
    return await client.get_summary_list()


@router.get(
    "/jpl-sentry/{designation:path}",
    response_model=SentryDetailReport,
)
async def jpl_sentry_detail(designation: str) -> SentryDetailReport:
    """Mode O — one object's full JPL Sentry-II profile + VI list.

    Designation may be 'des' style ('99942', '2024 YR4') or include the
    common name ('99942 Apophis'); the client normalises before query.
    Returns a structured report whose `status` field distinguishes
    IN_RISK_LIST / REMOVED / NOT_FOUND / ERROR — the UI renders each
    state distinctly so 'Apophis was removed in 2021' is a feature.
    """
    if not designation or not designation.strip():
        raise HTTPException(status_code=400, detail="designation required")
    client = get_jpl_sentry_client()
    return await client.get_object_detail(designation.strip())
