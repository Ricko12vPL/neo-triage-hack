"""Tests for the Find_Orb-style astrometric quality grader."""
from __future__ import annotations

import pytest

from backend.services.astrometric_quality import grade_astrometric_quality


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
