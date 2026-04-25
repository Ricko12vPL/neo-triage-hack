"""HTTP-level tests for the Imminent Impactors Library REST endpoints."""
from __future__ import annotations

from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)


def test_GET_list_returns_six_summaries() -> None:
    r = client.get("/api/imminent-impactors/")
    assert r.status_code == 200
    payload = r.json()
    assert isinstance(payload, list)
    assert len(payload) == 6
    designations = {entry["designation"] for entry in payload}
    assert designations == {
        "2008 TC3",
        "2014 AA",
        "2022 EB5",
        "2023 CX1",
        "2024 BX1",
        "2024 YR4",
    }


def test_GET_2024_YR4_returns_full_data_with_corridor() -> None:
    r = client.get("/api/imminent-impactors/2024 YR4")
    assert r.status_code == 200
    yr4 = r.json()
    assert yr4["designation"] == "2024 YR4"
    assert yr4["case_type"] == "CLEARED"
    assert len(yr4["corridor_polyline"]) == 11
    assert yr4["iawn_activated"] is True
    assert yr4["smpag_activated"] is True
    assert len(yr4["sources"]) >= 4


def test_GET_url_encoded_designation_works() -> None:
    r = client.get("/api/imminent-impactors/2024%20YR4")
    assert r.status_code == 200
    assert r.json()["designation"] == "2024 YR4"


def test_GET_2008_TC3_full_detail_with_almahata_sitta() -> None:
    r = client.get("/api/imminent-impactors/2008 TC3")
    assert r.status_code == 200
    tc3 = r.json()
    assert tc3["meteorite_recovery"]["name"] == "Almahata Sitta"
    assert tc3["meteorite_recovery"]["fragments_recovered"] == 600
    assert "ureilite" in tc3["meteorite_recovery"]["meteorite_class"].lower()


def test_GET_unknown_designation_returns_404_with_known_list() -> None:
    r = client.get("/api/imminent-impactors/9999 ZZZ")
    assert r.status_code == 404
    detail = r.json()["detail"]
    assert detail["error"] == "designation_not_found"
    assert "2024 YR4" in detail["known_designations"]


def test_GET_sorted_by_date_returns_chronological_order() -> None:
    r = client.get("/api/imminent-impactors/sorted-by-date")
    assert r.status_code == 200
    cases = r.json()
    assert len(cases) == 6
    designations_in_order = [c["designation"] for c in cases]
    # 2008 TC3 first, 2024 YR4 last (most recent discovery)
    assert designations_in_order[0] == "2008 TC3"
    assert designations_in_order[-1] == "2024 YR4"


def test_summary_excludes_corridor_polyline_and_sources() -> None:
    r = client.get("/api/imminent-impactors/")
    assert r.status_code == 200
    yr4_summary = next(s for s in r.json() if s["designation"] == "2024 YR4")
    assert "corridor_polyline" not in yr4_summary
    assert "sources" not in yr4_summary
    assert yr4_summary["has_corridor_polyline"] is True
