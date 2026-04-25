"""Integration tests — agent loop runs the Opus 4.7 expert reviewer.

These tests do not hit Anthropic. Each one patches `get_expert_classifier`
with an instance whose `review_batch` is an `AsyncMock`. The goal is to
prove that:

  - the agent loop calls review_batch on the top-K
  - the WS broadcast carries the expert_review payload
  - the JSONL log records expert_review_completed events
  - failures in the expert path do not cascade into the cycle
  - the hourly $5 circuit breaker opens when cumulative cost crosses it
"""
from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.models.expert_review import ExpertReview
from backend.models.schemas import Candidate, Prediction


def _candidate(trksub: str, prob_neo_seed: float = 0.95) -> Candidate:
    return Candidate(
        trksub=trksub,
        ra_deg=120.0,
        dec_deg=-3.0,
        mean_magnitude_v=20.5,
        rate_arcsec_min=2.4,
        observatory_code="G96",
        first_obs_datetime=datetime(2026, 4, 25, 8, 0, tzinfo=UTC),
        n_observations=5,
        arc_length_minutes=18.0,
        digest2_neo_noid=85,
        ecliptic_latitude_deg=-3.0,
    )


def _review(trksub: str, *, cost_usd: float = 0.05, cache_hit: bool = False) -> ExpertReview:
    return ExpertReview(
        trksub=trksub,
        reviewed_at_utc=datetime.now(UTC),
        class_endorsement="CONCUR",
        endorsed_class="NEO",
        confidence_match="HIGH",
        reasoning_trace="The numbers check out across the board.",
        caveats=[],
        suggested_action="queue_normal",
        thinking_tokens_used=900,
        output_tokens_used=400,
        cost_usd=cost_usd,
        cache_hit=cache_hit,
    )


def _ranker_with_pred(prob_neo: float = 0.92) -> MagicMock:
    """Build a fake ranker whose predict() returns a constant Prediction."""
    pred = Prediction(
        trksub="<unknown>",
        prob_neo=prob_neo,
        prob_pha=0.30,
        prob_neo_ci_90=(0.85, 0.97),
        map_class="NEO",
        uncertainty_entropy_bits=0.20,
        model_version="gbm-v1-isotonic",
    )
    ranker = MagicMock()
    ranker.predict = MagicMock(return_value=pred)
    return ranker


async def _run_one_cycle(agent_loop_mod) -> None:
    """Helper: run the loop until it completes one cycle, then stop.

    Recreates the module-level `stop_event` because pytest-asyncio gives
    each test a fresh event loop and the bare module Event would still
    be bound to the previous loop.
    """
    agent_loop_mod.stop_event = asyncio.Event()
    t = asyncio.create_task(agent_loop_mod.agent_loop())
    await asyncio.sleep(0.25)
    agent_loop_mod.stop_event.set()
    await asyncio.wait_for(t, timeout=5.0)


@pytest.mark.asyncio
async def test_agent_cycle_calls_expert_review_for_top_k(tmp_path: Path) -> None:
    candidates = [_candidate(f"T{i:03d}") for i in range(10)]
    review_batch_mock = AsyncMock(
        return_value=[_review(f"T{i:03d}") for i in range(10)]
    )

    with (
        patch("backend.agent.state.STATE_PATH", tmp_path / "state.json"),
        patch("backend.agent.logger.LOG_PATH", tmp_path / "log.jsonl"),
    ):
        from backend.agent import loop as agent_loop_mod
        agent_loop_mod._expert_cost_window.clear()

        with (
            patch.object(agent_loop_mod, "_collect_briefing", AsyncMock(return_value=("", "", 0.0, False))),
            patch.object(agent_loop_mod, "fetch_neocp_candidates", AsyncMock(return_value=candidates)),
            patch.object(agent_loop_mod, "get_ranker", return_value=_ranker_with_pred()),
            patch.object(
                agent_loop_mod,
                "get_expert_classifier",
                return_value=SimpleNamespace(review_batch=review_batch_mock),
            ),
        ):
            await _run_one_cycle(agent_loop_mod)

    review_batch_mock.assert_awaited_once()
    args, _kwargs = review_batch_mock.await_args
    top_k_pairs = list(args[0])
    # The fixture has 10 candidates and EXPERT_TOP_K may be 20 (or anything
    # we tune later) — what matters is the slice never exceeds the cap and
    # is bounded above by the number of candidates available.
    assert len(top_k_pairs) <= agent_loop_mod.EXPERT_TOP_K
    assert len(top_k_pairs) == min(len(candidates), agent_loop_mod.EXPERT_TOP_K)


@pytest.mark.asyncio
async def test_cost_circuit_breaker_kicks_in_at_5usd(tmp_path: Path) -> None:
    candidates = [_candidate(f"T{i:03d}") for i in range(5)]
    review_batch_mock = AsyncMock()  # must NOT be awaited

    with (
        patch("backend.agent.state.STATE_PATH", tmp_path / "state.json"),
        patch("backend.agent.logger.LOG_PATH", tmp_path / "log.jsonl"),
    ):
        from backend.agent import loop as agent_loop_mod
        # Pre-seed the cost window above the cap.
        agent_loop_mod._expert_cost_window.clear()
        now = datetime.now(UTC)
        agent_loop_mod._record_expert_cost(now, 3.0)
        agent_loop_mod._record_expert_cost(now, 2.5)  # total = 5.5, > 5.0

        with (
            patch.object(agent_loop_mod, "_collect_briefing", AsyncMock(return_value=("", "", 0.0, False))),
            patch.object(agent_loop_mod, "fetch_neocp_candidates", AsyncMock(return_value=candidates)),
            patch.object(agent_loop_mod, "get_ranker", return_value=_ranker_with_pred()),
            patch.object(
                agent_loop_mod,
                "get_expert_classifier",
                return_value=SimpleNamespace(review_batch=review_batch_mock),
            ),
        ):
            await _run_one_cycle(agent_loop_mod)

    review_batch_mock.assert_not_awaited()


@pytest.mark.asyncio
async def test_cycle_continues_if_expert_fails(tmp_path: Path) -> None:
    """A raise inside review_batch must not crash the cycle."""
    candidates = [_candidate(f"T{i:03d}") for i in range(3)]
    review_batch_mock = AsyncMock(side_effect=RuntimeError("boom"))

    with (
        patch("backend.agent.state.STATE_PATH", tmp_path / "state.json"),
        patch("backend.agent.logger.LOG_PATH", tmp_path / "log.jsonl"),
    ):
        from backend.agent import loop as agent_loop_mod
        agent_loop_mod._expert_cost_window.clear()

        with (
            patch.object(agent_loop_mod, "_collect_briefing", AsyncMock(return_value=("", "br", 0.0, False))),
            patch.object(agent_loop_mod, "fetch_neocp_candidates", AsyncMock(return_value=candidates)),
            patch.object(agent_loop_mod, "get_ranker", return_value=_ranker_with_pred()),
            patch.object(
                agent_loop_mod,
                "get_expert_classifier",
                return_value=SimpleNamespace(review_batch=review_batch_mock),
            ),
        ):
            # Must not raise.
            await _run_one_cycle(agent_loop_mod)


@pytest.mark.asyncio
async def test_websocket_broadcast_includes_expert_review(tmp_path: Path) -> None:
    candidates = [_candidate(f"T{i:03d}") for i in range(3)]
    reviews = [_review(f"T{i:03d}") for i in range(3)]

    with (
        patch("backend.agent.state.STATE_PATH", tmp_path / "state.json"),
        patch("backend.agent.logger.LOG_PATH", tmp_path / "log.jsonl"),
    ):
        from backend.agent import loop as agent_loop_mod
        agent_loop_mod._expert_cost_window.clear()

        broadcast_payloads: list[dict] = []

        async def fake_broadcast(payload: dict) -> None:
            broadcast_payloads.append(payload)

        with (
            patch.object(agent_loop_mod, "_collect_briefing", AsyncMock(return_value=("", "br", 0.0, False))),
            patch.object(agent_loop_mod, "fetch_neocp_candidates", AsyncMock(return_value=candidates)),
            patch.object(agent_loop_mod, "get_ranker", return_value=_ranker_with_pred()),
            patch.object(
                agent_loop_mod,
                "get_expert_classifier",
                return_value=SimpleNamespace(review_batch=AsyncMock(return_value=reviews)),
            ),
            patch.object(agent_loop_mod.notifier, "broadcast", fake_broadcast),
        ):
            await _run_one_cycle(agent_loop_mod)

    new_candidate_events = [p for p in broadcast_payloads if p.get("type") == "new_candidate"]
    assert new_candidate_events, "no new_candidate broadcast emitted"
    for ev in new_candidate_events:
        assert "expert_review" in ev
        assert ev["expert_review"] is not None
        assert ev["expert_review"]["class_endorsement"] == "CONCUR"


@pytest.mark.asyncio
async def test_jsonl_log_includes_expert_event(tmp_path: Path) -> None:
    candidates = [_candidate(f"T{i:03d}") for i in range(2)]
    reviews = [_review(f"T{i:03d}") for i in range(2)]

    log_path = tmp_path / "log.jsonl"

    with (
        patch("backend.agent.state.STATE_PATH", tmp_path / "state.json"),
        patch("backend.agent.logger.LOG_PATH", log_path),
    ):
        from backend.agent import loop as agent_loop_mod
        agent_loop_mod._expert_cost_window.clear()

        with (
            patch.object(agent_loop_mod, "_collect_briefing", AsyncMock(return_value=("", "br", 0.0, False))),
            patch.object(agent_loop_mod, "fetch_neocp_candidates", AsyncMock(return_value=candidates)),
            patch.object(agent_loop_mod, "get_ranker", return_value=_ranker_with_pred()),
            patch.object(
                agent_loop_mod,
                "get_expert_classifier",
                return_value=SimpleNamespace(review_batch=AsyncMock(return_value=reviews)),
            ),
        ):
            await _run_one_cycle(agent_loop_mod)

    assert log_path.exists()
    entries = [json.loads(ln) for ln in log_path.read_text().splitlines() if ln.strip()]
    assert entries, "no agent_log.jsonl entries"
    cycle_entry = entries[-1]
    assert "expert_reviews" in cycle_entry
    expert_events = cycle_entry["expert_reviews"]
    assert any(e.get("event") == "expert_review_completed" for e in expert_events), \
        f"expected expert_review_completed in {expert_events}"
