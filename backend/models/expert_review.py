"""Expert-review schemas — Opus 4.7 second opinion on the Bayesian ranker.

The Bayesian ranker classifies every NEOCP tracklet from observable
features in <1 ms. Opus 4.7 reviews the top-K rows with extended
thinking and emits a structured `ExpertReview` that the operator sees
alongside the ranker output. CONCUR/PARTIAL_CONCUR/DISSENT framing
keeps disagreement first-class — the system flags it, never hides it.

Schemas live here (not in `schemas.py`) so the briefing/cost modules
do not transitively import any expert-classifier code.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

ClassEndorsement = Literal["CONCUR", "DISSENT", "PARTIAL_CONCUR"]
EndorsedClass = Literal["NEO", "MBA", "COMET", "ARTIFACT", "UNCONFIRMED"]
ConfidenceMatch = Literal["HIGH", "MEDIUM", "LOW"]
SuggestedAction = Literal[
    "follow_up_immediately",
    "queue_normal",
    "request_second_epoch",
    "deprioritize",
    "monitor",
]
CaveatSeverity = Literal["INFO", "WARN", "CRITICAL"]


class ExpertCaveat(BaseModel):
    """One reasoned caveat from the expert reviewer.

    `code` is a stable enum-like token so the UI can colour / icon
    consistently across reviews. `explanation` is the natural-language
    rationale Opus emits during reasoning.
    """

    severity: CaveatSeverity
    code: str = Field(
        description=(
            "Stable token. Examples: BLENDED_SOURCE_RISK, OBSERVATORY_BIAS,"
            " MAGNITUDE_RATE_MISMATCH, SHORT_ARC_INSUFFICIENT,"
            " ECLIPTIC_LATITUDE_ANOMALY, DIGEST2_CONFIDENCE_LOW."
        )
    )
    explanation: str


class ExpertReview(BaseModel):
    """Structured second opinion from Opus 4.7 on a single tracklet."""

    trksub: str
    reviewed_at_utc: datetime
    model: str = "claude-opus-4-7"

    class_endorsement: ClassEndorsement
    endorsed_class: EndorsedClass
    confidence_match: ConfidenceMatch

    reasoning_trace: str = Field(
        description=(
            "Two-to-four-paragraph natural-language argument for the"
            " endorsement. Operator-facing prose."
        )
    )
    caveats: list[ExpertCaveat] = Field(default_factory=list)
    suggested_action: SuggestedAction

    quality_acknowledgment: str | None = Field(
        default=None,
        description=(
            "How astrometric-quality grade (Find_Orb-style A/B/C/F)"
            " influenced the reasoning. Optional — populated when the"
            " ranker passes a quality breakdown into the prompt; absent"
            " for legacy reviews and offline-cached pre-quality output."
        ),
    )

    thinking_tokens_used: int = 0
    output_tokens_used: int = 0
    cost_usd: float = 0.0
    cache_hit: bool = False
