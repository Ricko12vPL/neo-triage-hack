"""Live NEOCP candidate fetcher.

Pulls the current Minor Planet Center NEOCP list, computes on-sky
motion rates from actual observations, and returns Candidate objects
ready for the ranker and briefing engine.

Data source: https://www.minorplanetcenter.net/iau/NEO/neocp.txt
Rate source:  https://www.minorplanetcenter.net/cgi-bin/showobsorbs.cgi

Caches results for CACHE_TTL_MINUTES to avoid hammering the MPC.
Falls back to MOCK_CANDIDATES if the MPC is unreachable.
"""
from __future__ import annotations

import asyncio
import math
from datetime import UTC, datetime, timedelta

import httpx

from backend.models.schemas import Candidate

NEOCP_LIST_URL = "https://www.minorplanetcenter.net/iau/NEO/neocp.txt"
NEOCP_OBS_URL = (
    "https://www.minorplanetcenter.net/cgi-bin/showobsorbs.cgi?Obj={trksub}&obs=y"
)
CACHE_TTL_MINUTES = 15
_OBLIQUITY_RAD = math.radians(23.439291111)  # J2000 mean obliquity
RATE_FALLBACK = 2.0  # arcsec/min used when obs fetch fails


_cache: list[Candidate] = []
_cache_at: datetime | None = None


# ---------------------------------------------------------------------------
# Coordinate helpers
# ---------------------------------------------------------------------------

def _ra_hours_to_deg(ra_hours: float) -> float:
    return ra_hours * 15.0


def _ecliptic_lat(ra_deg: float, dec_deg: float) -> float:
    ra_r = math.radians(ra_deg)
    dec_r = math.radians(dec_deg)
    sin_lat = (
        math.sin(dec_r) * math.cos(_OBLIQUITY_RAD)
        - math.cos(dec_r) * math.sin(_OBLIQUITY_RAD) * math.sin(ra_r)
    )
    return math.degrees(math.asin(max(-1.0, min(1.0, sin_lat))))


def _ra_hms_to_deg(ra_str: str) -> float:
    """'HH MM SS.SSS' → decimal degrees."""
    h, m, s = ra_str.split()
    return (float(h) + float(m) / 60.0 + float(s) / 3600.0) * 15.0


def _dec_dms_to_deg(dec_str: str) -> float:
    """'+DD MM SS.SS' → decimal degrees (signed)."""
    sign = -1.0 if dec_str.lstrip()[0] == "-" else 1.0
    d, m, s = dec_str.lstrip("+-").split()
    return sign * (float(d) + float(m) / 60.0 + float(s) / 3600.0)


def _parse_obs_datetime(date_str: str) -> datetime:
    """'YYYY MM DD.ddddd' → UTC datetime."""
    parts = date_str.split()
    year, month = int(parts[0]), int(parts[1])
    day_frac = float(parts[2])
    day = int(day_frac)
    extra_sec = (day_frac - day) * 86400.0
    return datetime(year, month, day, tzinfo=UTC) + timedelta(seconds=extra_sec)


# ---------------------------------------------------------------------------
# NEOCP list parser
# ---------------------------------------------------------------------------

def _parse_neocp_line(line: str) -> dict | None:
    """Parse one line of neocp.txt into a partial candidate dict.

    Format (space-delimited, last 4 tokens are NObs, Arc, H, not_seen):
      trksub score YYYY MM DD.d ra_h dec_d vmag <status text> NObs arc_days H not_seen
    """
    parts = line.split()
    if len(parts) < 12:
        return None
    try:
        trksub = parts[0]
        score = int(parts[1])
        year, month = int(parts[2]), int(parts[3])
        day_frac = float(parts[4])
        day = int(day_frac)
        extra_sec = (day_frac - day) * 86400.0
        discovery_dt = datetime(year, month, day, tzinfo=UTC) + timedelta(seconds=extra_sec)

        ra_deg = _ra_hours_to_deg(float(parts[5]))
        dec_deg = float(parts[6])
        vmag = float(parts[7])

        # Last 4 tokens are always: NObs arc_days H not_seen
        n_obs = int(parts[-4])
        arc_days = float(parts[-3])
        arc_min = max(1.0, arc_days * 24.0 * 60.0)
        ecl_lat = _ecliptic_lat(ra_deg, dec_deg)

        return {
            "trksub": trksub,
            "digest2_neo_noid": min(100, max(0, score)),
            "ra_deg": round(ra_deg, 4),
            "dec_deg": round(dec_deg, 4),
            "mean_magnitude_v": vmag,
            "n_observations": n_obs,
            "arc_length_minutes": round(arc_min, 1),
            "ecliptic_latitude_deg": round(ecl_lat, 2),
            "first_obs_datetime": discovery_dt,
        }
    except (ValueError, IndexError):
        return None


# ---------------------------------------------------------------------------
# Rate + observatory-code from observations
# ---------------------------------------------------------------------------

async def _fetch_rate_and_code(
    client: httpx.AsyncClient, trksub: str
) -> tuple[float, str]:
    """Return (rate_arcsec_min, observatory_code) for a NEOCP candidate.

    Fetches the MPC observation page, extracts first and last CCD observations,
    and computes total on-sky motion / time elapsed.
    """
    url = NEOCP_OBS_URL.format(trksub=trksub)
    try:
        resp = await client.get(url, timeout=10.0)
        lines = [
            ln
            for ln in resp.text.splitlines()
            if len(ln) >= 80 and trksub in ln[5:13]
        ]
        if len(lines) < 2:
            return RATE_FALLBACK, "???"

        first, last = lines[0], lines[-1]

        # Observatory code: MPC 80-col format cols 78-80 (1-indexed) = 77:80 (0-indexed)
        obs_code = last[77:80].strip() or "???"

        # Date: cols 16-32 (1-indexed) = 15:32 (0-indexed)
        t1 = _parse_obs_datetime(first[15:32].strip())
        t2 = _parse_obs_datetime(last[15:32].strip())

        # RA: cols 33-44 (1-indexed) = 32:44 (0-indexed)
        ra1 = _ra_hms_to_deg(first[32:44].strip())
        ra2 = _ra_hms_to_deg(last[32:44].strip())

        # Dec: cols 45-56 (1-indexed) = 44:56 (0-indexed)
        dec1 = _dec_dms_to_deg(first[44:56].strip())
        dec2 = _dec_dms_to_deg(last[44:56].strip())

        dt_min = (t2 - t1).total_seconds() / 60.0
        if dt_min < 0.5:
            return RATE_FALLBACK, obs_code

        mid_dec_rad = math.radians((dec1 + dec2) / 2.0)
        dra_arcsec = (ra2 - ra1) * 3600.0 * math.cos(mid_dec_rad)
        ddec_arcsec = (dec2 - dec1) * 3600.0
        rate = math.sqrt(dra_arcsec**2 + ddec_arcsec**2) / dt_min

        return round(rate, 2), obs_code

    except Exception:
        return RATE_FALLBACK, "???"


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

async def fetch_neocp_candidates(limit: int = 20) -> list[Candidate]:
    """Return up to `limit` live NEOCP candidates, sorted by digest2 score desc.

    Results are cached for CACHE_TTL_MINUTES. Falls back to MOCK_CANDIDATES
    if the MPC is unreachable or returns malformed data.
    """
    global _cache, _cache_at

    now = datetime.now(UTC)
    if _cache and _cache_at and (now - _cache_at) < timedelta(minutes=CACHE_TTL_MINUTES):
        return _cache[:limit]

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(NEOCP_LIST_URL, timeout=15.0)
            resp.raise_for_status()

            raw = [_parse_neocp_line(ln) for ln in resp.text.strip().splitlines()]
            parsed = [r for r in raw if r is not None]

            # Sort by score desc; take top `limit` for rate fetching
            parsed.sort(key=lambda x: x["digest2_neo_noid"], reverse=True)
            top = parsed[:limit]

            # Concurrently fetch rates + observatory codes
            tasks = [_fetch_rate_and_code(client, p["trksub"]) for p in top]
            results: list[tuple[float, str] | BaseException] = list(
                await asyncio.gather(*tasks, return_exceptions=True)
            )

            candidates: list[Candidate] = []
            for data, result in zip(top, results, strict=True):
                if isinstance(result, BaseException):
                    rate, obs_code = RATE_FALLBACK, "???"
                else:
                    rate, obs_code = result

                candidates.append(
                    Candidate(
                        trksub=data["trksub"],
                        ra_deg=data["ra_deg"],
                        dec_deg=data["dec_deg"],
                        mean_magnitude_v=data["mean_magnitude_v"],
                        rate_arcsec_min=rate,
                        observatory_code=obs_code,
                        first_obs_datetime=data["first_obs_datetime"],
                        n_observations=data["n_observations"],
                        arc_length_minutes=data["arc_length_minutes"],
                        digest2_neo_noid=data["digest2_neo_noid"],
                        ecliptic_latitude_deg=data["ecliptic_latitude_deg"],
                    )
                )

        _cache = candidates
        _cache_at = now
        return candidates[:limit]

    except Exception:
        # MPC unreachable — fall back to mock data so demo never breaks
        from backend.data.mock_candidates import MOCK_CANDIDATES
        return MOCK_CANDIDATES[:limit]
