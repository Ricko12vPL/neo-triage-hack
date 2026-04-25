"""Tests for the impactor_case_designation linking field on Candidate.

P21YR4A is the only demo fixture that re-creates a real historical
pre-impact prediction (2024 YR4); every other fixture and every live
NEOCP tracklet must have impactor_case_designation = None so the
frontend renders the deferred placeholder rather than fabricating a
corridor.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from backend.data.mock_candidates import MOCK_CANDIDATES
from backend.main import app

client = TestClient(app)


def test_p21yr4a_links_to_2024_yr4_case() -> None:
    yr4 = next(c for c in MOCK_CANDIDATES if c.trksub == "P21YR4A")
    assert yr4.impactor_case_designation == "2024 YR4"


def test_other_demo_fixtures_have_null_case() -> None:
    for cand in MOCK_CANDIDATES:
        if cand.trksub == "P21YR4A":
            continue
        assert cand.impactor_case_designation is None, (
            f"{cand.trksub} should have impactor_case_designation=None — "
            "only P21YR4A is allowed to link to a historical case."
        )


def test_candidate_field_defaults_to_none() -> None:
    """A fresh Candidate without explicit value must default to None."""
    from backend.models.schemas import Candidate
    from datetime import datetime, timezone

    c = Candidate(
        trksub="X",
        ra_deg=0.0,
        dec_deg=0.0,
        mean_magnitude_v=20.0,
        rate_arcsec_min=1.0,
        observatory_code="500",
        first_obs_datetime=datetime(2026, 1, 1, tzinfo=timezone.utc),
        n_observations=3,
        arc_length_minutes=10.0,
        digest2_neo_noid=50,
        ecliptic_latitude_deg=0.0,
    )
    assert c.impactor_case_designation is None


def test_api_response_includes_impactor_case_designation_for_p21yr4a() -> None:
    r = client.get("/api/rank/?limit=200&include_demo=true")
    assert r.status_code == 200
    rows = r.json()
    yr4_row = next((row for row in rows if row["trksub"] == "P21YR4A"), None)
    assert yr4_row is not None, "P21YR4A demo row must be present"
    assert yr4_row["impactor_case_designation"] == "2024 YR4"


def test_api_response_other_rows_have_null_designation() -> None:
    r = client.get("/api/rank/?limit=200&include_demo=true")
    assert r.status_code == 200
    rows = r.json()
    for row in rows:
        if row["trksub"] == "P21YR4A":
            continue
        assert row["impactor_case_designation"] is None
