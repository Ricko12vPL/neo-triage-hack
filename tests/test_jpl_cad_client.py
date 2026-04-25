"""Tests for the JPL CAD (close-approach data) client.

Real JPL endpoint is never hit. Tests use canned responses captured
during BLOCK_0 verification — Apophis 2029 dist=0.000254 au @ 7.42 km/s
is the published JPL value, anchoring this test against drift in the
real API.
"""
from __future__ import annotations

import asyncio
import json
import shutil
from datetime import UTC, datetime, timedelta

import httpx
import pytest

from backend.services import jpl_cad_client as cad_mod
from backend.services.jpl_cad_client import JPLCADClient

# Real shape captured during BLOCK_0. fields[] is positional; values are strings.
_APOPHIS_CAD_BODY: dict = {
    "signature": {"version": "1.5", "source": "NASA/JPL SBDB Close Approach Data API"},
    "count": "3",
    "fields": [
        "des", "orbit_id", "jd", "cd", "dist", "dist_min", "dist_max",
        "v_rel", "v_inf", "t_sigma_f", "h",
    ],
    "data": [
        [
            "99942", "220", "2462240.407091969", "2029-Apr-13 21:46",
            "0.000254090910419299", "0.000254068999976389", "0.000254112821017663",
            "7.42253895678452", "5.84135589753103", "< 00:01", "19.09",
        ],
        [
            "99942", "220", "2464795.123", "2036-Apr-13 04:00",
            "0.022", "0.021", "0.023", "5.84", "5.62", "00:32", "19.09",
        ],
        [
            "99942", "220", "2476600.500", "2068-Apr-12 12:30",
            "0.005", "0.004", "0.006", "7.10", "5.84", "01:00", "19.09",
        ],
    ],
}

_EMPTY_BODY: dict = {
    "signature": {"version": "1.5", "source": "NASA/JPL SBDB Close Approach Data API"},
    "count": "0",
    "fields": [
        "des", "orbit_id", "jd", "cd", "dist", "dist_min", "dist_max",
        "v_rel", "v_inf", "t_sigma_f", "h",
    ],
    "data": [],
}


@pytest.fixture(autouse=True)
def _isolated_cache(tmp_path, monkeypatch):
    cache_dir = tmp_path / "jpl_cad_cache"
    monkeypatch.setattr(cad_mod, "CACHE_DIR", cache_dir)
    yield
    if cache_dir.exists():
        shutil.rmtree(cache_dir, ignore_errors=True)


@pytest.fixture
def captured_requests() -> list[httpx.Request]:
    return []


@pytest.fixture
def mock_client(captured_requests):
    def handler(request: httpx.Request) -> httpx.Response:
        captured_requests.append(request)
        des = request.url.params.get("des")
        if des == "99942":
            return httpx.Response(200, json=_APOPHIS_CAD_BODY)
        return httpx.Response(200, json=_EMPTY_BODY)

    return httpx.AsyncClient(
        transport=httpx.MockTransport(handler),
        headers={"User-Agent": cad_mod.USER_AGENT},
        follow_redirects=True,
    )


def _run(coro):
    return asyncio.run(coro)


def test_apophis_2029_close_approach_present(mock_client):
    client = JPLCADClient(client=mock_client)
    approaches = _run(client.get_close_approaches("99942"))
    assert len(approaches) == 3
    a2029 = next((a for a in approaches if a.calendar_date.startswith("2029")), None)
    assert a2029 is not None
    assert a2029.miss_distance_au == pytest.approx(0.000254, abs=1e-6)
    assert a2029.relative_velocity_km_s == pytest.approx(7.42, abs=0.01)
    assert a2029.velocity_infinity_km_s == pytest.approx(5.84, abs=0.01)
    assert a2029.time_uncertainty_3sigma == "< 00:01"


def test_apophis_2036_present(mock_client):
    client = JPLCADClient(client=mock_client)
    approaches = _run(client.get_close_approaches("99942"))
    a2036 = next(a for a in approaches if a.calendar_date.startswith("2036"))
    assert a2036.miss_distance_au == pytest.approx(0.022, abs=1e-3)


def test_no_close_approaches_returns_empty(mock_client):
    client = JPLCADClient(client=mock_client)
    approaches = _run(client.get_close_approaches("999999999"))
    assert approaches == []


def test_caching_works(mock_client, captured_requests):
    client = JPLCADClient(client=mock_client)
    _run(client.get_close_approaches("99942"))
    assert len(captured_requests) == 1
    _run(client.get_close_approaches("99942"))
    assert len(captured_requests) == 1


def test_cache_expiry_triggers_refetch(mock_client, captured_requests):
    client = JPLCADClient(client=mock_client)
    _run(client.get_close_approaches("99942"))
    assert len(captured_requests) == 1
    cache_files = list(cad_mod.CACHE_DIR.glob("*.json"))
    raw = json.loads(cache_files[0].read_text())
    raw["fetched_at_utc"] = (
        datetime.now(UTC) - timedelta(hours=cad_mod.CACHE_TTL_HOURS + 1)
    ).isoformat()
    cache_files[0].write_text(json.dumps(raw, default=str))
    _run(client.get_close_approaches("99942"))
    assert len(captured_requests) == 2


def test_user_agent_header_set(mock_client, captured_requests):
    client = JPLCADClient(client=mock_client)
    _run(client.get_close_approaches("99942"))
    assert "neo-triage" in captured_requests[0].headers.get("user-agent", "")
