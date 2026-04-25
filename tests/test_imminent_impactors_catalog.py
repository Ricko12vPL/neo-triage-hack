"""Catalog-integrity tests for the Imminent Impactors Library.

These pin the exact published values from the cited sources. If a
future load changes a coordinate or a date by accident, these tests
will fail and surface the regression before deploy.
"""
from __future__ import annotations

import pytest

from backend.services.imminent_impactors import (
    CATALOG_PATH,
    ImminentImpactorsLibrary,
)


@pytest.fixture(scope="module")
def library() -> ImminentImpactorsLibrary:
    return ImminentImpactorsLibrary(catalog_path=CATALOG_PATH)


def test_catalog_loads_six_cases(library: ImminentImpactorsLibrary) -> None:
    cases = library.list_cases()
    assert len(cases) == 6
    designations = {c.designation for c in cases}
    assert designations == {
        "2008 TC3",
        "2014 AA",
        "2022 EB5",
        "2023 CX1",
        "2024 BX1",
        "2024 YR4",
    }


def test_2024_yr4_has_corridor_polyline_with_11_vertices(
    library: ImminentImpactorsLibrary,
) -> None:
    yr4 = library.get_case("2024 YR4")
    assert yr4 is not None
    assert yr4.corridor_polyline is not None
    assert len(yr4.corridor_polyline) == 11
    assert yr4.corridor_polyline[0].name.startswith("Eastern equatorial Pacific")
    assert yr4.corridor_polyline[-1].name.startswith("Bangladesh")


def test_2024_yr4_corridor_terminus_bangladesh(
    library: ImminentImpactorsLibrary,
) -> None:
    yr4 = library.get_case("2024 YR4")
    assert yr4 is not None
    terminus = yr4.corridor_polyline[-1]
    # Bangladesh / Dhaka region: ~23.7N, ~90.4E
    assert abs(terminus.lat_deg - 23.7) < 0.5
    assert abs(terminus.lon_deg - 90.4) < 0.5


def test_2008_tc3_has_meteorite_recovery_almahata_sitta(
    library: ImminentImpactorsLibrary,
) -> None:
    tc3 = library.get_case("2008 TC3")
    assert tc3 is not None
    assert tc3.meteorite_recovery is not None
    assert tc3.meteorite_recovery.name == "Almahata Sitta"
    assert tc3.meteorite_recovery.fragments_recovered == 600
    assert "ureilite" in tc3.meteorite_recovery.meteorite_class.lower()
    assert "Jenniskens" in tc3.meteorite_recovery.search_lead


def test_2014_aa_has_no_meteorite_recovery_atlantic_impact(
    library: ImminentImpactorsLibrary,
) -> None:
    aa = library.get_case("2014 AA")
    assert aa is not None
    assert aa.meteorite_recovery is None
    assert aa.impact_lat_deg is not None
    assert aa.impact_lon_deg is not None
    # Mid-Atlantic ~13N, -44E
    assert abs(aa.impact_lat_deg - 13.1) < 0.5
    assert -50.0 < aa.impact_lon_deg < -40.0


def test_2022_eb5_warning_time_2_hours(
    library: ImminentImpactorsLibrary,
) -> None:
    eb5 = library.get_case("2022 EB5")
    assert eb5 is not None
    assert eb5.warning_time_hours is not None
    assert 1.5 <= eb5.warning_time_hours <= 2.5
    # Norwegian Sea ~70.9N
    assert eb5.impact_lat_deg is not None
    assert eb5.impact_lat_deg > 70.0


def test_2023_cx1_normandy_lat_lon_match_published(
    library: ImminentImpactorsLibrary,
) -> None:
    cx1 = library.get_case("2023 CX1")
    assert cx1 is not None
    # Saint-Pierre-le-Viger, Normandy: 49.93N, 0.84E (published JPL Scout)
    assert cx1.impact_lat_deg == pytest.approx(49.93, abs=0.05)
    assert cx1.impact_lon_deg == pytest.approx(0.84, abs=0.05)
    assert cx1.designation_temporary == "Sar2667"


def test_2024_bx1_ribbeck_lat_52_62_lon_12_76(
    library: ImminentImpactorsLibrary,
) -> None:
    bx1 = library.get_case("2024 BX1")
    assert bx1 is not None
    assert bx1.impact_lat_deg == pytest.approx(52.62083, abs=0.001)
    assert bx1.impact_lon_deg == pytest.approx(12.76111, abs=0.001)
    assert bx1.meteorite_recovery is not None
    assert bx1.meteorite_recovery.name == "Ribbeck"
    assert "aubrite" in bx1.meteorite_recovery.meteorite_class.lower()


def test_each_case_has_at_least_2_sources(library: ImminentImpactorsLibrary) -> None:
    for case in library.list_cases():
        assert len(case.sources) >= 2, f"{case.designation} only has {len(case.sources)} sources"


def test_iawn_activated_only_for_yr4(library: ImminentImpactorsLibrary) -> None:
    for case in library.list_cases():
        if case.designation == "2024 YR4":
            assert case.iawn_activated is True
            assert case.smpag_activated is True
        else:
            assert case.iawn_activated is False
            assert case.smpag_activated is False


def test_lookup_by_designation_returns_correct_case(
    library: ImminentImpactorsLibrary,
) -> None:
    tc3 = library.get_case("2008 TC3")
    assert tc3 is not None
    assert tc3.designation == "2008 TC3"
    missing = library.get_case("9999 ZZZ")
    assert missing is None


def test_summary_listing_matches_full_count(library: ImminentImpactorsLibrary) -> None:
    summaries = library.list_summaries()
    assert len(summaries) == 6
    yr4_summary = next(s for s in summaries if s.designation == "2024 YR4")
    assert yr4_summary.case_type == "CLEARED"
    assert yr4_summary.has_corridor_polyline is True
    assert yr4_summary.has_meteorite_recovery is False


def test_cleared_case_validation_requires_polyline(
    tmp_path,
) -> None:
    """A CLEARED case missing the polyline must raise at load."""
    bad = {
        "cases": [
            {
                "designation": "FAKE",
                "case_number_in_history": 0,
                "case_type": "CLEARED",
                "discovery_date_utc": "2025-01-01T00:00:00Z",
                "discovery_observer": "Test",
                "discovery_observatory": "Test",
                "warning_time_hours": None,
                "diameter_m": 1.0,
                "diameter_uncertainty_m": None,
                "absolute_magnitude_h": None,
                "spectral_type": None,
                "impact_time_utc": None,
                "impact_lat_deg": None,
                "impact_lon_deg": None,
                "impact_uncertainty_km": None,
                "impact_location_name": "test",
                "impact_velocity_km_s": None,
                "impact_energy_kt_tnt": None,
                "explosion_altitude_km": None,
                "meteorite_recovery": None,
                "corridor_polyline": None,
                "estimated_population_in_corridor": None,
                "peak_torino_scale": None,
                "peak_impact_probability": None,
                "peak_impact_probability_date": None,
                "cleared_date": "2025-02-01",
                "cleared_by": "test",
                "historical_significance": "test",
                "iawn_activated": False,
                "smpag_activated": False,
                "sources": ["a", "b"],
            }
        ]
    }
    import json
    p = tmp_path / "bad.json"
    p.write_text(json.dumps(bad))
    with pytest.raises(ValueError, match="corridor_polyline"):
        ImminentImpactorsLibrary(catalog_path=p)
