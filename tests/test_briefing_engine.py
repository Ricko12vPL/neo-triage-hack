"""Unit tests for the Opus 4.7 briefing engine with a mocked Anthropic SDK.

These tests must NOT hit the real API. The real API smoke test is a
manual, documented, one-shot check in the Day 1 sign-off — see
`tests/fixtures/briefing_request_yr4.json` and the smoke-test command
in `README.md` once added.
"""
from __future__ import annotations

from datetime import UTC
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from backend.models.schemas import BriefingChunk, BriefingRequest, Candidate
from backend.services import briefing_engine, claude_cache, cost_tracker

# ---------------------------------------------------------------------
# Fake Anthropic SDK
# ---------------------------------------------------------------------


def _make_thinking_delta(text: str) -> SimpleNamespace:
    return SimpleNamespace(
        type="content_block_delta",
        delta=SimpleNamespace(type="thinking_delta", thinking=text),
    )


def _make_text_delta(text: str) -> SimpleNamespace:
    return SimpleNamespace(
        type="content_block_delta",
        delta=SimpleNamespace(type="text_delta", text=text),
    )


def _make_final_message(
    input_tokens: int, output_tokens: int, thinking_tokens: int
) -> SimpleNamespace:
    return SimpleNamespace(
        usage=SimpleNamespace(
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            thinking_tokens=thinking_tokens,
        )
    )


class FakeStreamContext:
    def __init__(self, events: list[SimpleNamespace], final: SimpleNamespace) -> None:
        self._events = events
        self._final = final

    async def __aenter__(self) -> FakeStreamContext:
        return self

    async def __aexit__(self, *args: Any) -> None:
        return None

    def __aiter__(self) -> Any:
        async def _gen() -> Any:
            for event in self._events:
                yield event

        return _gen()

    async def get_final_message(self) -> SimpleNamespace:
        return self._final


class FakeMessages:
    def __init__(
        self,
        events: list[SimpleNamespace],
        final: SimpleNamespace,
        calls: list[dict[str, Any]],
    ) -> None:
        self._events = events
        self._final = final
        self._calls = calls

    def stream(self, **kwargs: Any) -> FakeStreamContext:
        self._calls.append(kwargs)
        return FakeStreamContext(self._events, self._final)


class FakeAnthropic:
    def __init__(self, events: list[SimpleNamespace], final: SimpleNamespace) -> None:
        self.call_history: list[dict[str, Any]] = []
        self.messages = FakeMessages(events, final, self.call_history)


# ---------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------


@pytest.fixture
def sample_candidate() -> Candidate:
    from datetime import datetime

    return Candidate(
        trksub="P21YR4A",
        ra_deg=88.527,
        dec_deg=2.143,
        mean_magnitude=19.5,
        rate_arcsec_min=2.8,
        observatory_code="W68",
        first_obs_datetime=datetime(2026, 4, 21, 22, 30, tzinfo=UTC),
        n_observations=4,
        arc_length_minutes=15.0,
        digest2_neo_noid=98,
        ecliptic_latitude_deg=0.5,
    )


@pytest.fixture
def sample_request(sample_candidate: Candidate) -> BriefingRequest:
    return BriefingRequest(
        candidate=sample_candidate,
        cross_survey_context="ATLAS covered 6h ago to V=19.7, no detection.",
        include_reasoning=True,
    )


@pytest.fixture
def fake_client() -> FakeAnthropic:
    events = [
        _make_thinking_delta("Checking magnitude budget. "),
        _make_thinking_delta("Rate is fast for MBA. "),
        _make_thinking_delta("ATLAS non-detection is informative."),
        _make_text_delta("Worth tonight's time. "),
        _make_text_delta("V=19.5 at 2.8 arcsec/min is NEO-like, "),
        _make_text_delta("and ATLAS non-detection confirms it."),
    ]
    # Modern Anthropic SDK: output_tokens includes thinking tokens for billing.
    # So if text is ~180 tokens and thinking is 540, output_tokens ≈ 720.
    final = _make_final_message(input_tokens=420, output_tokens=720, thinking_tokens=540)
    return FakeAnthropic(events, final)


@pytest.fixture(autouse=True)
def isolate_state(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Each test gets its own cost ledger and claude cache directory."""
    monkeypatch.setattr(cost_tracker, "LEDGER_PATH", tmp_path / "cost_ledger.json")
    monkeypatch.setattr(claude_cache, "CACHE_DIR", tmp_path / "claude_cache")


# ---------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------


def test_build_prompt_contains_all_fields(sample_request: BriefingRequest) -> None:
    system, user = briefing_engine.build_prompt(sample_request)
    assert "veteran follow-up astronomer" in system
    assert "P21YR4A" in user
    assert "88.527" in user
    assert "+2.143" in user
    assert "98" in user  # digest2 score
    assert "2.80" in user  # rate
    assert "ATLAS" in user  # cross-survey context propagated


def test_build_prompt_deterministic(sample_request: BriefingRequest) -> None:
    a = briefing_engine.build_prompt(sample_request)
    b = briefing_engine.build_prompt(sample_request)
    assert a == b


def test_build_prompt_no_reasoning(sample_candidate: Candidate) -> None:
    req = BriefingRequest(candidate=sample_candidate, include_reasoning=False)
    system, user = briefing_engine.build_prompt(req)
    assert "P21YR4A" in user
    assert "veteran" in system  # persona still present


async def test_stream_briefing_yields_thinking_before_text(
    sample_request: BriefingRequest, fake_client: FakeAnthropic
) -> None:
    chunks: list[BriefingChunk] = []
    async for chunk in briefing_engine.stream_briefing(
        sample_request, client=fake_client  # type: ignore[arg-type]
    ):
        chunks.append(chunk)

    types_seen = [c.type for c in chunks]
    first_text = types_seen.index("text")
    last_thinking = len(types_seen) - 1 - types_seen[::-1].index("thinking")
    assert last_thinking < first_text, "all thinking should come before text"
    assert types_seen[-1] == "done"


async def test_stream_briefing_records_cost(
    sample_request: BriefingRequest, fake_client: FakeAnthropic
) -> None:
    async for _ in briefing_engine.stream_briefing(
        sample_request, client=fake_client  # type: ignore[arg-type]
    ):
        pass
    ledger = cost_tracker.summary()
    assert ledger.n_calls == 1
    assert ledger.total_input_tokens == 420
    assert ledger.total_output_tokens == 720
    assert ledger.total_thinking_tokens == 540
    # Cost = 420*15e-6 + 720*75e-6 = 0.0063 + 0.054 = 0.0603
    assert abs(ledger.total_cost_usd - 0.0603) < 1e-4


async def test_stream_briefing_caches_response(
    sample_request: BriefingRequest, fake_client: FakeAnthropic
) -> None:
    async for _ in briefing_engine.stream_briefing(
        sample_request, client=fake_client  # type: ignore[arg-type]
    ):
        pass
    n_calls_after_first = len(fake_client.call_history)
    first_cost = cost_tracker.summary().total_cost_usd

    # Second call with identical request must hit cache.
    last_chunk: BriefingChunk | None = None
    async for chunk in briefing_engine.stream_briefing(
        sample_request, client=fake_client  # type: ignore[arg-type]
    ):
        last_chunk = chunk

    assert len(fake_client.call_history) == n_calls_after_first, "no new API calls"
    assert cost_tracker.summary().total_cost_usd == first_cost, "no new spend"
    assert last_chunk is not None
    assert last_chunk.type == "done"
    assert last_chunk.content == "cache_hit"


async def test_generate_briefing_aggregates(
    sample_request: BriefingRequest, fake_client: FakeAnthropic
) -> None:
    response = await briefing_engine.generate_briefing(
        sample_request, client=fake_client  # type: ignore[arg-type]
    )
    assert response.trksub == "P21YR4A"
    assert "Worth tonight's time" in response.briefing_markdown
    assert response.reasoning_trace is not None
    assert "magnitude" in response.reasoning_trace.lower()
    assert response.input_tokens == 420
    assert response.output_tokens == 720
    assert response.thinking_tokens == 540


async def test_stream_yields_done_on_completion(
    sample_request: BriefingRequest, fake_client: FakeAnthropic
) -> None:
    last_chunk: BriefingChunk | None = None
    async for chunk in briefing_engine.stream_briefing(
        sample_request, client=fake_client  # type: ignore[arg-type]
    ):
        last_chunk = chunk
    assert last_chunk is not None
    assert last_chunk.type == "done"
    assert last_chunk.cumulative_cost_usd is not None
    assert last_chunk.cumulative_cost_usd > 0


def test_pricing_constants_match_anthropic_docs() -> None:
    """Verify $15/Mtok input + $75/Mtok output per PLAN.md NN-07."""
    assert cost_tracker.INPUT_COST_PER_MTOK_USD == 15.0
    assert cost_tracker.OUTPUT_COST_PER_MTOK_USD == 75.0


def test_cache_roundtrip_persists_response(sample_request: BriefingRequest) -> None:
    """Write a response, read it back, verify cache_hit flips to True."""
    from datetime import datetime

    from backend.models.schemas import BriefingResponse

    system, user = briefing_engine.build_prompt(sample_request)
    key = claude_cache.key_for(
        model="claude-opus-4-7", system=system, user=user, thinking_effort="high"
    )
    fresh = BriefingResponse(
        trksub="P21YR4A",
        briefing_markdown="Worth tonight.",
        reasoning_trace="Checked magnitude.",
        model_version="claude-opus-4-7",
        input_tokens=420,
        output_tokens=720,
        thinking_tokens=540,
        cost_usd=0.0603,
        generated_at=datetime.now(UTC),
        cache_hit=False,
    )
    claude_cache.put(key, fresh)

    read_back = claude_cache.get(key)
    assert read_back is not None
    assert read_back.briefing_markdown == "Worth tonight."
    assert read_back.cache_hit is True


def test_cache_miss_returns_none() -> None:
    assert claude_cache.get("nonexistent-key-12345") is None
