"""Managed Agent main loop.

Runs as a background asyncio task inside the FastAPI lifespan context.
Every CYCLE_INTERVAL_SECONDS it:

  1. Fetches live candidates from MPC NEOCP (15-min cache; falls back to mock)
  2. Ranks each via the Bayesian GBM ranker
  3. Compares against previous-cycle state to detect new objects
  4. Runs the Opus 4.7 expert reviewer over the top-K (hybrid classifier)
  5. Generates Opus 4.7 briefings for new top-3 (cost-capped)
  6. Broadcasts WS events to all connected dashboards
  7. Appends a structured entry to data/agent_log.jsonl

Error resilience: any exception in a single cycle is caught, logged,
and triggers exponential backoff (60s → 300s → 900s) before the next
attempt. The loop never propagates exceptions to the FastAPI process.
"""
from __future__ import annotations

import asyncio
import contextlib
import logging
import time
from collections import deque
from datetime import UTC, datetime, timedelta
from typing import Any

from backend.agent import logger as agent_logger
from backend.agent import notifier
from backend.agent.state import load_state, save_state
from backend.data.neocp_fetcher import fetch_neocp_candidates
from backend.models.expert_review import ExpertReview
from backend.models.schemas import BriefingRequest, Candidate, Prediction
from backend.services import cost_tracker
from backend.services.briefing_engine import stream_briefing
from backend.services.expert_classifier import get_expert_classifier
from backend.services.ranker import get_ranker

_log = logging.getLogger(__name__)

CYCLE_INTERVAL_SECONDS = 300        # 5 minutes — MPC rarely updates faster (was 120; halves cycles/h)
COST_CAP_USD = 25.0                 # stop Claude calls above this; loop continues
MAX_BRIEFINGS_PER_CYCLE = 3         # cost control: max Opus calls per cycle
EXPERT_TOP_K = 5                    # top-by-P(NEO) reviewed each cycle (was 20; most low-P(NEO) rows are MBA noise)
EXPERT_PROB_NEO_FLOOR = 0.3         # skip expert review when ranker already classes the row as MBA-noise
EXPERT_HOURLY_COST_CAP_USD = 5.0    # hourly circuit breaker on expert review spend
BACKOFF_STEPS_SECONDS = [60, 300, 900]  # exponential backoff on consecutive errors

stop_event = asyncio.Event()


# Sliding 1-hour window of (timestamp, cost_usd) for the expert reviewer.
# Used by `_expert_cost_window_total_usd` to gate runs when spend gets hot.
_expert_cost_window: deque[tuple[datetime, float]] = deque()


def _expert_cost_window_total_usd(now: datetime | None = None) -> float:
    """Return the total cost recorded in the last 1 hour.

    Mutates the deque to evict entries older than 1 h. Idempotent for callers
    — calling it twice in succession returns the same value (no double-evict).
    """
    now = now or datetime.now(UTC)
    cutoff = now - timedelta(hours=1)
    while _expert_cost_window and _expert_cost_window[0][0] < cutoff:
        _expert_cost_window.popleft()
    return sum(c for _, c in _expert_cost_window)


def _record_expert_cost(timestamp: datetime, cost_usd: float) -> None:
    _expert_cost_window.append((timestamp, cost_usd))


async def _collect_briefing(
    candidate: Candidate,
    prediction: Prediction,
    cost_before_usd: float,
) -> tuple[str, str, float, bool]:
    """Drain stream_briefing; return (reasoning, briefing, delta_cost_usd, cache_hit)."""
    request = BriefingRequest(
        candidate=candidate,
        prediction=prediction,
        include_reasoning=True,
    )
    reasoning_parts: list[str] = []
    briefing_parts: list[str] = []
    cache_hit = False

    async for chunk in stream_briefing(request):
        if chunk.type == "reasoning":
            reasoning_parts.append(chunk.content)
        elif chunk.type == "text":
            briefing_parts.append(chunk.content)
        elif chunk.type == "done":
            cache_hit = chunk.content == "cache_hit"

    cost_after = cost_tracker.summary().total_cost_usd
    delta = round(cost_after - cost_before_usd, 6)
    return "".join(reasoning_parts), "".join(briefing_parts), delta, cache_hit


async def agent_loop() -> None:
    """Run the Managed Agent loop until stop_event is set."""
    _log.info("Managed Agent starting.")
    consecutive_errors = 0

    while not stop_event.is_set():
        cycle_wall_start = time.monotonic()
        state = load_state()
        state.cycle_count += 1
        cycle = state.cycle_count
        cycle_ts = datetime.now(UTC).isoformat()

        try:
            candidates = await fetch_neocp_candidates(limit=20)
            ranker = get_ranker()
            ranked: list[tuple[Candidate, Prediction]] = []
            for c in candidates:
                pred = ranker.predict(c)
                pred = pred.model_copy(update={"trksub": c.trksub})
                ranked.append((c, pred))
            ranked.sort(key=lambda pair: pair[1].prob_neo, reverse=True)

            current_trksubs = {c.trksub for c, _ in ranked}
            new_pairs = [
                (c, p) for c, p in ranked if c.trksub not in state.prev_trksubs
            ]

            # ----- Expert review (Opus 4.7 hybrid classifier) -----
            expert_reviews: dict[str, ExpertReview] = {}
            expert_log_entries: list[dict[str, Any]] = []
            cost_window_total = _expert_cost_window_total_usd()
            if cost_window_total >= EXPERT_HOURLY_COST_CAP_USD:
                _log.warning(
                    "expert review circuit breaker open ($%.2f in last hour) — skipping",
                    cost_window_total,
                )
                expert_log_entries.append(
                    {
                        "event": "expert_circuit_breaker_open",
                        "hourly_cost_usd": round(cost_window_total, 4),
                        "cap_usd": EXPERT_HOURLY_COST_CAP_USD,
                        "timestamp_utc": cycle_ts,
                    }
                )
            else:
                top_k_pairs = [
                    (cand, pred)
                    for (cand, pred) in ranked[:EXPERT_TOP_K]
                    if (pred.prob_neo or 0.0) >= EXPERT_PROB_NEO_FLOOR
                ]
                if top_k_pairs:
                    try:
                        classifier = get_expert_classifier()
                        reviews = await classifier.review_batch(top_k_pairs)
                        for review in reviews:
                            expert_reviews[review.trksub] = review
                            if not review.cache_hit:
                                _record_expert_cost(
                                    review.reviewed_at_utc, review.cost_usd
                                )
                            expert_log_entries.append(
                                {
                                    "event": "expert_review_completed",
                                    "trksub": review.trksub,
                                    "class_endorsement": review.class_endorsement,
                                    "endorsed_class": review.endorsed_class,
                                    "confidence_match": review.confidence_match,
                                    "suggested_action": review.suggested_action,
                                    "n_caveats": len(review.caveats),
                                    "thinking_tokens": review.thinking_tokens_used,
                                    "cost_usd": round(review.cost_usd, 6),
                                    "cache_hit": review.cache_hit,
                                    "timestamp_utc": review.reviewed_at_utc.isoformat(),
                                }
                            )
                    except Exception as exc:  # noqa: BLE001 — expert path is non-essential
                        _log.warning(
                            "expert review batch failed in cycle %d: %s", cycle, exc
                        )
                        expert_log_entries.append(
                            {
                                "event": "expert_review_error",
                                "error": f"{type(exc).__name__}: {exc}",
                                "timestamp_utc": cycle_ts,
                            }
                        )

            briefings_done: list[dict[str, Any]] = []
            session_cost_before = state.session_cost_usd

            for candidate, prediction in new_pairs[:MAX_BRIEFINGS_PER_CYCLE]:
                if state.session_cost_usd >= COST_CAP_USD:
                    _log.warning("Session cost cap $%.2f reached — skipping Claude", COST_CAP_USD)
                    break

                cost_before = cost_tracker.summary().total_cost_usd
                reasoning, briefing, delta, from_cache = await _collect_briefing(
                    candidate, prediction, cost_before
                )
                state.session_cost_usd = round(state.session_cost_usd + delta, 6)

                preview = briefing[:150].replace("\n", " ") if briefing else ""
                briefings_done.append(
                    {
                        "trksub": candidate.trksub,
                        "cost_usd": delta,
                        "word_count": len(briefing.split()),
                        "cache_hit": from_cache,
                    }
                )

                review = expert_reviews.get(candidate.trksub)
                await notifier.broadcast(
                    {
                        "type": "new_candidate",
                        "candidate": candidate.model_dump(mode="json"),
                        "prediction": prediction.model_dump(mode="json"),
                        "briefing_preview": preview,
                        "expert_review": (
                            review.model_dump(mode="json") if review else None
                        ),
                        "timestamp": cycle_ts,
                    }
                )
                _log.info(
                    "Briefed new candidate %s (cache=%s, $%.4f)",
                    candidate.trksub, from_cache, delta,
                )

            duration_s = round(time.monotonic() - cycle_wall_start, 2)

            await notifier.broadcast(
                {
                    "type": "cycle_complete",
                    "cycle": cycle,
                    "candidates_seen": len(ranked),
                    "new_count": len(new_pairs),
                    "cost_delta_usd": round(state.session_cost_usd - session_cost_before, 6),
                    "session_cost_usd": state.session_cost_usd,
                    "timestamp": cycle_ts,
                }
            )

            agent_logger.log_cycle(
                {
                    "timestamp_utc": cycle_ts,
                    "cycle": cycle,
                    "candidates_fetched_count": len(ranked),
                    "new_candidates_trksubs": [c.trksub for c, _ in new_pairs],
                    "briefings_generated": briefings_done,
                    "expert_reviews": expert_log_entries,
                    "total_cost_this_cycle_usd": round(
                        state.session_cost_usd - session_cost_before, 6
                    ),
                    "total_cost_session_usd": state.session_cost_usd,
                    "duration_seconds": duration_s,
                    "errors": [],
                }
            )

            state.prev_trksubs = current_trksubs
            state.last_cycle_at = datetime.now(UTC)
            save_state(state)

            consecutive_errors = 0
            _log.info("Cycle %d complete — %d new, %.2fs", cycle, len(new_pairs), duration_s)

        except Exception as exc:
            consecutive_errors += 1
            err_msg = f"{type(exc).__name__}: {exc}"
            _log.error("Cycle %d error (%d consecutive): %s", cycle, consecutive_errors, err_msg)

            agent_logger.log_cycle(
                {
                    "timestamp_utc": cycle_ts,
                    "cycle": cycle,
                    "candidates_fetched_count": 0,
                    "new_candidates_trksubs": [],
                    "briefings_generated": [],
                    "total_cost_this_cycle_usd": 0.0,
                    "total_cost_session_usd": state.session_cost_usd,
                    "duration_seconds": round(time.monotonic() - cycle_wall_start, 2),
                    "errors": [err_msg],
                }
            )
            await notifier.broadcast({"type": "error", "message": err_msg, "timestamp": cycle_ts})

            idx = min(consecutive_errors - 1, len(BACKOFF_STEPS_SECONDS) - 1)
            backoff = BACKOFF_STEPS_SECONDS[idx]
            _log.info("Backing off %ds before next cycle", backoff)
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(stop_event.wait(), timeout=float(backoff))
            continue

        # Normal inter-cycle sleep — interruptible by stop_event
        with contextlib.suppress(TimeoutError):
            await asyncio.wait_for(stop_event.wait(), timeout=float(CYCLE_INTERVAL_SECONDS))

    _log.info("Managed Agent stopped after %d cycles.", state.cycle_count)
