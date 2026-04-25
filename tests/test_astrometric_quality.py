"""Tests for the Find_Orb-style astrometric quality grader."""
from __future__ import annotations

import pytest

from backend.services.astrometric_quality import (
    grade_astrometric_quality,
    grade_astrometric_quality_full,
)


def test_grade_a_for_strong_tracklet():
    grade = grade_astrometric_quality(
        n_observations=12,
        arc_length_minutes=90.0,
        mean_magnitude_v=18.5,
        digest2_neo_noid=85,
    )
    assert grade == "A"


def test_grade_b_for_solid_but_tight_tracklet():
    grade = grade_astrometric_quality(
        n_observations=7,
        arc_length_minutes=45.0,
        mean_magnitude_v=21.0,
        digest2_neo_noid=40,
    )
    assert grade == "B"


def test_grade_c_for_minimal_arc():
    grade = grade_astrometric_quality(
        n_observations=4,
        arc_length_minutes=15.0,
        mean_magnitude_v=21.5,
        digest2_neo_noid=30,
    )
    assert grade == "C"


def test_grade_f_for_too_few_observations():
    grade = grade_astrometric_quality(
        n_observations=2,
        arc_length_minutes=20.0,
        mean_magnitude_v=20.0,
        digest2_neo_noid=80,
    )
    assert grade == "F"


def test_grade_f_for_too_short_arc():
    grade = grade_astrometric_quality(
        n_observations=10,
        arc_length_minutes=5.0,
        mean_magnitude_v=19.0,
        digest2_neo_noid=80,
    )
    assert grade == "F"


def test_grade_b_when_a_misses_one_threshold_only():
    """10 obs + 60 min arc + V<20 but digest2=45 (below 50) → B."""
    grade = grade_astrometric_quality(
        n_observations=10,
        arc_length_minutes=60.0,
        mean_magnitude_v=19.0,
        digest2_neo_noid=45,
    )
    assert grade == "B"


@pytest.mark.parametrize(
    "n_obs,arc,v,d2,expected",
    [
        (3, 10.0, 22.0, 0, "C"),  # exactly the floor → C
        (3, 9.99, 22.0, 0, "F"),
        (2, 100.0, 18.0, 90, "F"),
    ],
)
def test_grade_boundary_cases(n_obs, arc, v, d2, expected):
    grade = grade_astrometric_quality(
        n_observations=n_obs,
        arc_length_minutes=arc,
        mean_magnitude_v=v,
        digest2_neo_noid=d2,
    )
    assert grade == expected


# ---- Breakdown (full) variant ---------------------------------------------


def test_breakdown_returns_grade_b_with_correct_checks_for_p22mtaa_like():
    """Solid B-quality tracklet — 6 obs, 144 min arc, V=21.0."""
    bd = grade_astrometric_quality_full(
        n_observations=6,
        arc_length_minutes=144.0,
        mean_magnitude_v=21.0,
        digest2_neo_noid=0,
    )
    assert bd.grade == "B"
    assert bd.grade_color == "amber"
    assert bd.operator_action_verb == "OBSERVE"
    assert len(bd.checks) == 4
    obs_check = next(c for c in bd.checks if c.name == "observations")
    arc_check = next(c for c in bd.checks if c.name == "arc_length")
    mag_check = next(c for c in bd.checks if c.name == "magnitude")
    d2_check = next(c for c in bd.checks if c.name == "digest2")
    assert obs_check.passes_b is True and obs_check.passes_a is False
    assert arc_check.passes_a is True  # 144 > 60
    assert mag_check.passes_a is False and mag_check.passes_b is True  # V=21 in B band
    assert d2_check.value is None  # missing → None per shape


def test_breakdown_includes_what_would_upgrade_when_not_a():
    bd = grade_astrometric_quality_full(
        n_observations=6,
        arc_length_minutes=144.0,
        mean_magnitude_v=21.0,
        digest2_neo_noid=0,
    )
    assert bd.what_would_upgrade is not None
    assert "A grade" in bd.what_would_upgrade
    # B → A bottleneck includes magnitude (V=21 vs <20) + observations
    assert "V" in bd.what_would_upgrade
    assert "observations" in bd.what_would_upgrade


def test_breakdown_includes_methodology_caveat():
    bd = grade_astrometric_quality_full(
        n_observations=12,
        arc_length_minutes=90.0,
        mean_magnitude_v=18.5,
        digest2_neo_noid=85,
    )
    assert "Find_Orb" in bd.methodology_reference
    assert "projectpluto.com" in bd.methodology_reference
    assert "Phase 2" in bd.methodology_caveat


def test_breakdown_demo_fixture_returns_c_with_explanation():
    """4 obs over 18 min — exactly the demo fixture P21a3Kx-shape."""
    bd = grade_astrometric_quality_full(
        n_observations=4,
        arc_length_minutes=18.0,
        mean_magnitude_v=20.1,
        digest2_neo_noid=91,
    )
    assert bd.grade == "C"
    assert bd.grade_color == "orange"
    assert bd.operator_action_verb == "URGENT"
    assert "C floor" in bd.why_this_grade or "C because" in bd.why_this_grade
    assert bd.what_would_upgrade is not None
    assert "B grade" in bd.what_would_upgrade


def test_breakdown_high_quality_apophis_like_returns_a_with_no_upgrade():
    bd = grade_astrometric_quality_full(
        n_observations=47,
        arc_length_minutes=8.2 * 60,
        mean_magnitude_v=18.5,
        digest2_neo_noid=98,
    )
    assert bd.grade == "A"
    assert bd.grade_color == "emerald"
    assert bd.operator_action_verb == "COMMIT"
    assert bd.what_would_upgrade is None  # already at top
    # All 4 checks should pass A
    for check in bd.checks:
        if check.name == "digest2":
            assert check.passes_a is True
        else:
            assert check.passes_a is True


def test_breakdown_grade_f_explains_floor_failure():
    bd = grade_astrometric_quality_full(
        n_observations=2,
        arc_length_minutes=20.0,
        mean_magnitude_v=20.0,
        digest2_neo_noid=80,
    )
    assert bd.grade == "F"
    assert bd.grade_color == "rose"
    assert bd.operator_action_verb == "TRIAGE"
    assert "2 observations" in bd.why_this_grade
    assert bd.what_would_upgrade is not None
    assert "C floor" in bd.what_would_upgrade
