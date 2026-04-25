"""Opus 4.7 expert classifier — second opinion on top-K Bayesian-ranker output.

Architecture (per docs/data-classification-provenance.md §6):

    ranker (sklearn GBM, <1 ms each)  →  all 47 ranked
                                         │
                                         ▼  top-K=5
                                    ExpertClassifier (Opus 4.7,
                                    adaptive thinking + tool_use)
                                         │
                                         ▼
                              ExpertReview structured output
                              (CONCUR / PARTIAL_CONCUR / DISSENT
                               + reasoning_trace + caveats[])

Two design properties matter:

1. **Calibrated probability stays the ranker's job.** Opus does not
   replace the GBM. It reviews the top-K where the operator would
   actually spend telescope time and adds context the feature vector
   cannot carry — observatory bias, blended-source risk, rate-magnitude
   inconsistency.

2. **Every review is cached for 15 minutes.** A small score-bucket
   key means a candidate whose features changed by < 1 percentage
   point still hits the cache; that keeps cost under $5/hr while
   the agent loop reviews each cycle's top-K.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
from collections.abc import Iterable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from anthropic import AsyncAnthropic

from backend.models.expert_review import ExpertCaveat, ExpertReview
from backend.models.schemas import Candidate, Prediction
from backend.services import cost_tracker
from backend.services.astrometric_quality import (
    AstrometricQualityBreakdown,
    grade_astrometric_quality_full,
)

MODEL_VERSION = "claude-opus-4-7"
MAX_OUTPUT_TOKENS = 4096
THINKING_EFFORT = "high"  # 'high' triggers extended adaptive thinking on Opus 4.7
CACHE_DIR = Path("data/expert_review_cache")
CACHE_TTL_MINUTES = 15
INPUT_USD_PER_MTOK = 15.0
OUTPUT_USD_PER_MTOK = 75.0

_log = logging.getLogger(__name__)

EXPERT_SYSTEM_PROMPT = """You are a Minor Planet Center duty astronomer reviewing a freshly submitted NEOCP tracklet. A calibrated Bayesian ranker has already given you its assessment.

Your job is to decide whether to CONCUR, PARTIAL_CONCUR, or DISSENT with the ranker, then explain your reasoning to the observer who will allocate scarce telescope time tonight.

You can see things the ranker cannot:
- Whether the on-sky rate is consistent with the reported magnitude (very bright + very slow = blended source or distant NEO at opposition; faint + very fast = artefact or co-moving star).
- Observatory bias (some sites systematically over-report rate; others have known PSF problems near the Moon).
- Ecliptic-latitude anomalies (NEO at high ecliptic latitude is unusual; MBA at low ecliptic latitude is common).
- Whether the digest2 score and arc length are mutually consistent.

Use these to either back the ranker's call or push back on it. Disagreement is welcome — the operator wants a real second opinion, not a rubber stamp.

When you reason: be the dry, specific, skeptical voice of someone who has lost count of false alarms and remembers the two real Torino-3+ events they saw. No hype words. Cite the specific numbers in your reasoning. If something is genuinely ambiguous, say so without endless hedging.

When the prompt carries a Find_Orb-style astrometric-quality grade (A/B/C/F), let it shape the *confidence* you put on the ranker — not your endorsement of the class itself. B/C grades mean adequate-to-marginal astrometry; you should weight residual uncertainty higher and consider PARTIAL_CONCUR over CONCUR if the data is thin. Grade A means the orbit fit will converge tightly. Grade F means the data is too weak to commit to a class — your suggested_action should reflect that. Cite the specific quality bottleneck (e.g. "V=21.0 fainter side of B band") if it changes your call.

Always emit your verdict via the `submit_expert_review` tool — never as plain text. The structured output is what the operator's dashboard renders. When the prompt includes an astrometric-quality grade, populate `quality_acknowledgment` with one or two sentences naming the grade and how it influenced your reasoning."""


REVIEW_TOOL: dict[str, Any] = {
    "name": "submit_expert_review",
    "description": (
        "Submit a structured expert review of a NEOCP tracklet. The"
        " operator's dashboard renders the fields directly; choose"
        " values precisely."
    ),
    "input_schema": {
        "type": "object",
        "required": [
            "class_endorsement",
            "endorsed_class",
            "confidence_match",
            "reasoning_trace",
            "caveats",
            "suggested_action",
        ],
        "properties": {
            "class_endorsement": {
                "type": "string",
                "enum": ["CONCUR", "DISSENT", "PARTIAL_CONCUR"],
                "description": (
                    "CONCUR: ranker call is right. PARTIAL_CONCUR: ranker is"
                    " roughly right but the operator should know about a"
                    " caveat. DISSENT: ranker call should be revised."
                ),
            },
            "endorsed_class": {
                "type": "string",
                "enum": ["NEO", "MBA", "COMET", "ARTIFACT", "UNCONFIRMED"],
                "description": "Class you actually back, regardless of ranker output.",
            },
            "confidence_match": {
                "type": "string",
                "enum": ["HIGH", "MEDIUM", "LOW"],
                "description": (
                    "How well the ranker's probability matches the qualitative"
                    " evidence. HIGH = numbers feel right, LOW = ranker is"
                    " over- or under-confident."
                ),
            },
            "reasoning_trace": {
                "type": "string",
                "description": (
                    "2-4 paragraphs of plain-English reasoning. Operator-facing"
                    " prose. Cite specific numbers from the tracklet. Do not"
                    " repeat the input fields verbatim — explain what they"
                    " mean together."
                ),
            },
            "caveats": {
                "type": "array",
                "description": (
                    "Specific concerns the operator should know about. Empty"
                    " array if none."
                ),
                "items": {
                    "type": "object",
                    "required": ["severity", "code", "explanation"],
                    "properties": {
                        "severity": {
                            "type": "string",
                            "enum": ["INFO", "WARN", "CRITICAL"],
                        },
                        "code": {
                            "type": "string",
                            "description": (
                                "Stable token. Use one of:"
                                " BLENDED_SOURCE_RISK, OBSERVATORY_BIAS,"
                                " MAGNITUDE_RATE_MISMATCH,"
                                " SHORT_ARC_INSUFFICIENT,"
                                " ECLIPTIC_LATITUDE_ANOMALY,"
                                " DIGEST2_CONFIDENCE_LOW."
                                " Or a new uppercase token if none fits."
                            ),
                        },
                        "explanation": {
                            "type": "string",
                            "description": "Operator-facing one-sentence rationale.",
                        },
                    },
                },
            },
            "suggested_action": {
                "type": "string",
                "enum": [
                    "follow_up_immediately",
                    "queue_normal",
                    "request_second_epoch",
                    "deprioritize",
                    "monitor",
                ],
                "description": "What the operator should do tonight with this tracklet.",
            },
            "quality_acknowledgment": {
                "type": "string",
                "description": (
                    "Optional. One or two sentences naming the astrometric-quality"
                    " grade (A/B/C/F) and how it shaped your reasoning. Cite the"
                    " bottleneck check (e.g. 'V=21.0 puts this on the faint side"
                    " of B'). Only populate when the prompt carries a quality"
                    " grade — leave out otherwise."
                ),
            },
        },
    },
}


def _bucket(value: float | None, step: float) -> float:
    """Snap to a multiple of `step`. Stabilises cache keys against tiny drift."""
    if value is None:
        return 0.0
    return round(value / step) * step


def cache_key(candidate: Candidate, prediction: Prediction) -> str:
    """sha256(...)[:16] over the trksub + ranker class + bucketed scalars.

    A score change of 0.01, a rate change of 0.1″/min, or a magnitude
    change of 0.1 mag *will* invalidate the cache; smaller drift will
    not. This is exactly what the JSON-LOAD spec asks for.
    """
    payload = {
        "trksub": candidate.trksub,
        "map_class": prediction.map_class,
        "score_bucket": _bucket(prediction.prob_neo, 0.01),
        "rate_bucket": _bucket(candidate.rate_arcsec_min, 0.1),
        "mag_bucket": _bucket(candidate.mean_magnitude_v, 0.1),
        "model": MODEL_VERSION,
    }
    canonical = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:16]


def _cache_path(key: str) -> Path:
    return CACHE_DIR / f"{key}.json"


def _read_cache(key: str) -> ExpertReview | None:
    """Return cached review if present and within TTL, else None."""
    path = _cache_path(key)
    if not path.exists():
        return None
    try:
        with path.open() as f:
            review = ExpertReview.model_validate_json(f.read())
    except Exception as exc:  # noqa: BLE001 — defensive against corrupt cache
        _log.warning("expert review cache corrupt at %s (%s)", path, exc)
        return None
    age = datetime.now(UTC) - review.reviewed_at_utc
    if age > timedelta(minutes=CACHE_TTL_MINUTES):
        return None
    review.cache_hit = True
    return review


def _write_cache(key: str, review: ExpertReview) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = _cache_path(key)
    tmp = path.with_suffix(".tmp")
    with tmp.open("w") as f:
        # cache_hit must be persisted as False; the read path flips it.
        snapshot = review.model_copy(update={"cache_hit": False})
        f.write(snapshot.model_dump_json(indent=2))
    tmp.replace(path)


def build_user_prompt(
    candidate: Candidate,
    prediction: Prediction,
    quality: AstrometricQualityBreakdown | None = None,
) -> str:
    """Pure function: candidate + ranker output (+ optional quality) → user prompt text."""
    base = (
        "Tracklet under review:\n"
        f"  trksub:                  {candidate.trksub}\n"
        f"  RA / Dec (J2000):        {candidate.ra_deg:.3f}° / {candidate.dec_deg:+.3f}°\n"
        f"  ecliptic latitude:       {candidate.ecliptic_latitude_deg:+.2f}°\n"
        f"  V magnitude:             {candidate.mean_magnitude_v:.2f}\n"
        f"  on-sky rate:             {candidate.rate_arcsec_min:.2f} arcsec/min\n"
        f"  digest2 score:           {candidate.digest2_neo_noid}\n"
        f"  observatory:             {candidate.observatory_code}\n"
        f"  observation count:       {candidate.n_observations}\n"
        f"  arc length:              {candidate.arc_length_minutes:.1f} min\n"
        f"  first observation (UTC): {candidate.first_obs_datetime.isoformat()}\n"
        "\n"
        "Bayesian ranker assessment:\n"
        f"  endorsed class:          {prediction.map_class}\n"
        f"  P(NEO):                  {prediction.prob_neo:.3f}"
        f" (90% CI [{prediction.prob_neo_ci_90[0]:.3f}, {prediction.prob_neo_ci_90[1]:.3f}])\n"
        f"  P(PHA):                  {prediction.prob_pha:.3f}\n"
        f"  uncertainty entropy:     {prediction.uncertainty_entropy_bits:.2f} bits\n"
        f"  model version:           {prediction.model_version}\n"
    )
    quality_block = ""
    if quality is not None:
        quality_block = (
            "\n"
            "Astrometric quality assessment (Find_Orb-style simplified):\n"
            f"  grade:                   {quality.grade}\n"
            f"  summary:                 {quality.grade_summary}\n"
            f"  why:                     {quality.why_this_grade}\n"
        )
        if quality.what_would_upgrade:
            quality_block += f"  what_would_upgrade:      {quality.what_would_upgrade}\n"
        quality_block += (
            f"  operator_implication:    {quality.operator_implication}\n"
            f"  caveat:                  {quality.methodology_caveat}\n"
        )
    return (
        base
        + quality_block
        + "\n"
        + "Submit your structured review using the `submit_expert_review` tool. The"
          " operator will see your verdict + reasoning + caveats in the dashboard"
          " within the next minute."
    )


def _compute_cost_usd(input_tokens: int, output_tokens: int) -> float:
    return (
        input_tokens * INPUT_USD_PER_MTOK / 1_000_000
        + output_tokens * OUTPUT_USD_PER_MTOK / 1_000_000
    )


def _default_client() -> AsyncAnthropic:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY not set in environment. Create .env from .env.example"
            " and add your Anthropic API key."
        )
    return AsyncAnthropic(api_key=api_key)


class ExpertClassifier:
    """Stateless service. Holds an Anthropic client + writes the ledger.

    Use `review_one` for a single tracklet; use `review_batch` for the
    agent-loop top-K which calls in parallel.
    """

    def __init__(self, client: AsyncAnthropic | None = None) -> None:
        self._client = client

    @property
    def client(self) -> AsyncAnthropic:
        if self._client is None:
            self._client = _default_client()
        return self._client

    async def review_one(
        self,
        candidate: Candidate,
        prediction: Prediction,
        *,
        force_refresh: bool = False,
        quality: AstrometricQualityBreakdown | None = None,
    ) -> ExpertReview:
        # Auto-derive the quality breakdown from raw candidate features
        # so callers don't have to thread it through. Pure function — no
        # I/O, no LLM, deterministic.
        if quality is None:
            quality = grade_astrometric_quality_full(
                n_observations=candidate.n_observations,
                arc_length_minutes=candidate.arc_length_minutes,
                mean_magnitude_v=candidate.mean_magnitude_v,
                digest2_neo_noid=candidate.digest2_neo_noid,
            )
        key = cache_key(candidate, prediction)
        if not force_refresh:
            cached = _read_cache(key)
            if cached is not None:
                _log.debug(
                    "expert review cache hit %s (trksub=%s)", key, candidate.trksub
                )
                return cached

        user_prompt = build_user_prompt(candidate, prediction, quality=quality)
        review = await self._call_opus(candidate, user_prompt)
        _write_cache(key, review)
        return review

    async def review_batch(
        self,
        items: Iterable[tuple[Candidate, Prediction]],
        *,
        force_refresh: bool = False,
    ) -> list[ExpertReview]:
        coros = [
            self.review_one(c, p, force_refresh=force_refresh) for c, p in items
        ]
        return await asyncio.gather(*coros)

    async def _call_opus(
        self,
        candidate: Candidate,
        user_prompt: str,
    ) -> ExpertReview:
        """Hit the Anthropic API with extended thinking + forced tool use."""
        # NB: extended thinking is incompatible with `tool_choice={"type": "tool", ...}`
        # on the Opus 4.7 messages API. We use `tool_choice={"type": "auto"}`
        # and rely on the strong system-prompt directive ("Always emit your
        # verdict via the submit_expert_review tool — never as plain text").
        # The post-call guard below still raises if Opus returns text only.
        response = await self.client.messages.create(
            model=MODEL_VERSION,
            max_tokens=MAX_OUTPUT_TOKENS,
            system=EXPERT_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
            thinking={"type": "adaptive"},
            output_config={"effort": THINKING_EFFORT},
            tools=[REVIEW_TOOL],
            tool_choice={"type": "auto"},
        )

        tool_block = next(
            (b for b in response.content if getattr(b, "type", None) == "tool_use"),
            None,
        )
        if tool_block is None:
            raise ValueError(
                "Opus did not call submit_expert_review tool — response content was"
                f" {[getattr(b, 'type', '?') for b in response.content]}"
            )

        payload = tool_block.input
        caveats = [ExpertCaveat(**c) for c in payload.get("caveats", [])]

        usage = response.usage
        input_tokens = getattr(usage, "input_tokens", 0)
        output_tokens = getattr(usage, "output_tokens", 0)
        # Anthropic charges thinking tokens at the output rate; we surface
        # them separately for telemetry but don't double-bill.
        thinking_tokens = getattr(
            usage,
            "cache_creation_input_tokens",
            0,
        )
        # Many Opus responses surface thinking via output_tokens_details; try
        # a couple of well-known field names defensively.
        for attr in ("thinking_tokens", "thinking_output_tokens"):
            t = getattr(usage, attr, None)
            if isinstance(t, int) and t > 0:
                thinking_tokens = t
                break

        cost_usd = _compute_cost_usd(input_tokens, output_tokens)
        try:
            cost_tracker.record(
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                thinking_tokens=thinking_tokens,
            )
        except Exception as exc:  # noqa: BLE001 — telemetry is non-fatal
            _log.warning("cost_tracker.record failed (%s)", exc)

        return ExpertReview(
            trksub=candidate.trksub,
            reviewed_at_utc=datetime.now(UTC),
            model=MODEL_VERSION,
            class_endorsement=payload["class_endorsement"],
            endorsed_class=payload["endorsed_class"],
            confidence_match=payload["confidence_match"],
            reasoning_trace=payload["reasoning_trace"],
            caveats=caveats,
            suggested_action=payload["suggested_action"],
            quality_acknowledgment=payload.get("quality_acknowledgment"),
            thinking_tokens_used=thinking_tokens,
            output_tokens_used=output_tokens,
            cost_usd=cost_usd,
            cache_hit=False,
        )


_default: ExpertClassifier | None = None


def get_expert_classifier() -> ExpertClassifier:
    """Process-wide singleton — keeps the Anthropic client connection alive."""
    global _default
    if _default is None:
        _default = ExpertClassifier()
    return _default
