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

Honest scope: this is a SIMPLIFIED projection of Find_Orb's residual
analysis. Bill Gray's tool computes per-observation residuals + RMS,
which is the gold standard. We use observation count + arc length +
magnitude as proxies — these correlate with residual quality but aren't
identical. Phase 2 = wire in real Find_Orb residual analysis.
"""
from __future__ import annotations

from typing import Literal, Union

from pydantic import BaseModel, Field

AstrometricGrade = Literal["A", "B", "C", "F"]
GradeColor = Literal["emerald", "amber", "orange", "rose"]

# Thresholds — kept module-level so tests + UI can both reference them.
A_MIN_OBS = 10
A_MIN_ARC_MIN = 60.0
A_MAX_V = 20.0
A_MIN_DIGEST2 = 50

B_MIN_OBS = 6
B_MIN_ARC_MIN = 30.0
B_MAX_V = 22.0

C_MIN_OBS = 3
C_MIN_ARC_MIN = 10.0


class QualityCheck(BaseModel):
    """Single threshold check that contributes to the overall grade."""

    name: Literal["observations", "arc_length", "magnitude", "digest2"]
    label: str  # human-readable e.g. "Observations"
    value: Union[float, int, None]
    unit: str  # "count", "minutes", "V_mag", "score"
    threshold_a: Union[float, int, None]
    threshold_b: Union[float, int, None]
    threshold_c: Union[float, int, None]
    passes_a: bool
    passes_b: bool
    passes_c: bool
    interpretation: str


class AstrometricQualityBreakdown(BaseModel):
    """Full grading breakdown — letter + reasoning + checks + upgrade path.

    This shape goes on the wire so the frontend has everything it needs
    to render tooltip, breakdown panel, and range bar without N extra
    API calls. `grade` is also surfaced as a top-level field on
    `RankedCandidate.astrometric_quality_grade` for backward compat with
    callers that only care about the letter.
    """

    grade: AstrometricGrade
    grade_color: GradeColor
    grade_summary: str  # one-liner: "Solid tracklet — adequate for short-arc fit."
    operator_implication: str  # action verb: "OBSERVE — extend arc, could converge tonight"
    operator_action_verb: Literal["COMMIT", "OBSERVE", "URGENT", "TRIAGE"]
    checks: list[QualityCheck]
    why_this_grade: str
    what_would_upgrade: str | None  # None for grade A
    methodology_reference: str = Field(
        default="Find_Orb-style simplified — Bill Gray, projectpluto.com",
    )
    methodology_caveat: str = Field(
        default=(
            "Production Find_Orb does residual statistics on per-observation "
            "positions. Our grading uses observation count, arc length and "
            "magnitude as proxies. Phase 2 = full residual analysis."
        ),
    )


_GRADE_COLORS: dict[AstrometricGrade, GradeColor] = {
    "A": "emerald",
    "B": "amber",
    "C": "orange",
    "F": "rose",
}

_GRADE_SUMMARY: dict[AstrometricGrade, str] = {
    "A": "High-confidence astrometry — orbit fit will converge tightly.",
    "B": "Solid tracklet — adequate for short-arc fit.",
    "C": "Marginal — risk of going stale on NEOCP without follow-up.",
    "F": "Insufficient — pursue immediately or accept loss.",
}

_GRADE_ACTION_VERB: dict[AstrometricGrade, Literal["COMMIT", "OBSERVE", "URGENT", "TRIAGE"]] = {
    "A": "COMMIT",
    "B": "OBSERVE",
    "C": "URGENT",
    "F": "TRIAGE",
}

_GRADE_OPERATOR_IMPLICATION: dict[AstrometricGrade, str] = {
    "A": "COMMIT — safe to spend 60+ min of follow-up tonight",
    "B": "OBSERVE — extend arc, could converge tonight",
    "C": "URGENT — likely to drift off NEOCP in 24 h",
    "F": "TRIAGE — pursue immediately or accept loss",
}


def grade_astrometric_quality(
    *,
    n_observations: int,
    arc_length_minutes: float,
    mean_magnitude_v: float,
    digest2_neo_noid: int,
) -> AstrometricGrade:
    """Return Find_Orb-style A/B/C/F grade for a tracklet.

    Backward-compat thin wrapper around `grade_astrometric_quality_full`
    for callers that only care about the letter. New code should prefer
    the breakdown variant so the UI can render reasoning.
    """
    if n_observations < C_MIN_OBS or arc_length_minutes < C_MIN_ARC_MIN:
        return "F"
    if (
        n_observations >= A_MIN_OBS
        and arc_length_minutes >= A_MIN_ARC_MIN
        and mean_magnitude_v < A_MAX_V
        and digest2_neo_noid >= A_MIN_DIGEST2
    ):
        return "A"
    if (
        n_observations >= B_MIN_OBS
        and arc_length_minutes >= B_MIN_ARC_MIN
        and mean_magnitude_v < B_MAX_V
    ):
        return "B"
    return "C"


def _interpret_observations(n: int) -> str:
    if n >= A_MIN_OBS:
        return f"{n} observations — well above A threshold (≥{A_MIN_OBS})."
    if n >= B_MIN_OBS:
        return f"{n} observations — meets B threshold (≥{B_MIN_OBS}); needs {A_MIN_OBS - n} more for A."
    if n >= C_MIN_OBS:
        return f"{n} observations — meets C floor (≥{C_MIN_OBS}); needs {B_MIN_OBS - n} more for B."
    return f"{n} observations — below C floor of ≥{C_MIN_OBS}; insufficient for any grade."


def _interpret_arc(arc_min: float) -> str:
    if arc_min >= A_MIN_ARC_MIN:
        return f"{arc_min:.0f} min arc — A-quality span."
    if arc_min >= B_MIN_ARC_MIN:
        return f"{arc_min:.0f} min arc — meets B threshold (≥{B_MIN_ARC_MIN:.0f}); needs {A_MIN_ARC_MIN - arc_min:.0f} more min for A."
    if arc_min >= C_MIN_ARC_MIN:
        return f"{arc_min:.0f} min arc — meets C floor (≥{C_MIN_ARC_MIN:.0f}); needs {B_MIN_ARC_MIN - arc_min:.0f} more min for B."
    return f"{arc_min:.0f} min arc — below C floor of ≥{C_MIN_ARC_MIN:.0f} min."


def _interpret_magnitude(v: float) -> str:
    if v < A_MAX_V:
        return f"V={v:.1f} — bright enough for A (V<{A_MAX_V:.0f})."
    if v < B_MAX_V:
        return f"V={v:.1f} — passes B threshold (V<{B_MAX_V:.0f}) but ~{v - A_MAX_V:.1f} mag too faint for A."
    return f"V={v:.1f} — fails B threshold (V<{B_MAX_V:.0f}); recovery will be tight."


def _interpret_digest2(d2: int) -> str:
    if d2 >= A_MIN_DIGEST2:
        return f"digest2 NEO_NoID={d2} — meets A threshold (≥{A_MIN_DIGEST2})."
    if d2 > 0:
        return f"digest2 NEO_NoID={d2} — below A threshold (≥{A_MIN_DIGEST2}); not gating B/C/F."
    return "digest2 unavailable — common for live MPC tracklets; not gating B/C/F."


def _build_checks(
    n_observations: int,
    arc_length_minutes: float,
    mean_magnitude_v: float,
    digest2_neo_noid: int,
) -> list[QualityCheck]:
    return [
        QualityCheck(
            name="observations",
            label="Observations",
            value=n_observations,
            unit="count",
            threshold_a=A_MIN_OBS,
            threshold_b=B_MIN_OBS,
            threshold_c=C_MIN_OBS,
            passes_a=n_observations >= A_MIN_OBS,
            passes_b=n_observations >= B_MIN_OBS,
            passes_c=n_observations >= C_MIN_OBS,
            interpretation=_interpret_observations(n_observations),
        ),
        QualityCheck(
            name="arc_length",
            label="Arc length",
            value=arc_length_minutes,
            unit="minutes",
            threshold_a=A_MIN_ARC_MIN,
            threshold_b=B_MIN_ARC_MIN,
            threshold_c=C_MIN_ARC_MIN,
            passes_a=arc_length_minutes >= A_MIN_ARC_MIN,
            passes_b=arc_length_minutes >= B_MIN_ARC_MIN,
            passes_c=arc_length_minutes >= C_MIN_ARC_MIN,
            interpretation=_interpret_arc(arc_length_minutes),
        ),
        QualityCheck(
            name="magnitude",
            label="Magnitude",
            value=mean_magnitude_v,
            unit="V_mag",
            threshold_a=A_MAX_V,
            threshold_b=B_MAX_V,
            threshold_c=None,  # not gating below B
            passes_a=mean_magnitude_v < A_MAX_V,
            passes_b=mean_magnitude_v < B_MAX_V,
            passes_c=True,  # magnitude does not gate C
            interpretation=_interpret_magnitude(mean_magnitude_v),
        ),
        QualityCheck(
            name="digest2",
            label="digest2 NEO_NoID",
            value=digest2_neo_noid if digest2_neo_noid > 0 else None,
            unit="score",
            threshold_a=A_MIN_DIGEST2,
            threshold_b=None,
            threshold_c=None,
            passes_a=digest2_neo_noid >= A_MIN_DIGEST2,
            passes_b=True,
            passes_c=True,
            interpretation=_interpret_digest2(digest2_neo_noid),
        ),
    ]


def _why_this_grade(
    grade: AstrometricGrade,
    n_observations: int,
    arc_length_minutes: float,
    mean_magnitude_v: float,
    digest2_neo_noid: int,
) -> str:
    """Plain-English derivation of the grade — deterministic, no LLM."""
    if grade == "A":
        return (
            f"Grade A — all four checks pass with margin. "
            f"{n_observations} observations, {arc_length_minutes:.0f} min of arc, "
            f"V={mean_magnitude_v:.1f}, digest2={digest2_neo_noid}. "
            "Find_Orb residuals would be tight; orbit converges on first fit."
        )
    if grade == "B":
        # Identify which A-check failed
        failed: list[str] = []
        if n_observations < A_MIN_OBS:
            failed.append(f"observations={n_observations} (<{A_MIN_OBS})")
        if arc_length_minutes < A_MIN_ARC_MIN:
            failed.append(f"arc={arc_length_minutes:.0f} min (<{A_MIN_ARC_MIN:.0f})")
        if mean_magnitude_v >= A_MAX_V:
            failed.append(f"V={mean_magnitude_v:.1f} (≥{A_MAX_V:.0f})")
        if digest2_neo_noid < A_MIN_DIGEST2:
            failed.append(f"digest2={digest2_neo_noid} (<{A_MIN_DIGEST2})")
        return (
            f"Grade B because the tracklet meets all B thresholds — "
            f"observations≥{B_MIN_OBS}, arc≥{B_MIN_ARC_MIN:.0f} min, V<{B_MAX_V:.0f} — "
            f"but fails A on: {', '.join(failed) if failed else '—'}."
        )
    if grade == "C":
        return (
            f"Grade C because the tracklet has {n_observations} observations over "
            f"{arc_length_minutes:.0f} min — both above C floor (≥{C_MIN_OBS} obs, "
            f"≥{C_MIN_ARC_MIN:.0f} min) but below B (≥{B_MIN_OBS} obs, "
            f"≥{B_MIN_ARC_MIN:.0f} min) or fails V<{B_MAX_V:.0f}. "
            "Magnitude does not gate at this tier."
        )
    # F
    if n_observations < C_MIN_OBS:
        return (
            f"Grade F — only {n_observations} observations (<{C_MIN_OBS}). "
            "Below the floor for any tracklet-grade triage."
        )
    return (
        f"Grade F — arc length {arc_length_minutes:.0f} min "
        f"(<{C_MIN_ARC_MIN:.0f} min floor). Too short to fit even a "
        "preliminary linear motion model."
    )


def _what_would_upgrade(
    grade: AstrometricGrade,
    n_observations: int,
    arc_length_minutes: float,
    mean_magnitude_v: float,
    digest2_neo_noid: int,
) -> str | None:
    """Smallest delta to higher grade. None if already A."""
    if grade == "A":
        return None
    if grade == "B":
        # Find binding A constraint(s)
        deltas: list[str] = []
        if n_observations < A_MIN_OBS:
            deltas.append(f"{A_MIN_OBS - n_observations} more observations")
        if arc_length_minutes < A_MIN_ARC_MIN:
            deltas.append(f"{A_MIN_ARC_MIN - arc_length_minutes:.0f} more minutes of arc")
        if mean_magnitude_v >= A_MAX_V:
            deltas.append(
                f"V<{A_MAX_V:.0f} (currently V={mean_magnitude_v:.1f}, "
                f"~{mean_magnitude_v - A_MAX_V + 0.5:.1f} mag too faint for southern surveys)"
            )
        if digest2_neo_noid < A_MIN_DIGEST2:
            deltas.append(f"digest2 ≥{A_MIN_DIGEST2} (currently {digest2_neo_noid or 'unavailable'})")
        return "To reach A grade: " + "; ".join(deltas) + "."
    if grade == "C":
        deltas: list[str] = []
        if n_observations < B_MIN_OBS:
            deltas.append(f"{B_MIN_OBS - n_observations} more observations")
        if arc_length_minutes < B_MIN_ARC_MIN:
            deltas.append(f"{B_MIN_ARC_MIN - arc_length_minutes:.0f} more min of arc")
        if mean_magnitude_v >= B_MAX_V:
            deltas.append(f"V<{B_MAX_V:.0f} (currently V={mean_magnitude_v:.1f})")
        return "To reach B grade: " + "; ".join(deltas) + "."
    # F
    deltas: list[str] = []
    if n_observations < C_MIN_OBS:
        deltas.append(f"at least {C_MIN_OBS} observations (currently {n_observations})")
    if arc_length_minutes < C_MIN_ARC_MIN:
        deltas.append(
            f"arc ≥{C_MIN_ARC_MIN:.0f} min (currently {arc_length_minutes:.0f} min)"
        )
    return "To reach C floor: " + "; ".join(deltas) + "."


def grade_astrometric_quality_full(
    *,
    n_observations: int,
    arc_length_minutes: float,
    mean_magnitude_v: float,
    digest2_neo_noid: int,
) -> AstrometricQualityBreakdown:
    """Full breakdown for a tracklet — letter + checks + reasoning."""
    grade = grade_astrometric_quality(
        n_observations=n_observations,
        arc_length_minutes=arc_length_minutes,
        mean_magnitude_v=mean_magnitude_v,
        digest2_neo_noid=digest2_neo_noid,
    )
    checks = _build_checks(
        n_observations=n_observations,
        arc_length_minutes=arc_length_minutes,
        mean_magnitude_v=mean_magnitude_v,
        digest2_neo_noid=digest2_neo_noid,
    )
    return AstrometricQualityBreakdown(
        grade=grade,
        grade_color=_GRADE_COLORS[grade],
        grade_summary=_GRADE_SUMMARY[grade],
        operator_implication=_GRADE_OPERATOR_IMPLICATION[grade],
        operator_action_verb=_GRADE_ACTION_VERB[grade],
        checks=checks,
        why_this_grade=_why_this_grade(
            grade,
            n_observations,
            arc_length_minutes,
            mean_magnitude_v,
            digest2_neo_noid,
        ),
        what_would_upgrade=_what_would_upgrade(
            grade,
            n_observations,
            arc_length_minutes,
            mean_magnitude_v,
            digest2_neo_noid,
        ),
    )


GRADE_DESCRIPTION: dict[AstrometricGrade, str] = {
    "A": "Strong astrometry — orbit determination will converge cleanly.",
    "B": "Solid arc — consider a second epoch to tighten the orbit.",
    "C": "Minimal arc — ranker output is a hint, not a verdict.",
    "F": "Too few observations / too short an arc — treat as preliminary.",
}
