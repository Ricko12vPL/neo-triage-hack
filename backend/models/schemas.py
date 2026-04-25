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


ChunkType = Literal["thinking", "reasoning", "text", "meta", "done", "error"]
"""SSE chunk categories emitted by the streaming briefing endpoint.

- `thinking`: legacy — extended-thinking delta events from older Claude API.
  Opus 4.7 adaptive mode does not emit these; kept for backward compatibility.
- `reasoning`: the `## Reasoning` section of the model's structured output,
  streamed before the `## Briefing` marker. Rendered in a collapsible panel
  in the UI — this is how we make Opus 4.7 thinking visible without the
  streamed thinking_delta events that adaptive mode withholds.
- `text`: the `## Briefing` section content — the observer-facing output.
- `meta`, `done`, `error`: control events.
"""


class Candidate(BaseModel):
    """A NEOCP tracklet — observed quantities plus two optional enrichments.

    `impact_probability` and `absolute_magnitude_h` are not derivable from the
    tracklet alone; they come from orbit determination + catalogue cross-match
    (e.g. JPL HORIZONS, MPC orbit database, Sentry/NEODyS close-approach
    tables). For real NEOCP candidates they will be None until enrichment.
    For mock fixtures and the YR4 historical replay, we populate plausible
    values so the Torino Scale can be computed end-to-end.
    """

    trksub: str = Field(..., description="MPC submitter tracklet designation")
    ra_deg: float = Field(..., ge=0, lt=360, description="RA J2000 (degrees)")
    dec_deg: float = Field(..., ge=-90, le=90, description="Dec J2000 (degrees)")
    mean_magnitude_v: float = Field(..., description="Apparent magnitude, V band unless noted")
    rate_arcsec_min: float = Field(..., description="Rate of motion (arcsec per minute)")
    observatory_code: str = Field(..., description="MPC observatory code")
    first_obs_datetime: datetime = Field(..., description="First observation in tracklet (UTC)")
    n_observations: int = Field(..., ge=2, description="Observation count in tracklet")
    arc_length_minutes: float = Field(..., gt=0, description="Tracklet time span (minutes)")
    digest2_neo_noid: int = Field(..., ge=0, le=100, description="MPC digest2 NEO-NoID score")
    ecliptic_latitude_deg: float = Field(..., description="Ecliptic beta (degrees)")
    impact_probability: float | None = Field(
        default=None,
        ge=0.0,
        le=1.0,
        description=(
            "Probability of Earth impact in the near-term close-approach window "
            "(0-1 fraction). Enrichment from orbit determination; None until an "
            "orbit is solved."
        ),
    )
    absolute_magnitude_h: float | None = Field(
        default=None,
        description=(
            "Absolute magnitude H (V band, alpha=0, 1 AU). Size proxy — "
            "required alongside impact_probability to classify Torino severity."
        ),
    )
    data_source: Literal["LIVE_MPC_NEOCP", "DEMO_FIXTURE"] = Field(
        default="LIVE_MPC_NEOCP",
        description=(
            "Where this Candidate originated. LIVE_MPC_NEOCP = scraped from"
            " minorplanetcenter.net/iau/NEO/neocp.txt (real). DEMO_FIXTURE ="
            " handcrafted (e.g. P21YR4A YR4 analogue, P21LOWRT DISSENT case)."
            " The frontend renders one badge per source so jurors can"
            " distinguish real tracklets from curated demo fixtures."
        ),
    )
    data_source_url: str | None = Field(
        default=None,
        description="Source URL (set for LIVE_MPC_NEOCP rows; None otherwise).",
    )
    data_source_fetched_at_utc: datetime | None = Field(
        default=None,
        description="When this row was fetched (LIVE_MPC_NEOCP only).",
    )


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
    reasoning_markdown: str = ""
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
