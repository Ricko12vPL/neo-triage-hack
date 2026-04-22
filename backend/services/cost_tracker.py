"""Persistent Opus 4.7 spend tracker.

The ledger lives on disk as JSON (never pickle — NN-01). A single in-process
lock guards the read-modify-write cycle. `output_tokens` is what Anthropic
bills at the output rate; `thinking_tokens` is tracked separately as a
metadata breakdown only — Anthropic's `output_tokens` already includes them.
"""
from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from threading import Lock

from pydantic import BaseModel, Field

LEDGER_PATH = Path("data/cost_ledger.json")

INPUT_COST_PER_MTOK_USD = 15.0
OUTPUT_COST_PER_MTOK_USD = 75.0
DEFAULT_BUDGET_USD = 500.0

_lock = Lock()


class CostLedger(BaseModel):
    """Persisted spend state for the Opus 4.7 budget."""

    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_thinking_tokens: int = 0
    total_cost_usd: float = 0.0
    n_calls: int = 0
    budget_usd: float = Field(default=DEFAULT_BUDGET_USD)
    last_updated: str | None = None
    last_call_at: str | None = None


def _load() -> CostLedger:
    if not LEDGER_PATH.exists():
        return CostLedger()
    with LEDGER_PATH.open() as f:
        return CostLedger.model_validate_json(f.read())


def _save(ledger: CostLedger) -> None:
    LEDGER_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = LEDGER_PATH.with_suffix(".tmp")
    with tmp.open("w") as f:
        f.write(ledger.model_dump_json(indent=2))
    tmp.replace(LEDGER_PATH)


def _calculate_cost(input_tokens: int, output_tokens: int) -> float:
    input_cost = input_tokens * INPUT_COST_PER_MTOK_USD / 1_000_000
    output_cost = output_tokens * OUTPUT_COST_PER_MTOK_USD / 1_000_000
    return input_cost + output_cost


def record(
    input_tokens: int,
    output_tokens: int,
    thinking_tokens: int = 0,
) -> float:
    """Record a Claude API call and return the new cumulative spend (USD).

    `thinking_tokens` is stored as metadata only — Anthropic's
    `output_tokens` already includes them for billing.
    """
    with _lock:
        ledger = _load()
        ledger.total_input_tokens += input_tokens
        ledger.total_output_tokens += output_tokens
        ledger.total_thinking_tokens += thinking_tokens
        cost = _calculate_cost(input_tokens, output_tokens)
        ledger.total_cost_usd = round(ledger.total_cost_usd + cost, 6)
        ledger.n_calls += 1
        now = datetime.now(UTC).isoformat()
        ledger.last_updated = now
        ledger.last_call_at = now
        _save(ledger)
        return ledger.total_cost_usd


def remaining() -> float:
    ledger = _load()
    return max(0.0, ledger.budget_usd - ledger.total_cost_usd)


def summary() -> CostLedger:
    return _load()
