"""Pydantic models for external planetary-defense data sources.

Aggregates the wire schemas for the third-party APIs neo-triage cross-
validates against:

  - JPL CNEOS Sentry-II      → impact monitoring
  - JPL CAD                   → close-approach data
  - ESA NEOCC Aegis v5        → independent risk list

Every model carries explicit `source` + `source_url` fields so the
provenance round-trips into the UI. The client services are responsible
for normalising loose JSON (the JPL API mixes strings and numbers freely
in float fields) into these strict types.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# JPL CNEOS Sentry-II
# ---------------------------------------------------------------------------

SentryStatus = Literal["IN_RISK_LIST", "REMOVED", "NOT_FOUND", "ERROR"]


class SentryVI(BaseModel):
    """One virtual impactor entry from JPL Sentry-II.

    Schema mirrors the `data[]` array of `sentry.api?des=<X>` (mode O).
    JPL ships every numeric as a string; the client converts to float.
    Sigma columns vary by method: MC → sigma_mc, IOBS/LOV → sigma_lov.
    """

    date: str = Field(..., description="UTC calendar date 'YYYY-MM-DD.dd'")
    energy_mt_tnt: float = Field(..., description="Impact energy (megatons TNT)")
    impact_probability: float = Field(
        ..., ge=0.0, le=1.0, description="Per-VI impact probability"
    )
    palermo_scale: float = Field(..., description="Per-VI Palermo Scale")
    torino_scale: int | None = Field(default=None, description="Per-VI Torino")
    sigma: float | None = Field(
        default=None,
        description="Method-specific sigma (sigma_mc for MC, sigma_lov for IOBS/LOV)",
    )


class SentryObjectSummary(BaseModel):
    """Per-object summary from JPL Sentry-II.

    Two endpoints feed this:
      - /sentry.api (mode S, no params) — flat list, ps_cum + range only
      - /sentry.api?des=X (mode O)      — full summary with v_inf, diameter, …

    The client fills as many fields as the response provides; missing
    fields stay None so the UI can render '—'.
    """

    designation: str
    fullname: str | None = None
    diameter_km: float | None = None
    h: float | None = None
    impact_probability_cumulative: float = Field(..., ge=0.0, le=1.0)
    palermo_scale_cumulative: float
    palermo_scale_max: float
    torino_scale_max: int | None = None
    n_impacts: int
    impact_year_range: str = Field(
        ..., description="'YYYY-YYYY' first→last potential impact"
    )
    last_observed: str | None = None
    velocity_infinity_km_s: float | None = None
    velocity_impact_km_s: float | None = None
    method: Literal["IOBS", "LOV", "MC", "unknown"] = "unknown"
    fetched_at_utc: datetime
    source: str = "JPL_CNEOS_SENTRY_II"
    source_url: str = "https://cneos.jpl.nasa.gov/sentry/"


class SentryDetailReport(BaseModel):
    """Wrap the (summary, vis, status) tuple for a single designation lookup.

    `status` distinguishes:
      - IN_RISK_LIST: summary + at least one VI present
      - REMOVED: object existed but was retired from Sentry (e.g. Apophis 2021)
      - NOT_FOUND: never tracked
      - ERROR: transport/parse failure (callers may render '—')
    """

    designation_query: str
    status: SentryStatus
    summary: SentryObjectSummary | None
    virtual_impactors: list[SentryVI] = Field(default_factory=list)
    removed_at_utc: str | None = None
    error_message: str | None = None
    fetched_at_utc: datetime
    cache_hit: bool = False


# ---------------------------------------------------------------------------
# JPL CAD (close approach data)
# ---------------------------------------------------------------------------


class CloseApproach(BaseModel):
    """One close-approach record from /cad.api.

    Distance fields are au by API convention; t_sigma_f is a string like
    '< 00:01' or '03:14:22' (3-sigma time uncertainty hh:mm:ss).
    """

    designation: str
    julian_date: float
    calendar_date: str
    miss_distance_au: float
    miss_distance_min_au: float
    miss_distance_max_au: float
    relative_velocity_km_s: float
    velocity_infinity_km_s: float
    time_uncertainty_3sigma: str
    h: float | None = None
    body: str = "Earth"
    fetched_at_utc: datetime
    source: str = "JPL_CNEOS_CAD"
    source_url: str = "https://ssd.jpl.nasa.gov/tools/cad.html"


# ---------------------------------------------------------------------------
# ESA NEOCC Aegis v5
# ---------------------------------------------------------------------------


class AegisRiskEntry(BaseModel):
    """One row from the ESA NEOCC Aegis v5 risk list.

    The text format ships fixed-width fields with `|` separators. Some
    designations include leading numbers (433Eros), comet suffixes, or
    survey codes (2024YR4); the client normalises whitespace.
    """

    designation: str
    name: str | None = None
    diameter_m: float | None = None
    star_flag: bool = Field(
        default=False,
        description="ESA '*' flag — diameter derived from H + albedo, not radar",
    )
    vi_max_date_utc: str | None = None
    impact_probability_max: float
    palermo_scale_max: float
    torino_scale: int
    velocity_km_s: float | None = None
    impact_year_range: str
    impact_probability_cumulative: float
    palermo_scale_cumulative: float
    fetched_at_utc: datetime
    source: str = "ESA_NEOCC_AEGIS_V5"
    source_url: str = "https://neo.ssa.esa.int/risk-list"


# ---------------------------------------------------------------------------
# Cross-validation envelope (used by /api/external/cross-validation/{des})
# ---------------------------------------------------------------------------


class CrossValidationReport(BaseModel):
    """Three-way comparison for a single designation.

    Carries each system's verdict + a convergence flag the UI uses to
    light up the ✓ / ⚠ indicator. Convergence is defined permissively:
    if any two of three systems agree on order-of-magnitude IP, we say
    'concur'; we flag 'diverge' only when systems disagree by more than
    one order of magnitude OR when one system says IN_RISK_LIST while
    another says NOT_FOUND.
    """

    designation_query: str
    sentry: SentryDetailReport | None
    aegis: AegisRiskEntry | None
    in_aegis_risk_list: bool
    convergence: Literal["concur", "diverge", "insufficient_data"]
    convergence_explanation: str
    retrieved_at_utc: datetime
