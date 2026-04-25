"""Find_Orb-style astrometric quality grading for NEOCP tracklets.

Inspired by Bill Gray's `Find_Orb` quality buckets — operators see at a
glance whether the tracklet has enough observations + arc length to
support a confident orbit determination, or whether the data is too
thin to trust the ranker's verdict.

Grade meaning:
  A — strong arc, multiple observations, decent V — operator can trust
      the ranker's verdict and follow up tonight.
  B — solid arc but tighter constraints — useful for triage; consider
      requesting a second epoch.
  C — minimal arc, low observation count — operator should treat the
      ranker output as a hint, not a verdict.
  F — too few observations or too short an arc to draw any conclusion;
      the ranker numbers are noise.

Thresholds chosen to roughly mirror the production NEOCP triage
practice: nominally a tracklet of 3+ observations spanning 10+ minutes
is the floor for ranker-grade triage.
"""
from __future__ import annotations

from typing import Literal

AstrometricGrade = Literal["A", "B", "C", "F"]


def grade_astrometric_quality(
    *,
    n_observations: int,
    arc_length_minutes: float,
    mean_magnitude_v: float,
    digest2_neo_noid: int,
) -> AstrometricGrade:
    """Return Find_Orb-style A/B/C/F grade for a tracklet."""
    if n_observations < 3 or arc_length_minutes < 10.0:
        return "F"
    if (
        n_observations >= 10
        and arc_length_minutes >= 60.0
        and mean_magnitude_v < 20.0
        and digest2_neo_noid >= 50
    ):
        return "A"
    if (
        n_observations >= 6
        and arc_length_minutes >= 30.0
        and mean_magnitude_v < 22.0
    ):
        return "B"
    return "C"


GRADE_DESCRIPTION: dict[AstrometricGrade, str] = {
    "A": "Strong astrometry — orbit determination will converge cleanly.",
    "B": "Solid arc — consider a second epoch to tighten the orbit.",
    "C": "Minimal arc — ranker output is a hint, not a verdict.",
    "F": "Too few observations / too short an arc — treat as preliminary.",
}
