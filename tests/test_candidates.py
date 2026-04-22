"""Smoke tests for /api/candidates."""
from fastapi.testclient import TestClient

from backend.main import app
from backend.models.schemas import Candidate

client = TestClient(app)


def test_health_still_ok():
    response = client.get("/health")
    assert response.status_code == 200


def test_list_candidates_default_limit():
    response = client.get("/api/candidates/")
    assert response.status_code == 200
    assert len(response.json()) == 10


def test_list_candidates_custom_limit():
    response = client.get("/api/candidates/?limit=3")
    assert response.status_code == 200
    assert len(response.json()) == 3


def test_list_candidates_invalid_limit_rejected():
    response = client.get("/api/candidates/?limit=0")
    assert response.status_code == 422

    response = client.get("/api/candidates/?limit=200")
    assert response.status_code == 422


def test_candidate_schema_valid():
    response = client.get("/api/candidates/")
    for item in response.json():
        Candidate.model_validate(item)


def test_get_single_candidate_by_trksub():
    response = client.get("/api/candidates/P21YR4A")
    assert response.status_code == 200
    data = response.json()
    assert data["trksub"] == "P21YR4A"
    assert data["digest2_neo_noid"] == 98


def test_get_missing_candidate_404():
    response = client.get("/api/candidates/NONEXISTENT")
    assert response.status_code == 404


def test_candidate_ra_in_range():
    response = client.get("/api/candidates/")
    for item in response.json():
        assert 0 <= item["ra_deg"] < 360


def test_candidate_dec_in_range():
    response = client.get("/api/candidates/")
    for item in response.json():
        assert -90 <= item["dec_deg"] <= 90


def test_candidate_digest2_in_range():
    response = client.get("/api/candidates/")
    for item in response.json():
        assert 0 <= item["digest2_neo_noid"] <= 100


def test_mock_composition_has_all_categories():
    """The fixture must include high-NEO, intermediate, artifact, and YR4 analog."""
    response = client.get("/api/candidates/")
    items = response.json()
    assert any(i["digest2_neo_noid"] >= 80 for i in items), "need high-NEO cases"
    assert any(50 <= i["digest2_neo_noid"] < 80 for i in items), "need intermediate cases"
    assert any(i["digest2_neo_noid"] < 40 for i in items), "need artifacts"
    assert any(i["trksub"] == "P21YR4A" for i in items), "need YR4 analog"
