"""Unit tests for the Managed Agent modules."""
from __future__ import annotations

import asyncio
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import WebSocket

# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------

def test_state_load_missing_file(tmp_path: Path) -> None:
    with patch("backend.agent.state.STATE_PATH", tmp_path / "agent_state.json"):
        from backend.agent.state import load_state
        state = load_state()
        assert state.cycle_count == 0
        assert state.session_cost_usd == 0.0
        assert state.prev_trksubs == set()


def test_state_save_load_roundtrip(tmp_path: Path) -> None:
    with patch("backend.agent.state.STATE_PATH", tmp_path / "agent_state.json"):
        from datetime import UTC, datetime

        from backend.agent.state import AgentState, load_state, save_state

        s = AgentState(
            prev_trksubs={"A001", "B002"},
            session_cost_usd=0.42,
            cycle_count=7,
            last_cycle_at=datetime.now(UTC),
        )
        save_state(s)
        loaded = load_state()
        assert loaded.prev_trksubs == {"A001", "B002"}
        assert loaded.session_cost_usd == 0.42
        assert loaded.cycle_count == 7
        assert loaded.last_cycle_at is not None


def test_state_handles_corrupt_file(tmp_path: Path) -> None:
    state_file = tmp_path / "agent_state.json"
    state_file.write_text("not valid json{{{")
    with patch("backend.agent.state.STATE_PATH", state_file):
        from backend.agent.state import load_state
        state = load_state()
        assert state.cycle_count == 0  # graceful fallback


# ---------------------------------------------------------------------------
# Notifier
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_notifier_broadcast_no_connections() -> None:
    """broadcast() with zero connections must not raise."""
    from backend.agent import notifier
    notifier._connections.clear()
    await notifier.broadcast({"type": "test"})  # no exception


@pytest.mark.asyncio
async def test_notifier_removes_stale_connection() -> None:
    """A broken WebSocket is unregistered after failed send."""
    from backend.agent import notifier

    bad_ws = MagicMock(spec=WebSocket)
    bad_ws.send_text = AsyncMock(side_effect=RuntimeError("closed"))

    notifier._connections.clear()
    notifier.register(bad_ws)
    assert notifier.connection_count() == 1

    await notifier.broadcast({"type": "test"})
    assert notifier.connection_count() == 0


@pytest.mark.asyncio
async def test_notifier_register_unregister() -> None:
    from backend.agent import notifier

    ws = MagicMock(spec=WebSocket)
    notifier._connections.clear()
    notifier.register(ws)
    assert notifier.connection_count() == 1
    notifier.unregister(ws)
    assert notifier.connection_count() == 0


# ---------------------------------------------------------------------------
# Logger
# ---------------------------------------------------------------------------

def test_logger_append_only(tmp_path: Path) -> None:
    with patch("backend.agent.logger.LOG_PATH", tmp_path / "agent_log.jsonl"):
        from backend.agent.logger import log_cycle, read_recent

        log_cycle({"cycle": 1, "x": "a"})
        log_cycle({"cycle": 2, "x": "b"})

        entries = read_recent()
        assert len(entries) == 2
        assert entries[0]["cycle"] == 1
        assert entries[1]["cycle"] == 2


def test_logger_read_recent_limit(tmp_path: Path) -> None:
    with patch("backend.agent.logger.LOG_PATH", tmp_path / "agent_log.jsonl"):
        from backend.agent.logger import log_cycle, read_recent

        for i in range(10):
            log_cycle({"cycle": i})

        entries = read_recent(n=3)
        assert len(entries) == 3
        assert entries[-1]["cycle"] == 9


def test_logger_empty_file(tmp_path: Path) -> None:
    with patch("backend.agent.logger.LOG_PATH", tmp_path / "missing.jsonl"):
        from backend.agent.logger import read_recent
        assert read_recent() == []


# ---------------------------------------------------------------------------
# Mock feed
# ---------------------------------------------------------------------------

def test_mock_feed_cycle1_excludes_yr4() -> None:
    from backend.agent.mock_feed import get_cycle_candidates
    candidates = get_cycle_candidates(1)
    trksubs = {c.trksub for c in candidates}
    assert "P21YR4A" not in trksubs


def test_mock_feed_cycle2_excludes_yr4() -> None:
    from backend.agent.mock_feed import get_cycle_candidates
    candidates = get_cycle_candidates(2)
    trksubs = {c.trksub for c in candidates}
    assert "P21YR4A" not in trksubs


def test_mock_feed_cycle3_includes_yr4() -> None:
    """Demo-critical: hazardous analog appears exactly at cycle 3."""
    from backend.agent.mock_feed import get_cycle_candidates
    candidates = get_cycle_candidates(3)
    trksubs = {c.trksub for c in candidates}
    assert "P21YR4A" in trksubs


def test_mock_feed_deterministic() -> None:
    """Same cycle → same result every call."""
    from backend.agent.mock_feed import get_cycle_candidates
    assert get_cycle_candidates(3) == get_cycle_candidates(3)
    assert get_cycle_candidates(1) == get_cycle_candidates(1)


# ---------------------------------------------------------------------------
# Cost cap
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_cost_cap_stops_briefings(tmp_path: Path) -> None:
    """Agent loop skips Claude calls once session_cost_usd >= COST_CAP_USD."""

    with (
        patch("backend.agent.state.STATE_PATH", tmp_path / "state.json"),
        patch("backend.agent.logger.LOG_PATH", tmp_path / "log.jsonl"),
    ):
        from backend.agent import loop as agent_loop_mod
        from backend.agent.state import AgentState, save_state

        # Pre-seed state with cost at cap
        s = AgentState(session_cost_usd=agent_loop_mod.COST_CAP_USD)
        save_state(s)

        call_count = 0

        async def mock_collect(*_args, **_kwargs):
            nonlocal call_count
            call_count += 1
            return "", "briefing", 0.001, False

        agent_loop_mod.stop_event.clear()

        with (
            patch.object(agent_loop_mod, "_collect_briefing", mock_collect),
            patch.object(agent_loop_mod, "fetch_neocp_candidates", new=AsyncMock(return_value=[])),
            patch.object(agent_loop_mod, "get_ranker", return_value=MagicMock()),
        ):
            # Run exactly 1 cycle then stop
            async def run_one():
                t = asyncio.create_task(agent_loop_mod.agent_loop())
                await asyncio.sleep(0.1)
                agent_loop_mod.stop_event.set()
                await t

            await asyncio.wait_for(run_one(), timeout=5.0)

        assert call_count == 0, "No briefings should be generated when at cost cap"
