"""Unit tests for the Opus 4.7 briefing engine with a mocked Anthropic SDK.

These tests must NOT hit the real API. The real API smoke test is a
manual, documented, one-shot check in the Day 1 sign-off — see
`tests/fixtures/briefing_request_yr4.json` and the smoke-test command
in `README.md`.
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
    # Opus 4.7 adaptive mode returns the structured output as text_delta
    # events. We simulate a stream that produces the ## Reasoning and
    # ## Briefing sections chunk-by-chunk, with the marker appearing
    # mid-stream so the engine must flip routing from reasoning to text.
    events = [
        _make_text_delta("## Reasoning\n"),
        _make_text_delta("V=19.5 at 2.8 arcsec/min is NEO-like rate. "),
        _make_text_delta("ATLAS non-detection 6h ago to V=19.7 is informative. "),
        _make_text_delta("Digest2 98 pushes this toward real.\n\n"),
        _make_text_delta("## Briefing\n"),
        _make_text_delta("Worth tonight's time. "),
        _make_text_delta("Fast mover at V=19.5 with ATLAS non-detection "),
        _make_text_delta("is the NEO signature. Recommend observe now."),
    ]
    # Adaptive mode: thinking_tokens can be zero; output_tokens counts emitted text only.
    final = _make_final_message(input_tokens=420, output_tokens=720, thinking_tokens=0)
    return FakeAnthropic(events, final)


@pytest.fixture
def fake_client_with_thinking_deltas() -> FakeAnthropic:
    # Legacy path: some API shapes still emit thinking_delta events. Make
    # sure the engine routes those to the reasoning channel.
    events = [
        _make_thinking_delta("Checking magnitude budget. "),
        _make_thinking_delta("Rate is fast for MBA."),
        _make_text_delta("## Reasoning\n"),
        _make_text_delta("See thinking above.\n\n"),
        _make_text_delta("## Briefing\n"),
        _make_text_delta("Worth tonight."),
    ]
    final = _make_final_message(input_tokens=420, output_tokens=720, thinking_tokens=540)
    return FakeAnthropic(events, final)


@pytest.fixture(autouse=True)
def isolate_state(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Each test gets its own cost ledger and claude cache directory."""
    monkeypatch.setattr(cost_tracker, "LEDGER_PATH", tmp_path / "cost_ledger.json")
    monkeypatch.setattr(claude_cache, "CACHE_DIR", tmp_path / "claude_cache")


# ---------------------------------------------------------------------
# Tests — prompt building
# ---------------------------------------------------------------------


def test_build_prompt_contains_all_fields(sample_request: BriefingRequest) -> None:
    system, user = briefing_engine.build_prompt(sample_request)
    assert "veteran follow-up astronomer" in system
    assert "## Reasoning" in system, "system prompt must require ## Reasoning header"
    assert "## Briefing" in system, "system prompt must require ## Briefing header"
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


# ---------------------------------------------------------------------
# Tests — split_reasoning_briefing
# ---------------------------------------------------------------------


def test_split_reasoning_briefing_parses_both_sections() -> None:
    text = (
        "## Reasoning\n"
        "V=19.5 at 2.8 arcsec/min is NEO-like. ATLAS non-detection is informative.\n\n"
        "## Briefing\n"
        "Worth tonight. Fast mover with consistent non-detection. Observe now."
    )
    reasoning, briefing = briefing_engine.split_reasoning_briefing(text)
    assert "V=19.5 at 2.8 arcsec/min is NEO-like" in reasoning
    assert "ATLAS non-detection" in reasoning
    assert "## Reasoning" not in reasoning
    assert "## Briefing" not in briefing
    assert "Worth tonight" in briefing
    assert "Observe now" in briefing


def test_split_reasoning_briefing_handles_missing_markers() -> None:
    text = "Worth tonight. Fast mover at V=19.5, observe now."
    reasoning, briefing = briefing_engine.split_reasoning_briefing(text)
    assert reasoning == ""
    assert briefing == text


def test_split_reasoning_briefing_handles_empty() -> None:
    assert briefing_engine.split_reasoning_briefing("") == ("", "")


def test_split_reasoning_briefing_preserves_markdown() -> None:
    text = (
        "## Reasoning\n"
        "- Point one\n- Point two\n\n"
        "## Briefing\n"
        "**Bold** and _italic_ preserved. Bullet:\n- alpha\n- beta"
    )
    reasoning, briefing = briefing_engine.split_reasoning_briefing(text)
    assert "- Point one" in reasoning
    assert "**Bold**" in briefing
    assert "- alpha" in briefing


# ---------------------------------------------------------------------
# Tests — streaming routing
# ---------------------------------------------------------------------


async def test_stream_emits_reasoning_before_text(
    sample_request: BriefingRequest, fake_client: FakeAnthropic
) -> None:
    chunks: list[BriefingChunk] = []
    async for chunk in briefing_engine.stream_briefing(
        sample_request, client=fake_client  # type: ignore[arg-type]
    ):
        chunks.append(chunk)

    types_seen = [c.type for c in chunks]
    assert "reasoning" in types_seen, "must emit at least one reasoning chunk"
    assert "text" in types_seen, "must emit at least one text chunk"

    first_text = types_seen.index("text")
    last_reasoning = len(types_seen) - 1 - types_seen[::-1].index("reasoning")
    assert last_reasoning < first_text, "all reasoning must come before any text"
    assert types_seen[-1] == "done"


async def test_stream_briefing_marker_not_leaked_to_either_channel(
    sample_request: BriefingRequest, fake_client: FakeAnthropic
) -> None:
    """The ## Briefing control token must not appear in streamed chunks."""
    reasoning_chunks: list[str] = []
    text_chunks: list[str] = []
    async for chunk in briefing_engine.stream_briefing(
        sample_request, client=fake_client  # type: ignore[arg-type]
    ):
        if chunk.type == "reasoning":
            reasoning_chunks.append(chunk.content)
        elif chunk.type == "text":
            text_chunks.append(chunk.content)

    reasoning_text = "".join(reasoning_chunks)
    briefing_text = "".join(text_chunks)
    assert "## Briefing" not in reasoning_text
    assert "## Briefing" not in briefing_text


async def test_stream_thinking_delta_routed_to_reasoning_channel(
    sample_request: BriefingRequest,
    fake_client_with_thinking_deltas: FakeAnthropic,
) -> None:
    chunks: list[BriefingChunk] = []
    async for chunk in briefing_engine.stream_briefing(
        sample_request,
        client=fake_client_with_thinking_deltas,  # type: ignore[arg-type]
    ):
        chunks.append(chunk)

    types_seen = [c.type for c in chunks]
    # thinking_delta path emits reasoning chunks
    assert types_seen[0] == "reasoning"
    # no "thinking" chunks should leak through — legacy path now routes to
    # reasoning too
    assert "thinking" not in types_seen


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
    assert ledger.total_thinking_tokens == 0
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


async def test_cached_response_replays_reasoning_and_text(
    sample_request: BriefingRequest, fake_client: FakeAnthropic
) -> None:
    """Cache replay must preserve the reasoning + text split."""
    async for _ in briefing_engine.stream_briefing(
        sample_request, client=fake_client  # type: ignore[arg-type]
    ):
        pass

    chunks: list[BriefingChunk] = []
    async for chunk in briefing_engine.stream_briefing(
        sample_request, client=fake_client  # type: ignore[arg-type]
    ):
        chunks.append(chunk)

    types_seen = [c.type for c in chunks]
    assert "reasoning" in types_seen
    assert "text" in types_seen
    assert types_seen[-1] == "done"
    assert chunks[-1].content == "cache_hit"


async def test_generate_briefing_aggregates(
    sample_request: BriefingRequest, fake_client: FakeAnthropic
) -> None:
    response = await briefing_engine.generate_briefing(
        sample_request, client=fake_client  # type: ignore[arg-type]
    )
    assert response.trksub == "P21YR4A"
    assert "Worth tonight's time" in response.briefing_markdown
    assert "observe now" in response.briefing_markdown.lower()
    assert "V=19.5" in response.reasoning_markdown
    assert "ATLAS non-detection" in response.reasoning_markdown
    assert "## Reasoning" not in response.briefing_markdown
    assert "## Briefing" not in response.reasoning_markdown
    assert response.input_tokens == 420
    assert response.output_tokens == 720


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
        reasoning_markdown="Checked magnitude.",
        reasoning_trace=None,
        model_version="claude-opus-4-7",
        input_tokens=420,
        output_tokens=720,
        thinking_tokens=0,
        cost_usd=0.0603,
        generated_at=datetime.now(UTC),
        cache_hit=False,
    )
    claude_cache.put(key, fresh)

    read_back = claude_cache.get(key)
    assert read_back is not None
    assert read_back.briefing_markdown == "Worth tonight."
    assert read_back.reasoning_markdown == "Checked magnitude."
    assert read_back.cache_hit is True


def test_cache_miss_returns_none() -> None:
    assert claude_cache.get("nonexistent-key-12345") is None
