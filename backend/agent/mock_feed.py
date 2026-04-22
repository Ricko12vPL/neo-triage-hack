"""Deterministic mock NEOCP feed for demo-mode agent cycles.

Simulates live feed evolution without hitting MPC every cycle:

- Cycles 1-2: 9 baseline candidates (P21YR4A not yet visible)
- Cycle 3+:   all 10, including P21YR4A — the hazardous analog appears

This scripted reveal is the demo's centrepiece: the agent detects a new
high-score object and immediately auto-generates a briefing + WS alert.

Post-hackathon: swap get_cycle_candidates() for neocp_fetcher.fetch_neocp_candidates().
"""
from __future__ import annotations

from backend.data.mock_candidates import MOCK_CANDIDATES
from backend.models.schemas import Candidate

_BASELINE: list[Candidate] = [c for c in MOCK_CANDIDATES if c.trksub != "P21YR4A"]
_YR4_CANDIDATE: Candidate = next(c for c in MOCK_CANDIDATES if c.trksub == "P21YR4A")


def get_cycle_candidates(cycle: int) -> list[Candidate]:
    """Return candidates visible at 1-indexed cycle number.

    Cycle ≥ 3: P21YR4A (digest2=98, P(PHA)≈0.97) first appears,
    triggering the Managed Agent's new-object alert path.
    """
    if cycle >= 3:
        return list(MOCK_CANDIDATES)
    return list(_BASELINE)
