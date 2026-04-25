"""Tests for the Opus 4.7 expert-review classifier (mocked Anthropic).

The real Anthropic SDK is never reached. Each test patches
`AsyncAnthropic.messages.create` with a small async mock that returns
canned tool_use content + usage tokens.
"""
from __future__ import annotations

import asyncio
import shutil
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from backend.models.expert_review import ExpertReview
from backend.models.schemas import Candidate, Prediction
from backend.services import expert_classifier as ec_mod
from backend.services.expert_classifier import (
    CACHE_DIR,
    ExpertClassifier,
    _compute_cost_usd,
    cache_key,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _isolated_cache(tmp_path, monkeypatch):
    """Redirect the cache directory to a tmp dir for each test."""
    cache_dir = tmp_path / "expert_review_cache"
    monkeypatch.setattr(ec_mod, "CACHE_DIR", cache_dir)
    yield
    if cache_dir.exists():
        shutil.rmtree(cache_dir)


def _candidate(**overrides) -> Candidate:
    base = dict(
        trksub="P21EXAMPL",
        ra_deg=120.0,
        dec_deg=-5.0,
        mean_magnitude_v=20.5,
        rate_arcsec_min=2.4,
        observatory_code="G96",
        first_obs_datetime=datetime(2026, 4, 25, 8, 0, tzinfo=UTC),
        n_observations=5,
        arc_length_minutes=18.0,
        digest2_neo_noid=85,
        ecliptic_latitude_deg=-3.0,
    )
    base.update(overrides)
    return Candidate(**base)


def _prediction(**overrides) -> Prediction:
    base = dict(
        trksub="P21EXAMPL",
        prob_neo=0.95,
        prob_pha=0.30,
        prob_neo_ci_90=(0.90, 0.99),
        map_class="NEO",
        uncertainty_entropy_bits=0.20,
        model_version="gbm-v1-isotonic",
    )
    base.update(overrides)
    return Prediction(**base)


def _opus_response(
    *,
    endorsement: str = "CONCUR",
    endorsed_class: str = "NEO",
    confidence: str = "HIGH",
    reasoning: str = "The reported on-sky rate of 2.4 arcsec/min and V mag 20.5"
    " sit comfortably within the typical NEO regime. The digest2 score of 85"
    " plus the near-ecliptic latitude support the ranker's call.",
    caveats: list[dict] | None = None,
    suggested_action: str = "queue_normal",
    input_tokens: int = 320,
    output_tokens: int = 580,
    thinking_tokens: int = 1100,
):
    """Build a fake Anthropic response compatible with the real shape."""

    class _Block:
        def __init__(self, type, input):
            self.type = type
            self.input = input

    payload = {
        "class_endorsement": endorsement,
        "endorsed_class": endorsed_class,
        "confidence_match": confidence,
        "reasoning_trace": reasoning,
        "caveats": caveats or [],
        "suggested_action": suggested_action,
    }

    return SimpleNamespace(
        content=[_Block("tool_use", payload)],
        usage=SimpleNamespace(
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            thinking_output_tokens=thinking_tokens,
        ),
    )


def _patch_create(mock_response):
    """Helper: patch AsyncAnthropic().messages.create with a coroutine."""
    return patch.object(
        ec_mod.AsyncAnthropic,
        "messages",
        create=True,
        new_callable=lambda: SimpleNamespace(create=AsyncMock(return_value=mock_response)),
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_review_returns_concur_for_high_neo(monkeypatch):
    """Mock Opus returns CONCUR; check the parsed ExpertReview round-trips."""
    candidate, prediction = _candidate(), _prediction()
    classifier = ExpertClassifier()
    classifier._client = SimpleNamespace(
        messages=SimpleNamespace(create=AsyncMock(return_value=_opus_response()))
    )
    monkeypatch.setattr(ec_mod, "cost_tracker", SimpleNamespace(record=lambda **_: 0.0))

    review = asyncio.run(classifier.review_one(candidate, prediction))

    assert isinstance(review, ExpertReview)
    assert review.trksub == candidate.trksub
    assert review.class_endorsement == "CONCUR"
    assert review.endorsed_class == "NEO"
    assert review.confidence_match == "HIGH"
    assert review.cache_hit is False
    assert review.thinking_tokens_used == 1100
    assert review.output_tokens_used == 580
    assert review.cost_usd == pytest.approx(_compute_cost_usd(320, 580), rel=1e-9)


def test_review_returns_dissent_with_caveats(monkeypatch):
    candidate = _candidate(rate_arcsec_min=0.18, mean_magnitude_v=18.4)
    prediction = _prediction(prob_neo=0.78)
    classifier = ExpertClassifier()
    classifier._client = SimpleNamespace(
        messages=SimpleNamespace(
            create=AsyncMock(
                return_value=_opus_response(
                    endorsement="DISSENT",
                    endorsed_class="UNCONFIRMED",
                    confidence="LOW",
                    reasoning="Rate of 0.18 arcsec/min for V=18.4 is anomalous.",
                    caveats=[
                        {
                            "severity": "WARN",
                            "code": "MAGNITUDE_RATE_MISMATCH",
                            "explanation": "V 18.4 + rate 0.18 arcsec/min is inconsistent.",
                        },
                        {
                            "severity": "CRITICAL",
                            "code": "BLENDED_SOURCE_RISK",
                            "explanation": "Possible blended star.",
                        },
                    ],
                    suggested_action="request_second_epoch",
                )
            )
        )
    )
    monkeypatch.setattr(ec_mod, "cost_tracker", SimpleNamespace(record=lambda **_: 0.0))

    review = asyncio.run(classifier.review_one(candidate, prediction))

    assert review.class_endorsement == "DISSENT"
    assert review.suggested_action == "request_second_epoch"
    assert len(review.caveats) == 2
    assert review.caveats[0].code == "MAGNITUDE_RATE_MISMATCH"
    assert review.caveats[1].severity == "CRITICAL"


def test_cache_hit_within_ttl(monkeypatch):
    """First call writes the cache; second call within TTL returns cache_hit=True."""
    candidate, prediction = _candidate(), _prediction()
    create_mock = AsyncMock(return_value=_opus_response())
    classifier = ExpertClassifier()
    classifier._client = SimpleNamespace(
        messages=SimpleNamespace(create=create_mock)
    )
    monkeypatch.setattr(ec_mod, "cost_tracker", SimpleNamespace(record=lambda **_: 0.0))

    first = asyncio.run(classifier.review_one(candidate, prediction))
    second = asyncio.run(classifier.review_one(candidate, prediction))

    assert first.cache_hit is False
    assert second.cache_hit is True
    assert second.class_endorsement == first.class_endorsement
    # The second call must NOT have hit the API.
    assert create_mock.call_count == 1


def test_cache_miss_after_ttl(monkeypatch):
    """Time-shift the cache file backwards by 16 minutes — second call is fresh."""
    candidate, prediction = _candidate(), _prediction()
    create_mock = AsyncMock(return_value=_opus_response())
    classifier = ExpertClassifier()
    classifier._client = SimpleNamespace(
        messages=SimpleNamespace(create=create_mock)
    )
    monkeypatch.setattr(ec_mod, "cost_tracker", SimpleNamespace(record=lambda **_: 0.0))

    asyncio.run(classifier.review_one(candidate, prediction))

    # Tamper with the cached review to age it past the TTL.
    key = cache_key(candidate, prediction)
    cache_path = ec_mod._cache_path(key)
    cached = ExpertReview.model_validate_json(cache_path.read_text())
    aged = cached.model_copy(
        update={"reviewed_at_utc": datetime.now(UTC) - timedelta(minutes=16)}
    )
    cache_path.write_text(aged.model_dump_json(indent=2))

    second = asyncio.run(classifier.review_one(candidate, prediction))
    assert second.cache_hit is False
    assert create_mock.call_count == 2


def test_score_bucket_changes_invalidate_cache(monkeypatch):
    """Same trksub but a different P(NEO) bucket → different cache key."""
    candidate = _candidate()
    create_mock = AsyncMock(return_value=_opus_response())
    classifier = ExpertClassifier()
    classifier._client = SimpleNamespace(
        messages=SimpleNamespace(create=create_mock)
    )
    monkeypatch.setattr(ec_mod, "cost_tracker", SimpleNamespace(record=lambda **_: 0.0))

    asyncio.run(classifier.review_one(candidate, _prediction(prob_neo=0.95)))
    asyncio.run(classifier.review_one(candidate, _prediction(prob_neo=0.78)))

    # Two distinct calls because the score bucket differs.
    assert create_mock.call_count == 2


def test_review_batch_parallel(monkeypatch):
    candidates = [_candidate(trksub=f"T{i:03d}") for i in range(5)]
    predictions = [_prediction(trksub=f"T{i:03d}") for i in range(5)]
    create_mock = AsyncMock(return_value=_opus_response())
    classifier = ExpertClassifier()
    classifier._client = SimpleNamespace(
        messages=SimpleNamespace(create=create_mock)
    )
    monkeypatch.setattr(ec_mod, "cost_tracker", SimpleNamespace(record=lambda **_: 0.0))

    reviews = asyncio.run(classifier.review_batch(zip(candidates, predictions)))

    assert len(reviews) == 5
    assert all(r.class_endorsement == "CONCUR" for r in reviews)
    assert create_mock.call_count == 5


def test_missing_tool_use_raises(monkeypatch):
    """If Opus returned only text blocks, raise rather than fabricating data."""
    class _Block:
        type = "text"
        text = "I will not call the tool"

    bad_response = SimpleNamespace(
        content=[_Block()],
        usage=SimpleNamespace(input_tokens=10, output_tokens=10),
    )
    classifier = ExpertClassifier()
    classifier._client = SimpleNamespace(
        messages=SimpleNamespace(create=AsyncMock(return_value=bad_response))
    )
    monkeypatch.setattr(ec_mod, "cost_tracker", SimpleNamespace(record=lambda **_: 0.0))

    with pytest.raises(ValueError, match="submit_expert_review"):
        asyncio.run(classifier.review_one(_candidate(), _prediction()))


def test_cost_computation_per_NN07():
    """Per NN-07: input $15/Mtok, output $75/Mtok. Thinking included in output."""
    cost = _compute_cost_usd(input_tokens=400, output_tokens=2000)
    expected = 400 * 15 / 1_000_000 + 2000 * 75 / 1_000_000
    assert cost == pytest.approx(expected, rel=1e-9)
