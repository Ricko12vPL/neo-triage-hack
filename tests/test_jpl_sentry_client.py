"""Tests for the JPL CNEOS Sentry-II client.

Real JPL endpoint is never hit. Each test pins an httpx.MockTransport
handler that returns canned responses matching the actual JPL schema
(captured during BLOCK_0 verification on 2026-04-25):

  - Apophis (99942) → {error: "specified object removed", removed: "..."}
  - Bennu  (101955) → full summary + 157 VIs
  - 1979 XB → first entry of mode-S summary list
"""
from __future__ import annotations

import asyncio
import json
import shutil
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
import pytest

from backend.services import jpl_sentry_client as jpl_mod
from backend.services.jpl_sentry_client import (
    JPLSentryClient,
    estimate_corridor_from_sentry,
)


# ---------------------------------------------------------------------------
# Canned responses (real JPL Sentry-II shapes)
# ---------------------------------------------------------------------------

_BENNU_DETAIL_BODY: dict = {
    "signature": {"version": "2.0", "source": "NASA/JPL Sentry Data API"},
    "summary": {
        "des": "101955",
        "fullname": "101955 Bennu (1999 RQ36)",
        "diameter": "0.490",
        "h": "20.63",
        "ip": "0.000571699999999996",
        "ps_cum": "-1.40",
        "ps_max": "-1.58",
        "ts_max": None,
        "n_imp": 157,
        "first_obs": "1999-09-11.40624",
        "last_obs": "2020-10-3.80160",
        "v_inf": "5.99",
        "v_imp": "12.68",
        "method": "MC",
    },
    "data": [
        {
            "date": "2290-09-25.12",
            "energy": "1.425e+03",
            "ip": "1.000e-07",
            "ps": "-5.38",
            "ts": None,
            "sigma_mc": "2.1605",
        },
        {
            "date": "2182-09-24.12",
            "energy": "1.425e+03",
            "ip": "8.50e-05",
            "ps": "-2.06",
            "ts": None,
            "sigma_mc": "1.8521",
        },
    ],
}

_APOPHIS_REMOVED_BODY: dict = {
    "error": "specified object removed",
    "removed": "2021-02-21 08:22:28",
    "signature": {"version": "2.0", "source": "NASA/JPL Sentry Data API"},
}

_NOT_FOUND_BODY: dict = {
    "error": "specified object not found",
    "signature": {"version": "2.0", "source": "NASA/JPL Sentry Data API"},
}

_SUMMARY_LIST_BODY: dict = {
    "signature": {"version": "2.0", "source": "NASA/JPL Sentry Data API"},
    "data": [
        {
            "des": "1979 XB",
            "fullname": "(1979 XB)",
            "diameter": "0.66",
            "ps_max": "-2.99",
            "ts_max": "0",
            "ip": "8.515158e-07",
            "v_inf": "23.7606234552547",
            "n_imp": 4,
            "range": "2056-2113",
            "ps_cum": "-2.69",
            "h": "18.54",
            "last_obs": "1979-12-15",
        },
        {
            "des": "2022 KK2",
            "fullname": "(2022 KK2)",
            "diameter": "0.0069",
            "ps_max": "-5.79",
            "ts_max": "0",
            "ip": "0.0001203297828",
            "v_inf": "15.5694051293592",
            "n_imp": 33,
            "range": "2060-2122",
            "ps_cum": "-5.59",
            "h": "28.45",
            "last_obs": "2022-05-23",
        },
    ],
}


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _isolated_cache(tmp_path, monkeypatch):
    cache_dir = tmp_path / "jpl_sentry_cache"
    monkeypatch.setattr(jpl_mod, "CACHE_DIR", cache_dir)
    yield
    if cache_dir.exists():
        shutil.rmtree(cache_dir, ignore_errors=True)


@pytest.fixture
def captured_requests() -> list[httpx.Request]:
    return []


@pytest.fixture
def mock_client(captured_requests):
    """Build an httpx.AsyncClient with a MockTransport that routes by `des`."""

    def handler(request: httpx.Request) -> httpx.Response:
        captured_requests.append(request)
        des = request.url.params.get("des")
        if des is None:
            return httpx.Response(200, json=_SUMMARY_LIST_BODY)
        if des == "101955":
            return httpx.Response(200, json=_BENNU_DETAIL_BODY)
        if des == "99942":
            return httpx.Response(200, json=_APOPHIS_REMOVED_BODY)
        return httpx.Response(200, json=_NOT_FOUND_BODY)

    transport = httpx.MockTransport(handler)
    return httpx.AsyncClient(
        transport=transport,
        timeout=10.0,
        headers={"User-Agent": jpl_mod.USER_AGENT},
        follow_redirects=True,
    )


def _run(coro):
    return asyncio.run(coro)


# ---------------------------------------------------------------------------
# Tests — get_object_detail
# ---------------------------------------------------------------------------


def test_object_detail_bennu_in_risk_list_with_summary_and_vis(mock_client):
    client = JPLSentryClient(client=mock_client)
    report = _run(client.get_object_detail("101955 Bennu"))

    assert report.status == "IN_RISK_LIST"
    assert report.summary is not None
    assert report.summary.designation == "101955"
    assert report.summary.fullname == "101955 Bennu (1999 RQ36)"
    assert report.summary.impact_probability_cumulative == pytest.approx(5.717e-4, rel=1e-3)
    assert report.summary.palermo_scale_cumulative == pytest.approx(-1.40, abs=0.001)
    assert report.summary.palermo_scale_max == pytest.approx(-1.58, abs=0.001)
    assert report.summary.method == "MC"
    assert report.summary.diameter_km == pytest.approx(0.490, abs=1e-3)
    assert report.summary.velocity_infinity_km_s == pytest.approx(5.99, abs=0.01)
    assert len(report.virtual_impactors) == 2
    assert report.virtual_impactors[0].date == "2290-09-25.12"
    assert report.virtual_impactors[0].sigma == pytest.approx(2.1605)
    assert report.virtual_impactors[1].palermo_scale == pytest.approx(-2.06)


def test_uncertainty_bands_computed_from_vi_ensemble(mock_client):
    """Bands surface min/max/median IP + median sigma directly from VIs."""
    client = JPLSentryClient(client=mock_client)
    report = _run(client.get_object_detail("101955"))
    bands = report.uncertainty_bands
    assert bands is not None
    assert bands.n_virtual_impactors == 2
    assert bands.method == "MC"
    # Bennu canned VIs: ip = 1e-7 and 8.5e-5
    assert bands.ip_per_vi_min == pytest.approx(1e-7, rel=1e-3)
    assert bands.ip_per_vi_max == pytest.approx(8.5e-5, rel=1e-3)
    # Sigma = 2.1605, 1.8521 → median = 2.0063
    assert bands.sigma_median == pytest.approx(2.0063, abs=0.01)


def test_object_detail_apophis_removed(mock_client):
    client = JPLSentryClient(client=mock_client)
    report = _run(client.get_object_detail("99942 Apophis"))

    assert report.status == "REMOVED"
    assert report.summary is None
    assert report.virtual_impactors == []
    assert report.removed_at_utc == "2021-02-21 08:22:28"


def test_object_detail_unknown_designation_not_found(mock_client):
    client = JPLSentryClient(client=mock_client)
    report = _run(client.get_object_detail("99999999 NotAReal"))

    assert report.status == "NOT_FOUND"
    assert report.summary is None
    assert report.virtual_impactors == []


# ---------------------------------------------------------------------------
# Tests — get_summary_list
# ---------------------------------------------------------------------------


def test_summary_list_parses_all_entries(mock_client):
    client = JPLSentryClient(client=mock_client)
    items = _run(client.get_summary_list())
    assert len(items) == 2
    assert items[0].designation == "1979 XB"
    assert items[0].impact_probability_cumulative == pytest.approx(8.515e-7, rel=1e-3)
    assert items[0].n_impacts == 4
    assert items[1].designation == "2022 KK2"


# ---------------------------------------------------------------------------
# Tests — caching
# ---------------------------------------------------------------------------


def test_cache_hit_skips_http_call(mock_client, captured_requests):
    client = JPLSentryClient(client=mock_client)
    first = _run(client.get_object_detail("101955"))
    assert first.cache_hit is False
    assert len(captured_requests) == 1

    second = _run(client.get_object_detail("101955"))
    assert second.cache_hit is True
    assert len(captured_requests) == 1  # no second HTTP call
    assert second.summary is not None
    assert second.summary.designation == "101955"


def test_cache_expiry_triggers_refetch(mock_client, captured_requests, monkeypatch):
    client = JPLSentryClient(client=mock_client)
    _run(client.get_object_detail("101955"))
    assert len(captured_requests) == 1

    # Mutate the cache file so its fetched_at is older than TTL.
    cache_files = list(jpl_mod.CACHE_DIR.glob("*.json"))
    assert len(cache_files) == 1
    raw = json.loads(cache_files[0].read_text())
    stale = (datetime.now(UTC) - timedelta(hours=jpl_mod.CACHE_TTL_HOURS + 1)).isoformat()
    raw["fetched_at_utc"] = stale
    cache_files[0].write_text(json.dumps(raw, default=str))

    _run(client.get_object_detail("101955"))
    assert len(captured_requests) == 2  # cache miss → second HTTP call


def test_negative_result_is_cached(mock_client, captured_requests):
    """Apophis is REMOVED — we must still cache to avoid hammering JPL."""
    client = JPLSentryClient(client=mock_client)
    _run(client.get_object_detail("99942"))
    assert len(captured_requests) == 1

    _run(client.get_object_detail("99942"))
    assert len(captured_requests) == 1  # negative result still cached


# ---------------------------------------------------------------------------
# Tests — etiquette
# ---------------------------------------------------------------------------


def test_user_agent_header_set(mock_client, captured_requests):
    client = JPLSentryClient(client=mock_client)
    _run(client.get_object_detail("101955"))
    assert len(captured_requests) == 1
    ua = captured_requests[0].headers.get("user-agent", "")
    assert "neo-triage" in ua


def test_des_normalisation_strips_name(mock_client, captured_requests):
    """'101955 Bennu' → 'des=101955' on the wire (less ambiguous for JPL)."""
    client = JPLSentryClient(client=mock_client)
    _run(client.get_object_detail("101955 Bennu"))
    assert captured_requests[0].url.params.get("des") == "101955"


# ---------------------------------------------------------------------------
# Tests — error handling
# ---------------------------------------------------------------------------


def test_http_error_returns_status_error(monkeypatch, captured_requests):
    """Transport raises → SentryDetailReport with status=ERROR (no exception)."""

    def raise_handler(request: httpx.Request) -> httpx.Response:
        captured_requests.append(request)
        raise httpx.ConnectError("transport down")

    transport = httpx.MockTransport(raise_handler)
    error_client = httpx.AsyncClient(
        transport=transport, headers={"User-Agent": jpl_mod.USER_AGENT}
    )
    client = JPLSentryClient(client=error_client)
    report = _run(client.get_object_detail("101955"))
    assert report.status == "ERROR"
    assert report.summary is None
    assert report.error_message and "ConnectError" in report.error_message


# ---------------------------------------------------------------------------
# Tests — estimate_corridor_from_sentry
# ---------------------------------------------------------------------------


def test_corridor_estimate_for_bennu_returns_estimate(mock_client):
    """Bennu has 2 VIs with positive IP — corridor estimate must be returned."""
    client = JPLSentryClient(client=mock_client)
    report = _run(client.get_object_detail("101955"))
    estimate = estimate_corridor_from_sentry(report=report)

    assert estimate is not None
    assert estimate.designation == "101955"
    # Top VI is the second one (ip=8.5e-5 > 1e-7).
    assert estimate.based_on_vi_date == "2182-09-24.12"
    assert estimate.based_on_vi_ip == pytest.approx(8.5e-5, rel=1e-3)
    assert estimate.based_on_vi_sigma == pytest.approx(1.8521, rel=1e-3)
    # Sigma=1.8521 → 60s × 1.8521 = ~111s → 0.46° lon → ~51 km arc → clamped to 50.
    assert estimate.major_axis_km >= 50.0
    assert estimate.minor_axis_km >= 20.0
    assert estimate.method == "jpl_sentry_approximate_b_plane"
    assert "approximate" in estimate.caveat.lower()
    assert estimate.source == "JPL_CNEOS_SENTRY_II"


def test_corridor_estimate_returns_none_when_object_removed(mock_client):
    """Apophis is REMOVED — no corridor estimate possible."""
    client = JPLSentryClient(client=mock_client)
    report = _run(client.get_object_detail("99942"))
    assert report.status == "REMOVED"
    estimate = estimate_corridor_from_sentry(report=report)
    assert estimate is None


def test_corridor_estimate_returns_none_when_not_found(mock_client):
    client = JPLSentryClient(client=mock_client)
    report = _run(client.get_object_detail("99999999"))
    assert report.status == "NOT_FOUND"
    assert estimate_corridor_from_sentry(report=report) is None


def test_corridor_estimate_caveat_credits_jpl_sentry_and_phase_2(mock_client):
    """Caveat string must mention JPL Sentry-II and Phase 2 (HONESTY-1/2/3)."""
    client = JPLSentryClient(client=mock_client)
    report = _run(client.get_object_detail("101955"))
    estimate = estimate_corridor_from_sentry(report=report)
    assert estimate is not None
    caveat_lower = estimate.caveat.lower()
    assert "sentry" in caveat_lower
    assert "phase 2" in caveat_lower
    assert "monte carlo" in caveat_lower


def test_corridor_major_axis_scales_with_sigma_vi(mock_client):
    """Larger sigma → wider corridor major axis (Earth-rotation arc)."""
    client = JPLSentryClient(client=mock_client)
    report = _run(client.get_object_detail("101955"))
    assert report.summary is not None and report.virtual_impactors

    # Build two synthetic reports with hand-picked sigmas to verify scaling.
    from copy import deepcopy

    big = deepcopy(report)
    small = deepcopy(report)
    big.virtual_impactors[1].sigma = 100.0
    small.virtual_impactors[1].sigma = 0.5

    big_estimate = estimate_corridor_from_sentry(report=big)
    small_estimate = estimate_corridor_from_sentry(report=small)
    assert big_estimate is not None and small_estimate is not None
    assert big_estimate.major_axis_km > small_estimate.major_axis_km
