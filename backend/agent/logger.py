"""Append-only JSONL decision log — one line per agent cycle.

Judges read this to verify 24h+ continuous operation and the decision
trail that qualifies for the Best Managed Agents bonus prize.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

LOG_PATH = Path("data/agent_log.jsonl")


def log_cycle(entry: dict[str, Any]) -> None:
    """Atomically append one JSON line to the log."""
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with LOG_PATH.open("a") as f:
        f.write(json.dumps(entry, default=str) + "\n")


def read_recent(n: int = 50) -> list[dict[str, Any]]:
    """Return the last `n` log entries (most recent last)."""
    if not LOG_PATH.exists():
        return []
    lines = LOG_PATH.read_text().strip().splitlines()
    return [json.loads(ln) for ln in lines[-n:] if ln.strip()]
