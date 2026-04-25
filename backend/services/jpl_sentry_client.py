"""JPL CNEOS Sentry-II API consumer.

Pulls official NASA impact monitoring data and normalises it into the
strict Pydantic schemas in `backend.models.external`. Two operating
modes:

  - `get_summary_list()`           → mode S, list of all Sentry objects
  - `get_object_detail(des=...)`  → mode O, one object + its VIs

Both modes are cached on disk for `CACHE_TTL_HOURS` (6h). The cache
distinguishes positive results (summary present) from negative results
(`REMOVED` / `NOT_FOUND` / `ERROR`) so a removed object like Apophis
does not get re-queried every few seconds.

Per JPL fair-use policy, we hold a process-wide asyncio.Semaphore(1)
so callers serialise into one concurrent request. User-Agent identifies
the project — required by JPL's etiquette guidance.

API docs: https://ssd-api.jpl.nasa.gov/doc/sentry.html
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx

from backend.models.external import (
    SentryDetailReport,
    SentryObjectSummary,
    SentryStatus,
    SentryVI,
)

JPL_SENTRY_API = "https://ssd-api.jpl.nasa.gov/sentry.api"
USER_AGENT = (
    "neo-triage/1.0 (hackathon project; https://github.com/Ricko12vPL/neo-triage-hack)"
)
CACHE_DIR = Path("data/jpl_sentry_cache")
CACHE_TTL_HOURS = 6
HTTP_TIMEOUT_SECONDS = 20

_log = logging.getLogger(__name__)

# Serialise outbound calls to honour JPL "1 concurrent request" policy.
_jpl_semaphore = asyncio.Semaphore(1)


# ---------------------------------------------------------------------------
# Loose-type coercion helpers — JPL ships numerics as strings unevenly.
# ---------------------------------------------------------------------------


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).strip()
    if not s or s.lower() == "nan":
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _to_int(value: Any) -> int | None:
    f = _to_float(value)
    return int(f) if f is not None else None


def _normalise_method(value: Any) -> str:
    if not isinstance(value, str):
        return "unknown"
    upper = value.strip().upper()
    if upper in {"IOBS", "LOV", "MC"}:
        return upper
    return "unknown"


def _designation_to_des_param(designation: str) -> str:
    """Normalise ' 99942 ', '99942 Apophis', 'Apophis' → query param 'des'.

    For numbered objects we prefer the leading number (less ambiguous).
    For provisional designations like '2024 YR4' we keep the spaced form
    so `+` URL-encoding works.
    """
    s = designation.strip()
    leading_number = re.match(r"^(\d+)\b", s)
    if leading_number:
        return leading_number.group(1)
    return s


def _stable_cache_key(*, mode: str, des: str | None) -> str:
    payload = json.dumps(
        {"mode": mode, "des": des or ""}, sort_keys=True, ensure_ascii=False
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:20]


def _cache_path(key: str) -> Path:
    return CACHE_DIR / f"{key}.json"


def _read_cache(key: str) -> dict[str, Any] | None:
    path = _cache_path(key)
    if not path.exists():
        return None
    try:
        with path.open() as f:
            envelope = json.load(f)
    except Exception as exc:  # noqa: BLE001
        _log.warning("jpl sentry cache corrupt at %s (%s)", path, exc)
        return None
    fetched_iso = envelope.get("fetched_at_utc")
    if not isinstance(fetched_iso, str):
        return None
    try:
        fetched = datetime.fromisoformat(fetched_iso)
    except ValueError:
        return None
    age = datetime.now(UTC) - fetched
    if age > timedelta(hours=CACHE_TTL_HOURS):
        return None
    return envelope


def _write_cache(key: str, payload: dict[str, Any]) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = _cache_path(key)
    tmp = path.with_suffix(".tmp")
    with tmp.open("w") as f:
        json.dump(payload, f, indent=2, default=str)
    tmp.replace(path)


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------


def _parse_summary_object_detail(
    body: dict[str, Any], *, fetched_at_utc: datetime, fallback_des: str
) -> SentryObjectSummary:
    """Build SentryObjectSummary from `summary` block of mode-O response."""
    return SentryObjectSummary(
        designation=str(body.get("des") or fallback_des),
        fullname=body.get("fullname") if isinstance(body.get("fullname"), str) else None,
        diameter_km=_to_float(body.get("diameter")),
        h=_to_float(body.get("h")),
        impact_probability_cumulative=_to_float(body.get("ip")) or 0.0,
        palermo_scale_cumulative=_to_float(body.get("ps_cum")) or 0.0,
        palermo_scale_max=_to_float(body.get("ps_max")) or 0.0,
        torino_scale_max=_to_int(body.get("ts_max")),
        n_impacts=_to_int(body.get("n_imp")) or 0,
        impact_year_range=str(body.get("range") or _derive_range_from_first_last(body)),
        last_observed=body.get("last_obs") if isinstance(body.get("last_obs"), str) else None,
        velocity_infinity_km_s=_to_float(body.get("v_inf")),
        velocity_impact_km_s=_to_float(body.get("v_imp")),
        method=_normalise_method(body.get("method")),
        fetched_at_utc=fetched_at_utc,
    )


def _derive_range_from_first_last(body: dict[str, Any]) -> str:
    first = body.get("first_obs") or ""
    last = body.get("last_obs") or ""
    f = str(first)[:4] if first else ""
    l = str(last)[:4] if last else ""
    if f and l:
        return f"{f}-{l}"
    return "—"


def _parse_summary_list_entry(
    entry: dict[str, Any], *, fetched_at_utc: datetime
) -> SentryObjectSummary | None:
    """Build SentryObjectSummary from one item of the mode-S list."""
    des = entry.get("des")
    if not isinstance(des, str):
        return None
    return SentryObjectSummary(
        designation=des,
        fullname=entry.get("fullname") if isinstance(entry.get("fullname"), str) else None,
        diameter_km=_to_float(entry.get("diameter")),
        h=_to_float(entry.get("h")),
        impact_probability_cumulative=_to_float(entry.get("ip")) or 0.0,
        palermo_scale_cumulative=_to_float(entry.get("ps_cum")) or 0.0,
        palermo_scale_max=_to_float(entry.get("ps_max")) or 0.0,
        torino_scale_max=_to_int(entry.get("ts_max")),
        n_impacts=_to_int(entry.get("n_imp")) or 0,
        impact_year_range=str(entry.get("range") or "—"),
        last_observed=entry.get("last_obs") if isinstance(entry.get("last_obs"), str) else None,
        velocity_infinity_km_s=_to_float(entry.get("v_inf")),
        method="unknown",
        fetched_at_utc=fetched_at_utc,
    )


def _parse_vi(entry: dict[str, Any]) -> SentryVI | None:
    date = entry.get("date")
    if not isinstance(date, str):
        return None
    energy = _to_float(entry.get("energy")) or 0.0
    ip = _to_float(entry.get("ip")) or 0.0
    ps = _to_float(entry.get("ps")) or 0.0
    ts = _to_int(entry.get("ts"))
    sigma = _to_float(entry.get("sigma_mc")) or _to_float(entry.get("sigma_lov"))
    return SentryVI(
        date=date,
        energy_mt_tnt=energy,
        impact_probability=ip,
        palermo_scale=ps,
        torino_scale=ts,
        sigma=sigma,
    )


# ---------------------------------------------------------------------------
# Client
# ---------------------------------------------------------------------------


class JPLSentryClient:
    """Async client for the JPL CNEOS Sentry-II API.

    Inject a custom httpx client in tests via `JPLSentryClient(client=…)`;
    the production path lazily builds one on first use.
    """

    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        self._client = client
        self._owns_client = client is None

    async def _get(self, params: dict[str, str]) -> dict[str, Any]:
        async with _jpl_semaphore:
            client = self._client or httpx.AsyncClient(
                timeout=HTTP_TIMEOUT_SECONDS,
                headers={"User-Agent": USER_AGENT},
                follow_redirects=True,
            )
            try:
                resp = await client.get(JPL_SENTRY_API, params=params)
                resp.raise_for_status()
                return resp.json()
            finally:
                if self._owns_client and self._client is None:
                    await client.aclose()

    async def get_summary_list(self) -> list[SentryObjectSummary]:
        """Mode S — full list of Sentry objects (cumulative IP only).

        Returns a list of `SentryObjectSummary` with `method="unknown"` —
        the summary endpoint does not disclose per-object method. Use
        `get_object_detail` for full fields.
        """
        cache_key = _stable_cache_key(mode="S", des=None)
        cached = _read_cache(cache_key)
        if cached is not None:
            return [SentryObjectSummary.model_validate(e) for e in cached["data"]]

        body = await self._get({})
        fetched = datetime.now(UTC)
        items: list[SentryObjectSummary] = []
        for entry in body.get("data") or []:
            parsed = _parse_summary_list_entry(entry, fetched_at_utc=fetched)
            if parsed is not None:
                items.append(parsed)
        envelope = {
            "fetched_at_utc": fetched.isoformat(),
            "data": [item.model_dump(mode="json") for item in items],
        }
        _write_cache(cache_key, envelope)
        return items

    async def get_object_detail(self, designation: str) -> SentryDetailReport:
        """Mode O — one object's full summary + VI list.

        Distinguishes IN_RISK_LIST / REMOVED / NOT_FOUND status. Cached
        for `CACHE_TTL_HOURS` regardless of status — even negative results
        are kept so we don't hammer JPL when a removed object stays in
        our famous-NEOs catalog.
        """
        des_param = _designation_to_des_param(designation)
        cache_key = _stable_cache_key(mode="O", des=des_param)
        cached = _read_cache(cache_key)
        if cached is not None:
            report = SentryDetailReport.model_validate(cached["report"])
            report.cache_hit = True
            return report

        try:
            body = await self._get({"des": des_param})
        except httpx.HTTPError as exc:
            return SentryDetailReport(
                designation_query=designation,
                status="ERROR",
                summary=None,
                virtual_impactors=[],
                fetched_at_utc=datetime.now(UTC),
                error_message=f"{type(exc).__name__}: {exc}",
            )

        fetched = datetime.now(UTC)
        report = _build_detail_report(body, designation=designation, fetched_at_utc=fetched)
        envelope = {
            "fetched_at_utc": fetched.isoformat(),
            "report": report.model_dump(mode="json"),
        }
        _write_cache(cache_key, envelope)
        return report


def _build_detail_report(
    body: dict[str, Any],
    *,
    designation: str,
    fetched_at_utc: datetime,
) -> SentryDetailReport:
    """Map raw JPL response → SentryDetailReport.

    Branches:
      - {"error": "specified object removed", "removed": "..."} → REMOVED
      - {"error": "..."}                                         → NOT_FOUND
      - {"summary": {...}, "data": [...]}                        → IN_RISK_LIST
    """
    error = body.get("error")
    if isinstance(error, str):
        error_lower = error.lower()
        if "removed" in error_lower:
            return SentryDetailReport(
                designation_query=designation,
                status="REMOVED",
                summary=None,
                virtual_impactors=[],
                fetched_at_utc=fetched_at_utc,
                removed_at_utc=str(body.get("removed") or ""),
                error_message=error,
            )
        return SentryDetailReport(
            designation_query=designation,
            status="NOT_FOUND",
            summary=None,
            virtual_impactors=[],
            fetched_at_utc=fetched_at_utc,
            error_message=error,
        )

    summary_block = body.get("summary")
    if not isinstance(summary_block, dict):
        return SentryDetailReport(
            designation_query=designation,
            status="NOT_FOUND",
            summary=None,
            virtual_impactors=[],
            fetched_at_utc=fetched_at_utc,
            error_message="missing summary block",
        )

    fallback_des = _designation_to_des_param(designation)
    summary = _parse_summary_object_detail(
        summary_block, fetched_at_utc=fetched_at_utc, fallback_des=fallback_des
    )
    vis_raw = body.get("data") or []
    vis = [parsed for parsed in (_parse_vi(e) for e in vis_raw) if parsed is not None]
    return SentryDetailReport(
        designation_query=designation,
        status="IN_RISK_LIST",
        summary=summary,
        virtual_impactors=vis,
        fetched_at_utc=fetched_at_utc,
    )


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------


_default: JPLSentryClient | None = None


def get_jpl_sentry_client() -> JPLSentryClient:
    global _default
    if _default is None:
        _default = JPLSentryClient()
    return _default
