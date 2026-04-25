"""Tests for the ESA NEOCC Aegis v5 client.

Real ESA endpoint is never hit. Each test uses a hand-crafted ESA risk
list snippet that mirrors the actual format captured during BLOCK_0
verification on 2026-04-25 (12-line header + pipe-delimited data).
"""
from __future__ import annotations

import asyncio
import json
import shutil
from datetime import UTC, datetime, timedelta

import httpx
import pytest

from backend.services import esa_neocc_client as esa_mod
from backend.services.esa_neocc_client import ESANeoCCClient, parse_risk_list

# Real ESA shape — header + 5 data rows
_SAMPLE_RISK_LIST = """Last Update: 2026-04-25 14:30 UTC
           Object             |    Diameter    |             VI Max                                   |          VIs                  |
Num/des.           Name       |   m  |   *=Y   |      Date/Time   |  IP max  | PS max |TS  | Vel km/s | Years     | IP cum   | PS cum |
AAAAAAAAAAAA AAAAAAAAAAAAAAAA | NNNN |    A    | YYYY-MM-DD HH:MM | EEEEEEEE | NNN.NN | NN |  NNN.NN  | YYYY-YYYY | EEEEEEEE | NNN.NN |
2023VD3                       |   14 |    *    | 2034-11-08 17:08 |  2.35E-3 |  -2.67 |  0 |   21.01  | 2034-2039 |  2.35E-3 |  -2.67 |
2008JL3                       |   30 |    *    | 2027-05-01 09:05 |  1.49E-4 |  -2.73 |  0 |   14.01  | 2027-2122 |  1.61E-4 |  -2.73 |
1979XB                        |  500 |    *    | 2056-12-12 21:38 |  2.34E-7 |  -2.82 |  0 |   27.54  | 2056-2113 |  7.34E-7 |  -2.70 |
2026HW2                       |  120 |    *    | 2036-06-04 09:59 |  8.27E-6 |  -3.10 |  0 |   15.61  | 2033-2113 |  1.01E-5 |  -3.08 |
2000SG344                     |   40 |    *    | 2071-09-16 00:54 |  8.95E-4 |  -3.18 |  0 |   11.27  | 2069-2122 |  2.82E-3 |  -2.77 |
"""


@pytest.fixture(autouse=True)
def _isolated_cache(tmp_path, monkeypatch):
    cache_dir = tmp_path / "esa_neocc_cache"
    monkeypatch.setattr(esa_mod, "CACHE_DIR", cache_dir)
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
        return httpx.Response(
            200,
            content=_SAMPLE_RISK_LIST.encode("utf-8"),
            headers={"content-type": "text/plain; charset=UTF-8"},
        )

    return httpx.AsyncClient(
        transport=httpx.MockTransport(handler),
        headers={"User-Agent": esa_mod.USER_AGENT},
        follow_redirects=True,
    )


def _run(coro):
    return asyncio.run(coro)


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------


def test_parse_skips_header_and_returns_data_rows():
    fetched = datetime.now(UTC)
    entries = parse_risk_list(_SAMPLE_RISK_LIST, fetched_at_utc=fetched)
    assert len(entries) == 5
    desigs = [e.designation for e in entries]
    assert "2023VD3" in desigs
    assert "1979XB" in desigs
    # The format spec line starts with 'AAAAAAAAAAAA' — must not be parsed.
    assert "AAAAAAAAAAAA" not in desigs


def test_parse_first_row_field_values():
    entries = parse_risk_list(_SAMPLE_RISK_LIST, fetched_at_utc=datetime.now(UTC))
    e = entries[0]
    assert e.designation == "2023VD3"
    assert e.name is None
    assert e.diameter_m == pytest.approx(14.0)
    assert e.star_flag is True
    assert e.vi_max_date_utc == "2034-11-08 17:08"
    assert e.impact_probability_max == pytest.approx(2.35e-3, rel=1e-3)
    assert e.palermo_scale_max == pytest.approx(-2.67, abs=0.001)
    assert e.torino_scale == 0
    assert e.velocity_km_s == pytest.approx(21.01, abs=0.01)
    assert e.impact_year_range == "2034-2039"
    assert e.impact_probability_cumulative == pytest.approx(2.35e-3, rel=1e-3)
    assert e.palermo_scale_cumulative == pytest.approx(-2.67, abs=0.001)
    assert e.source == "ESA_NEOCC_AEGIS_V5"


# ---------------------------------------------------------------------------
# Lookups
# ---------------------------------------------------------------------------


def test_get_object_returns_match_when_present(mock_client):
    client = ESANeoCCClient(client=mock_client)
    entry = _run(client.get_object_in_risk_list("2023VD3"))
    assert entry is not None
    assert entry.designation == "2023VD3"


def test_get_object_returns_none_when_absent(mock_client):
    """Apophis was removed from ESA Aegis after the 2021 radar refinement."""
    client = ESANeoCCClient(client=mock_client)
    entry = _run(client.get_object_in_risk_list("99942 Apophis"))
    assert entry is None


def test_get_object_normalises_spaced_designation(mock_client):
    """JPL/MPC '2008 JL3' should match ESA's '2008JL3'."""
    client = ESANeoCCClient(client=mock_client)
    entry = _run(client.get_object_in_risk_list("2008 JL3"))
    assert entry is not None
    assert entry.designation == "2008JL3"


# ---------------------------------------------------------------------------
# Caching
# ---------------------------------------------------------------------------


def test_cache_hit_skips_http_call(mock_client, captured_requests):
    client = ESANeoCCClient(client=mock_client)
    _run(client.get_risk_list())
    assert len(captured_requests) == 1
    _run(client.get_risk_list())
    assert len(captured_requests) == 1  # cached


def test_cache_expiry_triggers_refetch(mock_client, captured_requests):
    client = ESANeoCCClient(client=mock_client)
    _run(client.get_risk_list())
    assert len(captured_requests) == 1

    cache_files = list(esa_mod.CACHE_DIR.glob("*.json"))
    assert len(cache_files) == 1
    raw = json.loads(cache_files[0].read_text())
    raw["fetched_at_utc"] = (
        datetime.now(UTC) - timedelta(hours=esa_mod.CACHE_TTL_HOURS + 1)
    ).isoformat()
    cache_files[0].write_text(json.dumps(raw, default=str))

    _run(client.get_risk_list())
    assert len(captured_requests) == 2


def test_user_agent_header_set(mock_client, captured_requests):
    client = ESANeoCCClient(client=mock_client)
    _run(client.get_risk_list())
    assert len(captured_requests) == 1
    assert "neo-triage" in captured_requests[0].headers.get("user-agent", "")
