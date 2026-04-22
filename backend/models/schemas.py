"""Pydantic schemas shared across routers and services.

These models are the wire contract between backend, frontend, and the
Claude Managed Agent. Changes here ripple into `docs/api-contract.md`
and into the TypeScript types mirrored on the frontend side.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

ClassLabel = Literal["NEO", "MBA", "COMET", "ARTIFACT", "UNCONFIRMED"]
"""The five mutually exclusive disposition classes the classifier can assign."""


ChunkType = Literal["thinking", "text", "meta", "done", "error"]
"""SSE chunk categories emitted by the streaming briefing endpoint."""


class Candidate(BaseModel):
    """A NEOCP tracklet — observed quantities only, no model output."""

    trksub: str = Field(..., description="MPC submitter tracklet designation")
    ra_deg: float = Field(..., ge=0, lt=360, description="RA J2000 (degrees)")
    dec_deg: float = Field(..., ge=-90, le=90, description="Dec J2000 (degrees)")
    mean_magnitude: float = Field(..., description="Apparent magnitude, V band unless noted")
    rate_arcsec_min: float = Field(..., description="Rate of motion (arcsec per minute)")
    observatory_code: str = Field(..., description="MPC observatory code")
    first_obs_datetime: datetime = Field(..., description="First observation in tracklet (UTC)")
    n_observations: int = Field(..., ge=2, description="Observation count in tracklet")
    arc_length_minutes: float = Field(..., gt=0, description="Tracklet time span (minutes)")
    digest2_neo_noid: int = Field(..., ge=0, le=100, description="MPC digest2 NEO-NoID score")
    ecliptic_latitude_deg: float = Field(..., description="Ecliptic beta (degrees)")


class Prediction(BaseModel):
    """Posterior classification from the Bayesian ranker (added in Day 2)."""

    trksub: str
    prob_neo: float = Field(..., ge=0, le=1)
    prob_pha: float = Field(..., ge=0, le=1)
    prob_neo_ci_90: tuple[float, float] = Field(
        ..., description="90% credible interval for P(NEO)"
    )
    map_class: ClassLabel
    uncertainty_entropy_bits: float = Field(
        ..., description="Shannon entropy of the class posterior"
    )
    model_version: str


class BriefingRequest(BaseModel):
    """Input to the briefing engine."""

    candidate: Candidate
    prediction: Prediction | None = None
    cross_survey_context: str | None = Field(
        default=None,
        description="Free-form context about recent survey coverage or non-detections",
    )
    include_reasoning: bool = Field(
        default=True, description="Whether to enable Opus extended thinking"
    )
    observer_location: str | None = Field(
        default=None, description="Optional observer context for per-site tailoring"
    )


class BriefingChunk(BaseModel):
    """Single SSE chunk produced by the streaming briefing endpoint."""

    type: ChunkType
    content: str
    cumulative_cost_usd: float | None = None


class BriefingResponse(BaseModel):
    """Non-streaming aggregated response, used by tests and the content cache."""

    trksub: str
    briefing_markdown: str
    reasoning_trace: str | None = None
    model_version: str
    input_tokens: int
    output_tokens: int
    thinking_tokens: int
    cost_usd: float
    generated_at: datetime
    cache_hit: bool = False


class CostSummary(BaseModel):
    """Exposed by the /api/cost endpoint for the dashboard cost meter."""

    total_spent_usd: float
    n_calls: int
    budget_remaining_usd: float
    total_input_tokens: int
    total_output_tokens: int
    total_thinking_tokens: int
    last_call_at: str | None
