"""Transparency endpoints — disclose where candidates come from.

Judges and reviewers can call `/api/meta/data-source` to confirm at a
glance which streams feed the Live Feed and how fresh each one is.
The response now lists three independent streams (live MPC, demo
fixtures, synthetic injections) so the frontend header can show one
badge per source with its own freshness indicator.
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

from backend.data import neocp_fetcher
from backend.data.mock_candidates import MOCK_CANDIDATES
from backend.data.neocp_fetcher import fetch_neocp_candidates

router = APIRouter(prefix="/api/meta", tags=["meta"])


SourceKind = Literal["LIVE_MPC_NEOCP", "DEMO_FIXTURE", "SYNTHETIC_INJECTION"]


class StreamReport(BaseModel):
    source: SourceKind
    label: str
    description: str
    url: str | None = None
    candidate_count: int
    last_fetched_at_utc: str | None = None
    next_scheduled_fetch_at_utc: str | None = None
    ttl_seconds: int | None = None
    fetch_status: Literal["OK", "ERROR", "EMPTY", "STATIC"] = "OK"
    error_message: str | None = None


class DataSourceReport(BaseModel):
    """Per-stream provenance for everything that lands in the Live Feed."""

    streams: list[StreamReport]
    retrieved_at_utc: str
    famous_neos_count: int = 18
    famous_neos_epoch_jd: float = 2461154.5
    famous_neos_last_verified: str = "2026-04-24"
    notes: str

    # --- Backwards-compatible scalar fields used by older UI clients ---
    primary_source: Literal["mock", "live_neocp", "hybrid"] = "hybrid"
    primary_description: str = ""
    primary_count: int = 0
    live_feed_available: bool = False
    live_feed_candidate_count: int | None = None
    live_feed_sample_trksubs: list[str] = []


# Module-level counter for synthetic injections this server uptime.
_synthetic_count = 0
_synthetic_last_at: datetime | None = None


def record_synthetic_injection() -> None:
    """Called by the synthetic-injection endpoint to bump the counter."""
    global _synthetic_count, _synthetic_last_at
    _synthetic_count += 1
    _synthetic_last_at = datetime.now(UTC)


@router.get("/data-source", response_model=DataSourceReport)
async def data_source_report() -> DataSourceReport:
    """Return a per-stream breakdown of where candidates come from."""
    now = datetime.now(UTC)
    retrieved_at = now.isoformat().replace("+00:00", "Z")

    # ----- Live MPC stream -----
    live_count: int | None = None
    live_sample: list[str] = []
    live_status: Literal["OK", "ERROR", "EMPTY"] = "OK"
    live_error: str | None = None
    try:
        live_candidates = await fetch_neocp_candidates(limit=200)
        live_count = len(live_candidates)
        live_sample = [c.trksub for c in live_candidates[:5]]
        if live_count == 0:
            live_status = "EMPTY"
    except Exception as exc:  # noqa: BLE001
        live_status = "ERROR"
        live_error = f"{type(exc).__name__}: {exc}"

    cache = neocp_fetcher.cache_state()
    last_fetched = cache.get("last_fetched_at_utc")
    ttl = cache.get("ttl_seconds") or (neocp_fetcher.CACHE_TTL_MINUTES * 60)
    next_fetch_iso: str | None = None
    if isinstance(last_fetched, str):
        try:
            last_dt = datetime.fromisoformat(last_fetched.replace("Z", "+00:00"))
            next_fetch_iso = (last_dt + timedelta(seconds=ttl)).isoformat().replace(
                "+00:00", "Z"
            )
        except ValueError:
            next_fetch_iso = None

    live_stream = StreamReport(
        source="LIVE_MPC_NEOCP",
        label="MPC live",
        description=(
            "Live Minor Planet Center NEOCP feed. Polled every 2 minutes."
            " Real tracklets, real diff detection — agent broadcasts a"
            " new_candidate event only when MPC actually adds one."
        ),
        url=neocp_fetcher.NEOCP_LIST_URL,
        candidate_count=live_count or 0,
        last_fetched_at_utc=last_fetched if isinstance(last_fetched, str) else None,
        next_scheduled_fetch_at_utc=next_fetch_iso,
        ttl_seconds=ttl,
        fetch_status=live_status,
        error_message=live_error,
    )

    # ----- Demo fixture stream -----
    demo_stream = StreamReport(
        source="DEMO_FIXTURE",
        label="Demo",
        description=(
            "Curated demo candidates (P21YR4A YR4 analogue, P21LOWRT DISSENT"
            " case, and friends). Static fixtures loaded at server start —"
            " not derived from real observations. Visible alongside the"
            " live MPC stream so the briefing demo always has a hazardous"
            " anchor regardless of MPC mood."
        ),
        url=None,
        candidate_count=len(MOCK_CANDIDATES),
        last_fetched_at_utc=None,
        next_scheduled_fetch_at_utc=None,
        ttl_seconds=None,
        fetch_status="STATIC",
    )

    # ----- Synthetic injection stream -----
    synthetic_stream = StreamReport(
        source="SYNTHETIC_INJECTION",
        label="Synthetic",
        description=(
            "Operator-triggered synthetic events. Used during demo"
            " recordings to fire predictable climax moments. Every event"
            " carries source=SYNTHETIC_INJECTION on the wire and renders"
            " an explicit ⚡ SYNTHETIC badge in the UI — never claimed as"
            " a real MPC tracklet."
        ),
        url=None,
        candidate_count=_synthetic_count,
        last_fetched_at_utc=(
            _synthetic_last_at.isoformat().replace("+00:00", "Z")
            if _synthetic_last_at else None
        ),
        next_scheduled_fetch_at_utc=None,
        ttl_seconds=None,
        fetch_status="STATIC",
    )

    return DataSourceReport(
        streams=[live_stream, demo_stream, synthetic_stream],
        retrieved_at_utc=retrieved_at,
        notes=(
            "Famous NEO positions in Sky View + Orbit View are computed from"
            " current-epoch JPL Horizons elements (JD 2461154.5) propagated"
            " by kepler.ts to the current UTC. Verified <0.25° vs JPL"
            " Horizons OBSERVER ephemeris — see"
            " docs/verification/current-positions-verification.md."
        ),
        # Backwards-compat scalars (older UI build still reads these):
        primary_source="hybrid",
        primary_description=(
            "Hybrid feed: live MPC NEOCP + curated demo fixtures + optional"
            " operator-triggered synthetic injections. Each candidate carries"
            " a data_source field tagging its origin."
        ),
        primary_count=(live_count or 0) + len(MOCK_CANDIDATES),
        live_feed_available=live_status == "OK",
        live_feed_candidate_count=live_count,
        live_feed_sample_trksubs=live_sample,
    )
