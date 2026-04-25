"""Pydantic models for the Imminent Impactors Library.

Six historically verified pre-impact predictions, served as a curated
catalog with multi-source citations. Every numeric field traces back
to a peer-reviewed paper or an official agency publication (ESA NEOCC,
NASA JPL CNEOS, IAWN, SMPAG). No invented values.

Cases (chronological, with their position in the global timeline of
imminent-impact predictions):

  - 2008 TC3   (#1, Sudan, ureilite recovery — Almahata Sitta)
  - 2014 AA    (#2, mid-Atlantic, no recovery)
  - 2022 EB5   (#5, Norwegian Sea, first European observer)
  - 2023 CX1   (#7, Normandy France, recovery)
  - 2024 BX1   (#8, Berlin Germany, ribbeck aubrite)
  - 2024 YR4   (CLEARED, peak Torino-3, never impacted — JWST cleared 2025-03-25)

The 2024 YR4 case is the headline: it is the modern reference of how
planetary defense is supposed to work end-to-end (discovery → IAWN →
SMPAG → JWST → cleared). It carries the only multi-vertex risk corridor
in the catalog because it is the only case for which the corridor was
*projected* publicly before being retired.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class CorridorVertex(BaseModel):
    """One labelled vertex along a published risk-corridor polyline.

    The label is what ESA / NASA called the geographical region in the
    publication (e.g. "Eastern equatorial Pacific Ocean"). It surfaces
    in the UI as a hover tooltip on the polyline.
    """

    name: str = Field(..., description="Region label as published")
    lat_deg: float = Field(..., ge=-90.0, le=90.0)
    lon_deg: float = Field(..., ge=-180.0, le=180.0)


class MeteoriteRecovery(BaseModel):
    """Post-impact meteorite-recovery summary.

    Only present for cases where physical fragments were retrieved
    from the impact strewn field. Each field is sourced from the
    recovery team's own publication (Jenniskens et al. for TC3, the
    FRIPON network for CX1, the Spurný et al. 2024 A&A paper for BX1).
    """

    name: str = Field(..., description="Conventional meteorite name")
    fragments_recovered: int = Field(..., ge=0)
    total_mass_kg: float | None = Field(default=None, ge=0.0)
    first_recovery_date: str = Field(..., description="ISO-8601 date string")
    first_recovery_finder: str | None = None
    search_lead: str = Field(..., description="Recovery PI / lead organisation")
    meteorite_class: str = Field(..., description="Petrologic classification")
    strewn_field_lat_deg: float | None = Field(default=None, ge=-90.0, le=90.0)
    strewn_field_lon_deg: float | None = Field(default=None, ge=-180.0, le=180.0)
    strewn_field_long_axis_km: float | None = Field(default=None, ge=0.0)
    strewn_field_short_axis_km: float | None = Field(default=None, ge=0.0)


CaseType = Literal["CLEARED", "IMPACTED"]


class ImminentImpactorCase(BaseModel):
    """One verified pre-impact prediction.

    Designation conventions: the canonical IAU provisional designation
    ('2008 TC3'), with the temporary survey alias kept separately
    ('Sar2667' for 2023 CX1, etc.) where one was issued.

    case_number_in_history is the position in the global timeline:
    1=TC3, 2=AA, 5=EB5, 7=CX1, 8=BX1. 2024 YR4 doesn't fit this
    sequence (cleared, never impacted), so we label it 0 — sentinel
    meaning "headline reference case, not part of the impacted-only
    list".

    impact_* fields are nullable so 2024 YR4 (cleared) can validate.
    For impacted cases all impact_* fields are required at the
    producer side; the catalog loader validates this invariant.
    """

    designation: str = Field(..., description="IAU provisional designation")
    designation_temporary: str | None = None
    case_number_in_history: int = Field(..., ge=0)
    case_type: CaseType
    discovery_date_utc: str = Field(..., description="ISO-8601 datetime")
    discovery_observer: str
    discovery_observatory: str
    warning_time_hours: float | None = Field(default=None, ge=0.0)
    diameter_m: float = Field(..., gt=0.0)
    diameter_uncertainty_m: float | None = Field(default=None, ge=0.0)
    absolute_magnitude_h: float | None = None
    spectral_type: str | None = None
    impact_time_utc: str | None = None
    impact_lat_deg: float | None = Field(default=None, ge=-90.0, le=90.0)
    impact_lon_deg: float | None = Field(default=None, ge=-180.0, le=180.0)
    impact_uncertainty_km: float | None = Field(default=None, ge=0.0)
    impact_location_name: str | None = None
    impact_velocity_km_s: float | None = Field(default=None, ge=0.0)
    impact_energy_kt_tnt: float | None = Field(default=None, ge=0.0)
    explosion_altitude_km: float | None = Field(default=None, ge=0.0)
    meteorite_recovery: MeteoriteRecovery | None = None
    corridor_polyline: list[CorridorVertex] | None = None
    estimated_population_in_corridor: int | None = Field(default=None, ge=0)
    peak_torino_scale: int | None = Field(default=None, ge=0, le=10)
    peak_impact_probability: float | None = Field(default=None, ge=0.0, le=1.0)
    peak_impact_probability_date: str | None = None
    cleared_date: str | None = None
    cleared_by: str | None = None
    historical_significance: str
    iawn_activated: bool = False
    smpag_activated: bool = False
    sources: list[str] = Field(..., min_length=2)
    fetched_at_utc: datetime


class ImminentImpactorsSummary(BaseModel):
    """Compact summary entry returned by the list endpoint.

    Drops bulky fields (corridor_polyline, sources) so the timeline
    overview stays small. Full detail comes from the per-case endpoint.
    """

    designation: str
    case_number_in_history: int
    case_type: CaseType
    discovery_date_utc: str
    impact_time_utc: str | None
    diameter_m: float
    impact_lat_deg: float | None
    impact_lon_deg: float | None
    impact_location_name: str | None
    has_meteorite_recovery: bool
    has_corridor_polyline: bool
    historical_significance: str
