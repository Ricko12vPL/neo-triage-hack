"""
Verify CURRENT-TIME sky positions of famous NEOs vs JPL Horizons.

Reproduces the exact kepler.ts math in Python, computes RA/Dec at current UTC
for each of the 18 famous NEOs in frontend/src/lib/famous_neos.ts, and compares
against JPL Horizons OBSERVER ephemerides (geocentric, 500@399) for the same
moment. Writes a Markdown report at
docs/verification/current-positions-verification.md.

The goal is to confirm that Sky View + Orbit View render objects where they
actually are TONIGHT — not where they were on 2000-01-01. The underlying JS
already propagates via heliocentricPositionAtJD(elements, currentJD()); this
script is an independent Python re-implementation to catch any regression.

Tolerance: 2.0° sky separation. Visualization-grade; mean-anomaly propagation
with J2000 epoch and no planetary perturbations can't do better for decade-
old elements.

Usage:
    python scripts/verify_current_positions.py
"""

from __future__ import annotations

import json
import math
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

J2000_JD = 2451545.0
OBLIQUITY_DEG = 23.4392811
EARTH_MEAN_MOTION_DEG_PER_DAY = 0.9856474
EARTH_MEAN_LONGITUDE_J2000_DEG = 100.46435
EARTH_LON_PERIHELION_DEG = 102.94719
EARTH_ECCENTRICITY = 0.01671022
EARTH_A_AU = 1.000_001_018

HORIZONS_API = "https://ssd.jpl.nasa.gov/api/horizons.api"

HORIZONS_COMMANDS: dict[str, str] = {
    "Bennu": "101955",
    "Apophis": "99942",
    "Didymos": "65803",
    "Ryugu": "162173",
    "Itokawa": "25143",
    "Eros": "433",
    "Psyche": "16",
    "Ceres": "1;",
    "Vesta": "4;",
    "Geographos": "1620",
    "Toutatis": "4179",
    "Dinkinesh": "152830",
    "Annefrank": "5535",
    "Braille": "9969",
    "Gaspra": "951",
    "Ida": "243;",
    "Tempel 1": "DES=9P; CAP",
    "67P / Churyumov-Gerasimenko": "DES=67P; CAP",
}


def parse_famous_neos(ts_path: Path) -> list[dict]:
    """Extract {name, orbit{...}, orbital_epoch_jd} from famous_neos.ts."""
    src = ts_path.read_text()
    entries = []
    # Match name through orbit block plus the provenance fields that
    # follow it. orbital_epoch_jd may be at any reasonable JD (not just
    # J2000) — we capture whatever the file says.
    pat = re.compile(
        r'name:\s*"(?P<name>[^"]+)",.*?'
        r'orbit:\s*\{(?P<orbit>.*?)\},\s*[^\n]*\n'
        r'(?P<trailer>(?:\s*\w+:\s*[^\n]*\n){0,8}?)'
        r'\s*orbit_class:',
        re.DOTALL,
    )
    num_pat = re.compile(
        r"(\w+)\s*:\s*([-+]?\d+\.?\d*(?:[eE][-+]?\d+)?)"
    )
    for m in pat.finditer(src):
        name = m.group("name")
        fields = {k: float(v) for k, v in num_pat.findall(m.group("orbit"))}
        trailer = m.group("trailer") or ""
        trailer_fields = {k: float(v) for k, v in num_pat.findall(trailer)}
        epoch_jd = trailer_fields.get("orbital_epoch_jd", 2451545.0)
        if "semi_major_axis_au" in fields:
            entries.append({
                "name": name,
                "orbit": fields,
                "orbital_epoch_jd": epoch_jd,
            })
    return entries


# ---------------------------------------------------------------------------
# Kepler math — direct Python translation of frontend/src/lib/kepler.ts
# ---------------------------------------------------------------------------

def solve_kepler(M_rad: float, e: float, tol: float = 1e-10, max_iter: int = 60) -> float:
    M = M_rad % (2 * math.pi)
    if M > math.pi:
        M -= 2 * math.pi
    if M < -math.pi:
        M += 2 * math.pi
    E = M + e * math.sin(M)
    for _ in range(max_iter):
        f = E - e * math.sin(E) - M
        fp = 1 - e * math.cos(E)
        dE = f / fp
        E -= dE
        if abs(dE) < tol:
            return E
    return E


def ecc_to_true(E: float, e: float) -> float:
    cosE, sinE = math.cos(E), math.sin(E)
    cos_nu = (cosE - e) / (1 - e * cosE)
    sin_nu = (math.sqrt(1 - e * e) * sinE) / (1 - e * cosE)
    return math.atan2(sin_nu, cos_nu)


def helio_xyz(a_au: float, e: float, i_rad: float, Omega_rad: float,
              omega_rad: float, nu_rad: float) -> tuple[float, float, float]:
    cn, sn = math.cos(nu_rad), math.sin(nu_rad)
    r = (a_au * (1 - e * e)) / (1 + e * cn)
    x_orb, y_orb = r * cn, r * sn
    cO, sO = math.cos(Omega_rad), math.sin(Omega_rad)
    cw, sw = math.cos(omega_rad), math.sin(omega_rad)
    ci, si = math.cos(i_rad), math.sin(i_rad)
    x = (cO * cw - sO * sw * ci) * x_orb + (-cO * sw - sO * cw * ci) * y_orb
    y = (sO * cw + cO * sw * ci) * x_orb + (-sO * sw + cO * cw * ci) * y_orb
    z = sw * si * x_orb + cw * si * y_orb
    return (x, y, z)


def helio_position_at_jd(orbit: dict, jd: float, epoch_jd: float = J2000_JD) -> tuple[float, float, float]:
    period_days = orbit["orbital_period_years"] * 365.25
    n_dpd = 360.0 / period_days
    dt = jd - epoch_jd
    # Accept both new (mean_anomaly_deg_epoch) and legacy (mean_anomaly_deg_j2000).
    M_at_epoch = orbit.get("mean_anomaly_deg_epoch")
    if M_at_epoch is None:
        M_at_epoch = orbit["mean_anomaly_deg_j2000"]
    M_deg = M_at_epoch + n_dpd * dt
    M_rad = math.radians(M_deg)
    E = solve_kepler(M_rad, orbit["eccentricity"])
    nu = ecc_to_true(E, orbit["eccentricity"])
    return helio_xyz(
        orbit["semi_major_axis_au"],
        orbit["eccentricity"],
        math.radians(orbit["inclination_deg"]),
        math.radians(orbit["longitude_ascending_node_deg"]),
        math.radians(orbit["argument_periapsis_deg"]),
        nu,
    )


def earth_helio_at_jd(jd: float) -> tuple[float, float, float]:
    dt = jd - J2000_JD
    L_deg = EARTH_MEAN_LONGITUDE_J2000_DEG + EARTH_MEAN_MOTION_DEG_PER_DAY * dt
    M_deg = L_deg - EARTH_LON_PERIHELION_DEG
    M_rad = math.radians(M_deg)
    E = solve_kepler(M_rad, EARTH_ECCENTRICITY)
    nu = ecc_to_true(E, EARTH_ECCENTRICITY)
    return helio_xyz(
        EARTH_A_AU,
        EARTH_ECCENTRICITY,
        0.0,
        0.0,
        math.radians(EARTH_LON_PERIHELION_DEG),
        nu,
    )


def helio_to_radec(body: tuple[float, float, float],
                   earth: tuple[float, float, float]) -> tuple[float, float]:
    dx = body[0] - earth[0]
    dy = body[1] - earth[1]
    dz = body[2] - earth[2]
    eps = math.radians(OBLIQUITY_DEG)
    x_eq = dx
    y_eq = dy * math.cos(eps) - dz * math.sin(eps)
    z_eq = dy * math.sin(eps) + dz * math.cos(eps)
    r = math.sqrt(x_eq * x_eq + y_eq * y_eq + z_eq * z_eq)
    dec_rad = math.asin(z_eq / r)
    ra_rad = math.atan2(y_eq, x_eq)
    if ra_rad < 0:
        ra_rad += 2 * math.pi
    return (math.degrees(ra_rad), math.degrees(dec_rad))


def date_to_jd(dt: datetime) -> float:
    return dt.timestamp() / 86400.0 + 2440587.5


# ---------------------------------------------------------------------------
# JPL Horizons OBSERVER mode fetch — RA/Dec at current UTC
# ---------------------------------------------------------------------------

def fetch_horizons_radec(command: str, start_utc: datetime) -> tuple[float, float] | None:
    """Fetch geocentric RA/Dec at start_utc from Horizons OBSERVER ephem.

    Uses QUANTITIES='1' (astrometric RA/Dec), STEP_SIZE='1m', span 2 min.
    Parses the $$SOE..$$EOE data block.
    """
    stop_utc = start_utc.replace(minute=(start_utc.minute + 2) % 60)
    if stop_utc < start_utc:  # hour rollover
        stop_utc = stop_utc.replace(hour=(start_utc.hour + 1) % 24)
    params = {
        "format": "text",
        "COMMAND": f"'{command}'",
        "MAKE_EPHEM": "YES",
        "EPHEM_TYPE": "OBSERVER",
        "CENTER": "'500@399'",  # geocenter
        "START_TIME": f"'{start_utc.strftime('%Y-%m-%d %H:%M')}'",
        "STOP_TIME": f"'{stop_utc.strftime('%Y-%m-%d %H:%M')}'",
        "STEP_SIZE": "'1m'",
        "QUANTITIES": "'1'",
        "ANG_FORMAT": "'DEG'",
        "CSV_FORMAT": "YES",
    }
    url = HORIZONS_API + "?" + urllib.parse.urlencode(params)
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            text = r.read().decode("utf-8", errors="replace")
    except Exception as exc:
        print(f"  [{command}] Horizons fetch FAILED: {exc}")
        return None
    m = re.search(r"\$\$SOE\s*(.*?)\$\$EOE", text, re.DOTALL)
    if not m:
        # Log a sample for debugging
        print(f"  [{command}] SOE block not found in response (first 400 chars):")
        print(text[:400])
        return None
    block = m.group(1).strip()
    first_line = block.splitlines()[0]
    # CSV columns: Date, (blank), RA, DEC  — 4 fields minimum
    parts = [p.strip() for p in first_line.split(",")]
    # Find first two fields that parse as floats AND look like RA (0..360) and DEC (-90..90)
    nums = []
    for p in parts:
        try:
            nums.append(float(p))
        except ValueError:
            pass
    # Heuristic: first float in [0, 360] is RA, next in [-90, 90] is DEC
    ra = dec = None
    for i, n in enumerate(nums):
        if ra is None and 0.0 <= n <= 360.0:
            ra = n
            continue
        if ra is not None and -90.0 <= n <= 90.0:
            dec = n
            break
    if ra is None or dec is None:
        print(f"  [{command}] Could not parse RA/Dec from: {first_line[:200]}")
        return None
    return (ra, dec)


def angular_sep_deg(ra1: float, dec1: float, ra2: float, dec2: float) -> float:
    r1, d1 = math.radians(ra1), math.radians(dec1)
    r2, d2 = math.radians(ra2), math.radians(dec2)
    cos_theta = (
        math.sin(d1) * math.sin(d2)
        + math.cos(d1) * math.cos(d2) * math.cos(r1 - r2)
    )
    cos_theta = max(-1.0, min(1.0, cos_theta))
    return math.degrees(math.acos(cos_theta))


def main() -> int:
    repo = Path(__file__).resolve().parents[1]
    ts_path = repo / "frontend" / "src" / "lib" / "famous_neos.ts"
    out_path = repo / "docs" / "verification" / "current-positions-verification.md"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    now_utc = datetime.now(timezone.utc).replace(second=0, microsecond=0)
    jd_now = date_to_jd(now_utc)

    print(f"UTC now:    {now_utc.isoformat()}")
    print(f"JD now:     {jd_now:.6f}")
    print(f"Days since J2000: {jd_now - J2000_JD:.2f}\n")

    entries = parse_famous_neos(ts_path)
    print(f"Parsed {len(entries)} famous NEOs from {ts_path.name}.\n")
    if not entries:
        print("FATAL: parser found 0 entries. Check regex against file format.")
        return 2

    earth_now = earth_helio_at_jd(jd_now)

    results = []
    TOL_DEG = 2.0  # Visualization-grade tolerance.
    for idx, entry in enumerate(entries, 1):
        name = entry["name"]
        print(f"[{idx:2d}/{len(entries)}] {name:40s}", end=" ", flush=True)
        if name not in HORIZONS_COMMANDS:
            print("SKIP (no Horizons command)")
            results.append({"name": name, "status": "SKIP",
                            "reason": "no Horizons command"})
            continue
        body_now = helio_position_at_jd(
            entry["orbit"], jd_now, entry["orbital_epoch_jd"],
        )
        our_ra, our_dec = helio_to_radec(body_now, earth_now)

        jpl = fetch_horizons_radec(HORIZONS_COMMANDS[name], now_utc)
        time.sleep(0.6)  # Be polite to NASA
        if jpl is None:
            print("FAIL (Horizons)")
            results.append({
                "name": name, "status": "FAIL", "our_ra": our_ra,
                "our_dec": our_dec, "reason": "Horizons fetch failed",
            })
            continue
        jpl_ra, jpl_dec = jpl
        sep = angular_sep_deg(our_ra, our_dec, jpl_ra, jpl_dec)
        ok = sep <= TOL_DEG
        verdict = "PASS" if ok else "FAIL"
        print(f"ours=({our_ra:7.2f},{our_dec:+6.2f}) jpl=({jpl_ra:7.2f},"
              f"{jpl_dec:+6.2f}) Δ={sep:5.2f}° {verdict}")
        results.append({
            "name": name, "status": verdict,
            "our_ra": our_ra, "our_dec": our_dec,
            "jpl_ra": jpl_ra, "jpl_dec": jpl_dec,
            "sep_deg": sep,
        })

    # Write report
    n_pass = sum(1 for r in results if r["status"] == "PASS")
    n_fail = sum(1 for r in results if r["status"] == "FAIL")
    n_skip = sum(1 for r in results if r["status"] == "SKIP")

    lines = [
        "# Current-time position verification",
        "",
        f"**Generated:** {now_utc.isoformat()}  ",
        f"**JD:** {jd_now:.6f}  ",
        f"**Days since J2000:** {jd_now - J2000_JD:.2f}  ",
        f"**Tolerance:** {TOL_DEG}° angular separation on the celestial sphere",
        "",
        "## Summary",
        "",
        f"- Pass: **{n_pass}** / {len(results)}",
        f"- Fail: **{n_fail}** / {len(results)}",
        f"- Skip: **{n_skip}** / {len(results)}",
        "",
        "## Method",
        "",
        "1. Parse orbital elements from `frontend/src/lib/famous_neos.ts`.",
        "2. Compute current RA/Dec using a Python re-implementation of"
        " `frontend/src/lib/kepler.ts` (`heliocentricPositionAtJD` +"
        " `heliocentricToGeocentricCelestialSphere`).",
        "3. Fetch geocentric astrometric RA/Dec from JPL Horizons"
        " OBSERVER mode (CENTER='500@399') for the exact same UTC.",
        "4. Compute angular separation via spherical law of cosines.",
        "",
        "## Per-object results",
        "",
        "| # | Name | Our RA | Our Dec | JPL RA | JPL Dec | Δ (deg) | Verdict |",
        "|---|---|--:|--:|--:|--:|--:|:---:|",
    ]
    for i, r in enumerate(results, 1):
        if r["status"] == "SKIP":
            lines.append(f"| {i} | {r['name']} | — | — | — | — | — | SKIP |")
            continue
        if r["status"] == "FAIL" and "jpl_ra" not in r:
            lines.append(
                f"| {i} | {r['name']} | {r['our_ra']:.2f} |"
                f" {r['our_dec']:+.2f} | — | — | — | HORIZONS FAIL |"
            )
            continue
        verdict_icon = "PASS" if r["status"] == "PASS" else "FAIL"
        lines.append(
            f"| {i} | {r['name']} | {r['our_ra']:.2f} | {r['our_dec']:+.2f} |"
            f" {r['jpl_ra']:.2f} | {r['jpl_dec']:+.2f} |"
            f" {r['sep_deg']:.2f} | {verdict_icon} |"
        )
    lines += [
        "",
        "## Interpretation",
        "",
        "Positions are visualization-grade: elements are osculating at J2000"
        " epoch, propagated by pure Kepler evolution (no planetary"
        " perturbations). For objects with small-to-moderate perturbations"
        " (main-belt asteroids, most NEOs), this gives < 2° sky error over"
        " decades. For chaotic orbits (e.g. Toutatis, 67P after jovian"
        " encounters) larger deviations are expected and acceptable for"
        " a demo.",
        "",
        "## Conclusion",
        "",
    ]
    if n_fail == 0:
        lines.append(
            f"All {n_pass} verified objects agree with JPL Horizons within"
            f" {TOL_DEG}° at the time of this run. Sky View and Orbit View"
            " render objects where they actually are tonight, not at J2000."
        )
    else:
        lines.append(
            f"{n_fail} object(s) exceed the {TOL_DEG}° tolerance. Inspect"
            " table — likely candidates are high-eccentricity / chaotic"
            " orbits whose J2000 osculating elements drift quickly. Update"
            " `famous_neos.ts` by re-running"
            " `python scripts/verify_jpl_orbital_elements.py` if the object"
            " matters to the demo."
        )
    lines.append("")
    out_path.write_text("\n".join(lines))
    print(f"\nReport written to {out_path.relative_to(repo)}")
    print(f"Summary: {n_pass} PASS / {n_fail} FAIL / {n_skip} SKIP "
          f"(tolerance {TOL_DEG}°)")
    return 0 if n_fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
