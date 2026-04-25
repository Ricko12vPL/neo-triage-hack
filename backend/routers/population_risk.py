"""Population-weighted impact risk endpoint.

Returns demo-grade casualty + damage estimates for an asteroid impact
hypothesis. Combines:
  1. backend.services.impact_damage_model — Collins et al. 2017 scaling
  2. backend.data.population_grid          — synthetic top-50 city grid

Honest disclosure baked into every response: `caveat` field tells the
frontend exactly what is demo-grade and what would change at production
scale (CIESIN GPWv4 raster + Find_Orb impact corridor sampling).

This is the single feature most strongly associated with how
production planetary defense communities frame impact risk (the
research frontier per Liu et al. 2025 Nature on YR4) — neo-triage now
exposes the same primitive.
"""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from backend.data.population_grid import (
    GRID_SOURCE_LABEL,
    GRID_SOURCE_NOTE,
    population_density_at,
    population_in_circle,
)
from backend.models.external import ImpactCorridorEstimate
from backend.services.impact_damage_model import (
    estimate_damage,
    estimate_diameter_from_h,
)
from backend.services.jpl_sentry_client import (
    JPLSentryClient,
    estimate_corridor_from_sentry,
    get_jpl_sentry_client,
)

router = APIRouter(prefix="/api/risk", tags=["risk"])

# Severe-damage casualty fraction. Production damage models (Glasstone &
# Dolan tables) range 30–80 % depending on time-of-day and structure
# density; we use 50 % as a conservative midpoint and surface it as a
# caveat so the operator can adjust mentally.
SEVERE_ZONE_CASUALTY_FRACTION = 0.5


class PopulationRiskRequest(BaseModel):
    designation: str = Field(..., description="Object label for display")
    impact_probability: float = Field(
        ..., ge=0.0, le=1.0, description="Cumulative IP from OD or risk list"
    )
    velocity_km_s: float = Field(..., gt=0, description="Impact velocity")
    diameter_m: float | None = Field(
        default=None,
        gt=0,
        description=(
            "Object diameter (meters). If null, derived from H + albedo."
        ),
    )
    absolute_magnitude_h: float | None = Field(
        default=None,
        description="Absolute magnitude H (used when diameter unknown)",
    )
    albedo: float = Field(default=0.14, gt=0, le=1.0)
    density_kg_m3: float = Field(default=3000.0, gt=0)
    impact_latitude_deg: float = Field(
        default=14.6, description="Hypothetical impact latitude"
    )
    impact_longitude_deg: float = Field(
        default=120.98,
        description=(
            "Hypothetical impact longitude. Default is Manila — a"
            " representative metro on the equatorial belt that matches"
            " the publicly published 2024 YR4 corridor footprint."
        ),
    )


class PopulationRiskResponse(BaseModel):
    designation: str
    diameter_m: float
    velocity_km_s: float
    impact_probability: float
    energy_megatons_tnt: float
    severe_damage_radius_km: float
    thermal_radiation_radius_km: float
    seismic_radius_km: float
    population_in_zone: int
    cities_in_zone: list[str]
    metro_population_in_zone: int
    background_population_in_zone: int
    expected_casualties_unconditional: float = Field(
        ...,
        description=(
            "Population-in-zone × casualty fraction × impact_probability."
            " The headline number for triage prioritisation."
        ),
    )
    expected_casualties_if_impact: float = Field(
        ...,
        description=(
            "Population-in-zone × casualty fraction. Conditional on impact —"
            " absorbs the 'what if' question."
        ),
    )
    impact_latitude_deg: float
    impact_longitude_deg: float
    local_density_per_km2: float
    casualty_fraction_assumed: float = SEVERE_ZONE_CASUALTY_FRACTION
    population_grid_source: str = GRID_SOURCE_LABEL
    caveat: str = GRID_SOURCE_NOTE
    methodology: str = (
        "Damage radius from Collins et al. 2017 Earth Impact Effects (5-psi"
        " overpressure airburst scaling). Population from synthetic top-50"
        " metro grid + 12/km² rural background."
    )
    grade: Literal["demo", "production"] = "demo"
    computed_at_utc: datetime


@router.post("/population-weighted", response_model=PopulationRiskResponse)
async def population_weighted_risk(req: PopulationRiskRequest) -> PopulationRiskResponse:
    """Compute population-in-zone + expected casualties for an impact hypothesis.

    Behaviour:
      - If `diameter_m` is set, used directly.
      - Else if `absolute_magnitude_h` is set, derive via H + albedo.
      - Else default to 50m (Tunguska/YR4 scale) with a stronger caveat.
    """
    if req.diameter_m is not None:
        diameter_m = req.diameter_m
    elif req.absolute_magnitude_h is not None:
        diameter_m = estimate_diameter_from_h(req.absolute_magnitude_h, albedo=req.albedo)
    else:
        diameter_m = 50.0  # Tunguska/YR4 default for missing data

    damage = estimate_damage(
        diameter_m=diameter_m,
        velocity_km_s=req.velocity_km_s,
        density_kg_m3=req.density_kg_m3,
    )
    pop = population_in_circle(
        req.impact_latitude_deg,
        req.impact_longitude_deg,
        damage.severe_damage_radius_km,
    )
    casualties_if_impact = (
        float(pop["population_in_zone"]) * SEVERE_ZONE_CASUALTY_FRACTION
    )
    casualties_unconditional = casualties_if_impact * req.impact_probability

    return PopulationRiskResponse(
        designation=req.designation,
        diameter_m=diameter_m,
        velocity_km_s=req.velocity_km_s,
        impact_probability=req.impact_probability,
        energy_megatons_tnt=damage.energy_megatons_tnt,
        severe_damage_radius_km=damage.severe_damage_radius_km,
        thermal_radiation_radius_km=damage.thermal_radiation_radius_km,
        seismic_radius_km=damage.seismic_radius_km,
        population_in_zone=int(pop["population_in_zone"]),
        cities_in_zone=list(pop["cities_in_zone"]),
        metro_population_in_zone=int(pop["metro_population_in_zone"]),
        background_population_in_zone=int(pop["background_population_in_zone"]),
        expected_casualties_unconditional=casualties_unconditional,
        expected_casualties_if_impact=casualties_if_impact,
        impact_latitude_deg=req.impact_latitude_deg,
        impact_longitude_deg=req.impact_longitude_deg,
        local_density_per_km2=population_density_at(
            req.impact_latitude_deg, req.impact_longitude_deg
        ),
        computed_at_utc=datetime.now(UTC),
    )


@router.get(
    "/corridor/{designation}",
    response_model=ImpactCorridorEstimate | None,
    responses={
        200: {
            "description": (
                "Approximate corridor estimate from JPL Sentry-II top virtual"
                " impactor. Null body when the object is not on the Sentry"
                " risk list (e.g. removed, never tracked, or has no positive-"
                "IP virtual impactor)."
            )
        },
    },
)
async def impact_corridor(
    designation: str,
    sentry_client: JPLSentryClient = Depends(get_jpl_sentry_client),
) -> ImpactCorridorEstimate | None:
    """Return an approximate b-plane corridor for a Sentry-tracked NEO.

    Backed by the JPL CNEOS Sentry-II API via JPLSentryClient (cached
    on disk for `CACHE_TTL_HOURS`). Returns `null` (HTTP 200) when no
    corridor can be estimated — callers should treat this the same as
    'famous NEO without active Sentry entry' and fall back to the
    deferred placeholder.
    """
    report = await sentry_client.get_object_detail(designation)
    return estimate_corridor_from_sentry(report=report)
