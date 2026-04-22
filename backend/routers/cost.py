"""Expose current Opus 4.7 spend for the dashboard cost meter."""
from fastapi import APIRouter

from backend.models.schemas import CostSummary
from backend.services import cost_tracker

router = APIRouter(prefix="/api/cost", tags=["cost"])


@router.get("/", response_model=CostSummary)
async def get_cost_summary() -> CostSummary:
    """Return aggregate spend stats for the frontend cost meter badge."""
    ledger = cost_tracker.summary()
    return CostSummary(
        total_spent_usd=round(ledger.total_cost_usd, 4),
        n_calls=ledger.n_calls,
        budget_remaining_usd=round(cost_tracker.remaining(), 2),
        total_input_tokens=ledger.total_input_tokens,
        total_output_tokens=ledger.total_output_tokens,
        total_thinking_tokens=ledger.total_thinking_tokens,
        last_call_at=ledger.last_call_at,
    )
