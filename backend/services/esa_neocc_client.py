"""ESA NEOCC Aegis v5 risk-list consumer.

Pulls the official European Space Agency Near-Earth Object Coordination
Centre risk list — the independent counterpart to JPL Sentry-II. Used
side-by-side with `jpl_sentry_client` for the three-way cross-validation
panel: when JPL Sentry, ESA Aegis, and the neo-triage ranker concur
on a designation, the operator can trust the verdict; when they
diverge, that itself is a signal worth surfacing.

Source: https://neo.ssa.esa.int/PSDB-portlet/download?file=esa_risk_list
        (text file, 12-line header + ~2000 data rows, ~270 KB)
Docs:   https://neo.ssa.esa.int/risk-list (HTML mirror)

The text format ships fixed-width columns separated by `|`. Each line:

  AAAAAAAAAAAA AAAAAAAAAAAAAAAA | NNNN | * | YYYY-MM-DD HH:MM | EEEEEEEE | NNN.NN | NN | NNN.NN | YYYY-YYYY | EEEEEEEE | NNN.NN |

  designation+name | diam_m | star_flag | vi_max_date_utc | ip_max | ps_max | ts | velocity_km_s | year_range | ip_cum | ps_cum

Cached on disk for `CACHE_TTL_HOURS` (12h — ESA refreshes daily). The
whole risk list is fetched once and parsed; per-designation lookups
work against the in-memory list rather than re-fetching.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx

from backend.models.external import AegisRiskEntry

ESA_RISK_LIST_URL = (
    "https://neo.ssa.esa.int/PSDB-portlet/download?file=esa_risk_list"
)
USER_AGENT = (
    "neo-triage/1.0 (hackathon project; https://github.com/Ricko12vPL/neo-triage-hack)"
)
CACHE_DIR = Path("data/esa_neocc_cache")
CACHE_TTL_HOURS = 12
HTTP_TIMEOUT_SECONDS = 30

# 12-line header in current ESA format (Last Update, blank, 3 header rows,
# format spec, blank...). Content lines start with an alphanumeric char
# and contain a `|`. The parser is defensive — it skips any non-data line.
_DATA_LINE_RX = re.compile(r"^\s*[A-Za-z0-9].*\|")

_log = logging.getLogger(__name__)
_esa_lock = asyncio.Lock()


# ---------------------------------------------------------------------------
# Designation normalisation — ESA uses '2024YR4', JPL/MPC use '2024 YR4'
# ---------------------------------------------------------------------------


def _candidate_keys(designation: str) -> list[str]:
    """Return designation strings to try when matching against ESA list.

    Order matters — first match wins. ESA strips spaces from provisional
    designations and drops names from numbered objects:
      '101955 Bennu' → ['101955', '101955Bennu', 'BENNU']
      '2024 YR4'     → ['2024YR4', '2024YR4'] (the same)
      '99942 Apophis' → ['99942', '99942APOPHIS', 'APOPHIS']
    """
    s = designation.strip()
    keys: list[str] = []
    leading_number = re.match(r"^(\d+)\b", s)
    if leading_number:
        keys.append(leading_number.group(1))
    keys.append(s.replace(" ", "").upper())
    parts = s.split()
    if len(parts) >= 2:
        keys.append(parts[-1].upper())
    # Dedup preserving order
    seen: set[str] = set()
    out: list[str] = []
    for k in keys:
        if k and k not in seen:
            seen.add(k)
            out.append(k)
    return out


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------


def _to_float(value: str) -> float | None:
    s = value.strip()
    if not s or s in {"-", "—", "NaN", "nan"}:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _to_int(value: str) -> int | None:
    f = _to_float(value)
    return int(f) if f is not None else None


def _split_des_and_name(field: str) -> tuple[str, str | None]:
    """Designation column is fixed-width 12 chars + space + 16 chars name.

    Trailing spaces are stripped. Empty name → None.
    """
    raw = field.rstrip()
    if len(raw) <= 12:
        return raw.strip(), None
    des_part = raw[:12].strip()
    name_part = raw[12:].strip()
    return des_part, (name_part or None)


def _parse_line(line: str, *, fetched_at_utc: datetime) -> AegisRiskEntry | None:
    """Return AegisRiskEntry for a valid data line, else None."""
    if not _DATA_LINE_RX.match(line):
        return None
    parts = line.split("|")
    # We expect 12 parts (11 fields + trailing empty after final '|').
    if len(parts) < 11:
        return None
    try:
        des, name = _split_des_and_name(parts[0])
        diam_m = _to_float(parts[1])
        star_raw = parts[2].strip()
        star_flag = star_raw == "*"
        vi_date = parts[3].strip() or None
        ip_max_raw = _to_float(parts[4])
        ps_max_raw = _to_float(parts[5])
        ts = _to_int(parts[6])
        vel = _to_float(parts[7])
        years = parts[8].strip()
        ip_cum_raw = _to_float(parts[9])
        ps_cum_raw = _to_float(parts[10])
    except (ValueError, IndexError):
        return None
    if not des:
        return None
    # Header rows have placeholder strings ('EEEEEEEE', 'NNN.NN', 'NN') in
    # numeric columns — those parse to None. Real data rows always supply
    # IP max + PS max + IP cum + PS cum + year range. Drop anything that
    # is missing one of those four mandatory fields.
    if (
        ip_max_raw is None
        or ps_max_raw is None
        or ip_cum_raw is None
        or ps_cum_raw is None
        or not re.match(r"^\d{4}-\d{4}$", years)
    ):
        return None
    return AegisRiskEntry(
        designation=des,
        name=name,
        diameter_m=diam_m,
        star_flag=star_flag,
        vi_max_date_utc=vi_date,
        impact_probability_max=ip_max_raw,
        palermo_scale_max=ps_max_raw,
        torino_scale=ts if ts is not None else 0,
        velocity_km_s=vel,
        impact_year_range=years,
        impact_probability_cumulative=ip_cum_raw,
        palermo_scale_cumulative=ps_cum_raw,
        fetched_at_utc=fetched_at_utc,
    )


def parse_risk_list(text: str, *, fetched_at_utc: datetime) -> list[AegisRiskEntry]:
    """Pure parser — no I/O. Used by tests and by the live client."""
    entries: list[AegisRiskEntry] = []
    for raw in text.splitlines():
        parsed = _parse_line(raw, fetched_at_utc=fetched_at_utc)
        if parsed is not None:
            entries.append(parsed)
    return entries


# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------


def _cache_path() -> Path:
    return CACHE_DIR / "risk_list.json"


def _read_cache() -> tuple[list[AegisRiskEntry], datetime] | None:
    path = _cache_path()
    if not path.exists():
        return None
    try:
        with path.open() as f:
            envelope = json.load(f)
    except Exception as exc:  # noqa: BLE001
        _log.warning("ESA cache corrupt at %s (%s)", path, exc)
        return None
    fetched_iso = envelope.get("fetched_at_utc")
    try:
        fetched = datetime.fromisoformat(fetched_iso)
    except (TypeError, ValueError):
        return None
    if datetime.now(UTC) - fetched > timedelta(hours=CACHE_TTL_HOURS):
        return None
    entries = [AegisRiskEntry.model_validate(e) for e in envelope.get("entries", [])]
    return entries, fetched


def _write_cache(entries: list[AegisRiskEntry], fetched: datetime) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "fetched_at_utc": fetched.isoformat(),
        "entry_count": len(entries),
        "entries": [e.model_dump(mode="json") for e in entries],
    }
    path = _cache_path()
    tmp = path.with_suffix(".tmp")
    with tmp.open("w") as f:
        json.dump(payload, f, default=str)
    tmp.replace(path)


# ---------------------------------------------------------------------------
# Client
# ---------------------------------------------------------------------------


class ESANeoCCClient:
    """Async client for ESA NEOCC Aegis v5 risk list."""

    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        self._client = client
        self._owns_client = client is None

    async def _fetch_text(self) -> str:
        client = self._client or httpx.AsyncClient(
            timeout=HTTP_TIMEOUT_SECONDS,
            headers={"User-Agent": USER_AGENT},
            follow_redirects=True,
        )
        try:
            resp = await client.get(ESA_RISK_LIST_URL)
            resp.raise_for_status()
            return resp.text
        finally:
            if self._owns_client and self._client is None:
                await client.aclose()

    async def get_risk_list(
        self, *, force_refresh: bool = False
    ) -> list[AegisRiskEntry]:
        """Return current risk list, populating cache on miss/expiry."""
        async with _esa_lock:
            if not force_refresh:
                cached = _read_cache()
                if cached is not None:
                    return cached[0]

            text = await self._fetch_text()
            fetched = datetime.now(UTC)
            entries = parse_risk_list(text, fetched_at_utc=fetched)
            _write_cache(entries, fetched)
            return entries

    async def get_object_in_risk_list(
        self, designation: str
    ) -> AegisRiskEntry | None:
        """Return the entry matching `designation`, or None if absent.

        Tries normalised designations in order — leading numeric form
        first, then space-stripped uppercase, then trailing name token.
        Returns None for objects ESA does not track for impact risk
        (most catalogued NEAs land here, including Apophis post-2021).
        """
        keys = _candidate_keys(designation)
        if not keys:
            return None
        entries = await self.get_risk_list()
        index = {e.designation.upper(): e for e in entries}
        for key in keys:
            match = index.get(key.upper())
            if match is not None:
                return match
        return None


_default: ESANeoCCClient | None = None


def get_esa_neocc_client() -> ESANeoCCClient:
    global _default
    if _default is None:
        _default = ESANeoCCClient()
    return _default
