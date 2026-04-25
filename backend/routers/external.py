"""External-data router — JPL CNEOS, ESA NEOCC, JPL CAD passthrough.

Cross-validation surface for the frontend. Every endpoint here proxies a
production planetary-defense API (JPL Sentry-II initially, ESA Aegis +
JPL CAD added in BLOCK_2/3) so the UI can render side-by-side
comparisons without bundling a second API key set or CORS-friendly
public mirrors. All payloads carry explicit `source` + `source_url`
provenance fields straight from the external-models schemas.
"""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, HTTPException

from backend.models.external import (
    AegisRiskEntry,
    CloseApproach,
    CrossValidationReport,
    SentryDetailReport,
    SentryObjectSummary,
)
from backend.services.esa_neocc_client import get_esa_neocc_client
from backend.services.jpl_cad_client import get_jpl_cad_client
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


@router.get("/esa-aegis/risk-list", response_model=list[AegisRiskEntry])
async def esa_aegis_risk_list() -> list[AegisRiskEntry]:
    """Full ESA NEOCC Aegis v5 risk list (~2000 entries, cached 12h)."""
    client = get_esa_neocc_client()
    return await client.get_risk_list()


@router.get(
    "/esa-aegis/{designation:path}",
    response_model=AegisRiskEntry | None,
)
async def esa_aegis_object(designation: str) -> AegisRiskEntry | None:
    """Look up one designation in the ESA Aegis v5 risk list.

    Returns null when the object is not in the risk list — that itself
    is meaningful (object's orbit is well-determined and shows no
    near-term impact possibility). Most catalogued NEAs land here.
    """
    if not designation or not designation.strip():
        raise HTTPException(status_code=400, detail="designation required")
    client = get_esa_neocc_client()
    return await client.get_object_in_risk_list(designation.strip())


def _convergence_verdict(
    sentry: SentryDetailReport,
    aegis: AegisRiskEntry | None,
) -> tuple[Literal["concur", "diverge", "insufficient_data"], str]:
    """Compare Sentry-II + Aegis verdicts on this designation.

    'concur' — both systems agree on presence/absence in their risk list,
              and (when both present) IP_cum agrees within one order of
              magnitude.
    'diverge' — one system flags as risky while the other does not, OR
                IPs differ by more than a factor of ten.
    'insufficient_data' — Sentry returned ERROR.
    """
    if sentry.status == "ERROR":
        return "insufficient_data", "JPL Sentry-II unreachable"
    in_sentry = sentry.status == "IN_RISK_LIST"
    in_aegis = aegis is not None
    if not in_sentry and not in_aegis:
        return "concur", "Both systems agree: not currently a risk-list candidate."
    if in_sentry != in_aegis:
        absent = "ESA Aegis" if in_sentry else "JPL Sentry-II"
        present = "JPL Sentry-II" if in_sentry else "ESA Aegis"
        return (
            "diverge",
            f"{present} flags this object; {absent} does not. Worth a closer look.",
        )
    # Both present — compare cumulative IPs at order-of-magnitude.
    assert sentry.summary is not None and aegis is not None
    sentry_ip = sentry.summary.impact_probability_cumulative
    aegis_ip = aegis.impact_probability_cumulative
    if sentry_ip <= 0 or aegis_ip <= 0:
        return "concur", "Both systems list the object; IPs are below their report floor."
    ratio = max(sentry_ip, aegis_ip) / max(min(sentry_ip, aegis_ip), 1e-30)
    if ratio > 10:
        return (
            "diverge",
            f"IP_cum disagree by {ratio:.0f}× — Sentry {sentry_ip:.2e} vs Aegis"
            f" {aegis_ip:.2e}.",
        )
    return (
        "concur",
        f"IP_cum agree within an order of magnitude — Sentry {sentry_ip:.2e},"
        f" Aegis {aegis_ip:.2e}.",
    )


@router.get(
    "/jpl-cad/{designation:path}",
    response_model=list[CloseApproach],
)
async def jpl_cad_approaches(
    designation: str,
    years_window: int = 100,
    dist_max_au: float = 0.2,
) -> list[CloseApproach]:
    """Earth close-approach history + projection for one object.

    Default window: ±50 years from today (yields 1976-2076), distance
    cap 0.2 au (~78 lunar distances) to keep the timeline focused on
    notable events. Cached 24h on disk.
    """
    if not designation or not designation.strip():
        raise HTTPException(status_code=400, detail="designation required")
    today = datetime.now(UTC)
    half = max(years_window // 2, 1)
    date_min = f"{today.year - half}-01-01"
    date_max = f"{today.year + half}-01-01"
    client = get_jpl_cad_client()
    return await client.get_close_approaches(
        designation.strip(),
        date_min=date_min,
        date_max=date_max,
        dist_max_au=dist_max_au,
    )


@router.get(
    "/cross-validation/{designation:path}",
    response_model=CrossValidationReport,
)
async def cross_validation(designation: str) -> CrossValidationReport:
    """Three-way cross-validation envelope for one designation.

    Combines JPL Sentry-II detail + ESA Aegis risk-list lookup into a
    single payload the frontend renders as a side-by-side comparison
    panel. The convergence flag drives the ✓ / ⚠ indicator.
    """
    if not designation or not designation.strip():
        raise HTTPException(status_code=400, detail="designation required")
    designation = designation.strip()
    sentry_client = get_jpl_sentry_client()
    esa_client = get_esa_neocc_client()
    sentry = await sentry_client.get_object_detail(designation)
    aegis = await esa_client.get_object_in_risk_list(designation)
    convergence, explanation = _convergence_verdict(sentry, aegis)
    return CrossValidationReport(
        designation_query=designation,
        sentry=sentry,
        aegis=aegis,
        in_aegis_risk_list=aegis is not None,
        convergence=convergence,
        convergence_explanation=explanation,
        retrieved_at_utc=datetime.now(UTC),
    )
