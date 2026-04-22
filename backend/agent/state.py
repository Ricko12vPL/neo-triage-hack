"""Agent state persistence — JSON-backed, NN-01 compliant (no pickle)."""
from __future__ import annotations

import json
import warnings
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

STATE_PATH = Path("data/agent_state.json")


@dataclass
class AgentState:
    prev_trksubs: set[str] = field(default_factory=set)
    last_cycle_at: datetime | None = None
    session_started_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    session_cost_usd: float = 0.0
    cycle_count: int = 0


def load_state() -> AgentState:
    if not STATE_PATH.exists():
        return AgentState()
    try:
        data = json.loads(STATE_PATH.read_text())
        return AgentState(
            prev_trksubs=set(data.get("prev_trksubs", [])),
            last_cycle_at=(
                datetime.fromisoformat(data["last_cycle_at"])
                if data.get("last_cycle_at")
                else None
            ),
            session_started_at=datetime.fromisoformat(
                data.get("session_started_at", datetime.now(UTC).isoformat())
            ),
            session_cost_usd=float(data.get("session_cost_usd", 0.0)),
            cycle_count=int(data.get("cycle_count", 0)),
        )
    except Exception:
        return AgentState()


def save_state(state: AgentState) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "prev_trksubs": sorted(state.prev_trksubs),
        "last_cycle_at": state.last_cycle_at.isoformat() if state.last_cycle_at else None,
        "session_started_at": state.session_started_at.isoformat(),
        "session_cost_usd": round(state.session_cost_usd, 6),
        "cycle_count": state.cycle_count,
    }
    STATE_PATH.write_text(json.dumps(payload, indent=2))


def reset_state() -> None:
    warnings.warn("reset_state() called — clearing agent state", stacklevel=2)
    if STATE_PATH.exists():
        STATE_PATH.unlink()
