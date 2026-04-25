"""JPL Close Approach Data (CAD) API consumer.

Pulls historical + future Earth close approaches for a given object
from JPL's CAD service. Used by the timeline UI on famous-NEO panels
so operators see the approach history (e.g., Apophis 2029 — the most
famous close approach of our generation).

Source: https://ssd-api.jpl.nasa.gov/cad.api
Docs:   https://ssd-api.jpl.nasa.gov/doc/cad.html

The CAD response uses a positional fields[]+data[] format where each
data row is an array in the same order as the fields[] header. The
client zips them into a dict before parsing into the strict Pydantic
`CloseApproach` model. Cached on disk for 24h — JPL CAD changes only
when new orbit determinations land.
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

from backend.models.external import CloseApproach

JPL_CAD_API = "https://ssd-api.jpl.nasa.gov/cad.api"
USER_AGENT = (
    "neo-triage/1.0 (hackathon project; https://github.com/Ricko12vPL/neo-triage-hack)"
)
CACHE_DIR = Path("data/jpl_cad_cache")
CACHE_TTL_HOURS = 24
HTTP_TIMEOUT_SECONDS = 20

_log = logging.getLogger(__name__)
_cad_semaphore = asyncio.Semaphore(1)


def _designation_to_des_param(designation: str) -> str:
    s = designation.strip()
    leading_number = re.match(r"^(\d+)\b", s)
    if leading_number:
        return leading_number.group(1)
    return s


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).strip()
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _stable_cache_key(*, des: str, date_min: str, date_max: str, dist_max_au: float) -> str:
    payload = json.dumps(
        {"des": des, "date_min": date_min, "date_max": date_max, "dist_max_au": dist_max_au},
        sort_keys=True,
    )
    return hashlib.sha256(payload.encode()).hexdigest()[:20]


def _cache_path(key: str) -> Path:
    return CACHE_DIR / f"{key}.json"


def _read_cache(key: str) -> dict | None:
    path = _cache_path(key)
    if not path.exists():
        return None
    try:
        with path.open() as f:
            envelope = json.load(f)
    except Exception as exc:  # noqa: BLE001
        _log.warning("CAD cache corrupt at %s (%s)", path, exc)
        return None
    fetched_iso = envelope.get("fetched_at_utc")
    try:
        fetched = datetime.fromisoformat(fetched_iso)
    except (TypeError, ValueError):
        return None
    if datetime.now(UTC) - fetched > timedelta(hours=CACHE_TTL_HOURS):
        return None
    return envelope


def _write_cache(key: str, envelope: dict) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = _cache_path(key)
    tmp = path.with_suffix(".tmp")
    with tmp.open("w") as f:
        json.dump(envelope, f, default=str)
    tmp.replace(path)


def _parse_cad_response(
    body: dict[str, Any],
    *,
    designation: str,
    fetched_at_utc: datetime,
) -> list[CloseApproach]:
    """Convert JPL CAD positional response into a list of CloseApproach."""
    fields = body.get("fields") or []
    data = body.get("data") or []
    if not isinstance(fields, list) or not isinstance(data, list):
        return []
    field_index = {name: i for i, name in enumerate(fields) if isinstance(name, str)}
    out: list[CloseApproach] = []
    for row in data:
        if not isinstance(row, list):
            continue
        try:
            jd = _to_float(row[field_index["jd"]])
            dist = _to_float(row[field_index["dist"]])
            dist_min = _to_float(row[field_index["dist_min"]]) or dist
            dist_max = _to_float(row[field_index["dist_max"]]) or dist
            v_rel = _to_float(row[field_index["v_rel"]])
            v_inf = _to_float(row[field_index["v_inf"]])
            cd = row[field_index["cd"]]
            t_sigma = row[field_index.get("t_sigma_f", -1)] if "t_sigma_f" in field_index else None
            h = _to_float(row[field_index.get("h", -1)]) if "h" in field_index else None
            des_value = row[field_index.get("des", -1)] if "des" in field_index else designation
        except (KeyError, IndexError, TypeError):
            continue
        if jd is None or dist is None or v_rel is None or v_inf is None or not isinstance(cd, str):
            continue
        out.append(
            CloseApproach(
                designation=str(des_value or designation),
                julian_date=jd,
                calendar_date=cd,
                miss_distance_au=dist,
                miss_distance_min_au=dist_min if dist_min is not None else dist,
                miss_distance_max_au=dist_max if dist_max is not None else dist,
                relative_velocity_km_s=v_rel,
                velocity_infinity_km_s=v_inf,
                time_uncertainty_3sigma=str(t_sigma) if t_sigma is not None else "—",
                h=h,
                fetched_at_utc=fetched_at_utc,
            )
        )
    return out


class JPLCADClient:
    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        self._client = client
        self._owns_client = client is None

    async def _get(self, params: dict[str, str]) -> dict[str, Any]:
        async with _cad_semaphore:
            client = self._client or httpx.AsyncClient(
                timeout=HTTP_TIMEOUT_SECONDS,
                headers={"User-Agent": USER_AGENT},
                follow_redirects=True,
            )
            try:
                resp = await client.get(JPL_CAD_API, params=params)
                resp.raise_for_status()
                return resp.json()
            finally:
                if self._owns_client and self._client is None:
                    await client.aclose()

    async def get_close_approaches(
        self,
        designation: str,
        *,
        date_min: str = "1900-01-01",
        date_max: str = "2200-01-01",
        dist_max_au: float = 0.2,
    ) -> list[CloseApproach]:
        """Return all close approaches for `designation` in [date_min, date_max].

        `dist_max_au` filters to approaches inside this miss-distance ceiling
        (default 0.2 au ≈ 78 lunar distances — covers everything notable).
        """
        des = _designation_to_des_param(designation)
        cache_key = _stable_cache_key(
            des=des, date_min=date_min, date_max=date_max, dist_max_au=dist_max_au
        )
        cached = _read_cache(cache_key)
        if cached is not None:
            return [CloseApproach.model_validate(e) for e in cached["approaches"]]

        try:
            body = await self._get(
                {
                    "des": des,
                    "date-min": date_min,
                    "date-max": date_max,
                    "dist-max": str(dist_max_au),
                }
            )
        except httpx.HTTPError as exc:
            _log.warning("JPL CAD fetch failed for %s: %s", designation, exc)
            return []

        fetched = datetime.now(UTC)
        approaches = _parse_cad_response(body, designation=designation, fetched_at_utc=fetched)
        envelope = {
            "fetched_at_utc": fetched.isoformat(),
            "approaches": [a.model_dump(mode="json") for a in approaches],
        }
        _write_cache(cache_key, envelope)
        return approaches


_default: JPLCADClient | None = None


def get_jpl_cad_client() -> JPLCADClient:
    global _default
    if _default is None:
        _default = JPLCADClient()
    return _default
