"""
Verify orbital elements in frontend/src/lib/famous_neos.ts against JPL Horizons.

Fetches authoritative heliocentric ecliptic osculating elements from the
NASA/JPL Horizons web API and compares against the local catalog. The
reference epoch is configurable (defaults to today 12:00 UTC). Current-epoch
elements give dramatically better sky accuracy than J2000 elements because
they bake in 26 years of perturbation history.

Writes a Markdown report at docs/verification/jpl-orbital-elements-verification.md
and a patch file at reports/jpl-patches.txt ready for apply_jpl_patches.py.

Usage:
    python scripts/verify_jpl_orbital_elements.py                 # epoch = today 12:00 UTC
    python scripts/verify_jpl_orbital_elements.py --epoch j2000   # legacy mode
    python scripts/verify_jpl_orbital_elements.py --epoch 2026-04-24
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

AU_KM = 1.495978707e8
J2000_JD = 2451545.0

HORIZONS_API = "https://ssd.jpl.nasa.gov/api/horizons.api"

# Mapping of catalog `name` -> Horizons COMMAND string.
# For numbered asteroids we use the bare number (Horizons treats it as the
# record number). Comets need the 'DES=' form with semicolon.
HORIZONS_COMMANDS: dict[str, str] = {
    "Bennu": "101955",
    "Apophis": "99942",
    "Didymos": "65803",
    "Ryugu": "162173",
    "Itokawa": "25143",
    "Eros": "433",
    "Psyche": "16",
    "Ceres": "1;",             # Ceres needs the semicolon disambiguation
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


@dataclass
class HorizonsElements:
    """J2000 heliocentric ecliptic osculating elements from Horizons."""
    semi_major_axis_au: float
    eccentricity: float
    inclination_deg: float
    longitude_ascending_node_deg: float
    argument_periapsis_deg: float
    mean_anomaly_deg: float
    orbital_period_years: float
    epoch_jd: float
    source_block: str


def fetch_horizons_elements(command: str, epoch_date: datetime) -> HorizonsElements:
    """Query Horizons API for osculating elements at `epoch_date` and parse.

    Horizons returns the first sample inside [start, stop]; we request a
    2-day window bracketing the epoch and take the first ($$SOE) record,
    whose JD is used as the canonical epoch_jd for downstream propagation.
    """
    start_str = epoch_date.strftime("%Y-%m-%d")
    stop_str = (epoch_date + timedelta(days=1)).strftime("%Y-%m-%d")
    params = {
        "format": "json",
        "COMMAND": f"'{command}'",
        "OBJ_DATA": "'NO'",
        "EPHEM_TYPE": "'ELEMENTS'",
        "CENTER": "'500@10'",
        "START_TIME": f"'{start_str}'",
        "STOP_TIME": f"'{stop_str}'",
        "STEP_SIZE": "'1 d'",
    }
    qs = "&".join(f"{k}={urllib.parse.quote(v, safe='')}" for k, v in params.items())
    url = f"{HORIZONS_API}?{qs}"

    with urllib.request.urlopen(url, timeout=30) as resp:
        payload = json.loads(resp.read().decode())

    text = payload.get("result", "")
    if "No matches found" in text or "$$SOE" not in text:
        raise RuntimeError(f"Horizons returned no data for COMMAND={command}\n{text[:600]}")

    # Locate $$SOE block; take first data line (J2000 epoch).
    soe_idx = text.index("$$SOE")
    eoe_idx = text.index("$$EOE")
    block = text[soe_idx + len("$$SOE"):eoe_idx].strip()

    # Take first "record" (three contiguous non-blank data lines plus JD
    # header line).
    lines = [ln.strip() for ln in block.splitlines() if ln.strip()]
    # First line: "2451544.500000000 = A.D. 2000-Jan-01 00:00:00.0000 TDB"
    jd_match = re.match(r"(\d+\.\d+)", lines[0])
    if not jd_match:
        raise RuntimeError(f"Could not parse epoch line: {lines[0]}")
    epoch_jd = float(jd_match.group(1))

    # Next 3 lines contain EC, QR, IN / OM, W, Tp / N, MA, TA / A, AD, PR
    data_str = " ".join(lines[1:5])

    def extract(token: str) -> float:
        # Anchor before the token so "A" does not match "MA", "TA", "QR" etc.
        match = re.search(rf"(?:^|\s)\b{token}\s*=\s*([-+]?\d+\.\d+E?[-+]?\d*)", data_str)
        if not match:
            raise RuntimeError(f"Could not extract {token} from:\n{data_str}")
        return float(match.group(1))

    eccentricity = extract("EC")
    inclination = extract("IN")
    omega_long_node = extract("OM")
    arg_peri = extract("W")
    mean_anomaly = extract("MA")
    a_km = extract("A")
    pr_seconds = extract("PR")

    a_au = a_km / AU_KM
    period_years = pr_seconds / (365.25 * 86400.0)

    # Normalise angles to [0, 360).
    def norm(x: float) -> float:
        v = x % 360.0
        return v + 360.0 if v < 0 else v

    return HorizonsElements(
        semi_major_axis_au=a_au,
        eccentricity=eccentricity,
        inclination_deg=inclination,
        longitude_ascending_node_deg=norm(omega_long_node),
        argument_periapsis_deg=norm(arg_peri),
        mean_anomaly_deg=norm(mean_anomaly),
        orbital_period_years=period_years,
        epoch_jd=epoch_jd,
        source_block=data_str,
    )


def parse_local_catalog(ts_path: Path) -> list[dict]:
    """Extract name + orbital elements from the TypeScript catalog.

    Not a full parser — works because the file uses a predictable literal
    shape generated by us.
    """
    text = ts_path.read_text()
    entries = []

    entry_pattern = re.compile(
        r"\{\s*name:\s*\"(?P<name>[^\"]+)\",\s*"
        r"designation:\s*\"(?P<designation>[^\"]+)\",.*?"
        r"orbit:\s*\{(?P<orbit>.*?)\},\s*"
        r".*?orbit_class:\s*\"(?P<orbit_class>[^\"]+)\"",
        re.DOTALL,
    )

    for m in entry_pattern.finditer(text):
        orbit_body = m.group("orbit")
        def grab(field: str) -> float:
            mm = re.search(rf"{field}:\s*([-+]?\d+\.?\d*)", orbit_body)
            if not mm:
                raise RuntimeError(f"Field {field} missing for {m.group('name')}")
            return float(mm.group(1))

        entries.append({
            "name": m.group("name"),
            "designation": m.group("designation"),
            "orbit_class": m.group("orbit_class"),
            "semi_major_axis_au": grab("semi_major_axis_au"),
            "eccentricity": grab("eccentricity"),
            "inclination_deg": grab("inclination_deg"),
            "longitude_ascending_node_deg": grab("longitude_ascending_node_deg"),
            "argument_periapsis_deg": grab("argument_periapsis_deg"),
            "mean_anomaly_deg_epoch": grab("mean_anomaly_deg_epoch"),
            "orbital_period_years": grab("orbital_period_years"),
        })

    return entries


def compare(local: dict, jpl: HorizonsElements) -> dict:
    """Return a dict describing diffs for this object."""
    def angle_diff(a: float, b: float) -> float:
        d = (a - b) % 360.0
        if d > 180.0:
            d -= 360.0
        return d

    rel_diff = lambda x, y: (x - y) / y if y != 0 else float("inf")

    return {
        "name": local["name"],
        "orbit_class": local["orbit_class"],
        "a": (local["semi_major_axis_au"], jpl.semi_major_axis_au,
              rel_diff(local["semi_major_axis_au"], jpl.semi_major_axis_au)),
        "e": (local["eccentricity"], jpl.eccentricity,
              local["eccentricity"] - jpl.eccentricity),
        "i": (local["inclination_deg"], jpl.inclination_deg,
              local["inclination_deg"] - jpl.inclination_deg),
        "Omega": (local["longitude_ascending_node_deg"],
                  jpl.longitude_ascending_node_deg,
                  angle_diff(local["longitude_ascending_node_deg"],
                             jpl.longitude_ascending_node_deg)),
        "omega": (local["argument_periapsis_deg"],
                  jpl.argument_periapsis_deg,
                  angle_diff(local["argument_periapsis_deg"],
                             jpl.argument_periapsis_deg)),
        "MA": (local["mean_anomaly_deg_epoch"], jpl.mean_anomaly_deg,
               angle_diff(local["mean_anomaly_deg_epoch"],
                          jpl.mean_anomaly_deg)),
        "period": (local["orbital_period_years"], jpl.orbital_period_years,
                   rel_diff(local["orbital_period_years"], jpl.orbital_period_years)),
        "source_block": jpl.source_block,
    }


def verdict(cmp: dict) -> list[str]:
    """Per-field pass/fail."""
    problems = []
    if abs(cmp["a"][2]) > 0.005:  # 0.5% relative
        problems.append(f"a Δ={cmp['a'][2]*100:+.2f}%")
    if abs(cmp["e"][2]) > 0.01:
        problems.append(f"e Δ={cmp['e'][2]:+.4f}")
    if abs(cmp["i"][2]) > 0.5:
        problems.append(f"i Δ={cmp['i'][2]:+.2f}°")
    if abs(cmp["Omega"][2]) > 0.5:
        problems.append(f"Ω Δ={cmp['Omega'][2]:+.2f}°")
    if abs(cmp["omega"][2]) > 0.5:
        problems.append(f"ω Δ={cmp['omega'][2]:+.2f}°")
    if abs(cmp["MA"][2]) > 0.5:
        problems.append(f"MA Δ={cmp['MA'][2]:+.2f}°")
    if abs(cmp["period"][2]) > 0.005:
        problems.append(f"T Δ={cmp['period'][2]*100:+.2f}%")
    return problems


def format_patch(name: str, jpl: HorizonsElements, fetched_date: str) -> str:
    """Emit the replacement orbital-elements block matching the TS shape."""
    return (
        "    orbit: {\n"
        f"      semi_major_axis_au: {jpl.semi_major_axis_au:.6f},\n"
        f"      eccentricity: {jpl.eccentricity:.6f},\n"
        f"      inclination_deg: {jpl.inclination_deg:.4f},\n"
        f"      longitude_ascending_node_deg: {jpl.longitude_ascending_node_deg:.4f},\n"
        f"      argument_periapsis_deg: {jpl.argument_periapsis_deg:.4f},\n"
        f"      mean_anomaly_deg_epoch: {jpl.mean_anomaly_deg:.4f},\n"
        f"      orbital_period_years: {jpl.orbital_period_years:.4f},\n"
        f"    }},  // JPL Horizons @ JD {jpl.epoch_jd:.1f}, fetched {fetched_date}"
    )


def parse_epoch_arg(s: str) -> datetime:
    """Accepts 'j2000', 'today', or an ISO date YYYY-MM-DD (UTC noon)."""
    s = s.strip().lower()
    if s in ("j2000", "2000-01-01"):
        return datetime(2000, 1, 1, 12, 0, tzinfo=timezone.utc)
    if s == "today":
        return datetime.now(timezone.utc).replace(hour=12, minute=0, second=0, microsecond=0)
    return datetime.strptime(s, "%Y-%m-%d").replace(hour=12, tzinfo=timezone.utc)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--epoch",
        default="today",
        help="Epoch to request elements at: 'j2000', 'today' (default), or YYYY-MM-DD",
    )
    args = parser.parse_args()
    epoch_dt = parse_epoch_arg(args.epoch)
    fetched_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    print(f"Requesting elements at epoch: {epoch_dt.isoformat()}", file=sys.stderr)

    repo = Path(__file__).resolve().parent.parent
    ts_path = repo / "frontend/src/lib/famous_neos.ts"
    report_path = repo / "docs/verification/jpl-orbital-elements-verification.md"
    patches_path = repo / "reports/jpl-patches.txt"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    patches_path.parent.mkdir(parents=True, exist_ok=True)

    local = parse_local_catalog(ts_path)
    print(f"Parsed {len(local)} objects from catalog.", file=sys.stderr)

    comparisons: list[dict] = []
    patches: list[str] = []
    failed_fetches: list[str] = []

    for entry in local:
        name = entry["name"]
        command = HORIZONS_COMMANDS.get(name)
        if not command:
            print(f"[SKIP] No Horizons mapping for {name}", file=sys.stderr)
            failed_fetches.append(name)
            continue
        print(f"[FETCH] {name} ({command}) ...", file=sys.stderr)
        try:
            jpl = fetch_horizons_elements(command, epoch_dt)
            cmp = compare(entry, jpl)
            comparisons.append(cmp)
            patches.append(f"// {name}\n{format_patch(name, jpl, fetched_date)}\n")
        except Exception as exc:
            print(f"[FAIL] {name}: {exc}", file=sys.stderr)
            failed_fetches.append(name)
        time.sleep(0.8)  # be polite to Horizons

    # Report
    epoch_iso = epoch_dt.strftime("%Y-%m-%d %H:%M UTC")
    lines = [
        "# JPL Horizons Orbital Elements Verification",
        "",
        f"Generated: {time.strftime('%Y-%m-%d %H:%M %Z')}",
        "",
        "Source: NASA/JPL Horizons Web API (`https://ssd.jpl.nasa.gov/api/horizons.api`).",
        f"Reference frame: Ecliptic equinox J2000.0, Sun center (500@10). Requested epoch: {epoch_iso}.",
        "Each row shows the value stored in the local catalog vs the JPL value at the requested epoch.",
        "When running with `--epoch today`, the mean anomaly is expected to differ dramatically from the"
        " previous J2000-era catalog — that is the whole point of refreshing to a current epoch.",
        "",
        "## Tolerances (for matching within the same epoch)",
        "- Semi-major axis `a`: ≤ 0.5% relative",
        "- Eccentricity `e`: ≤ 0.01 absolute",
        "- Inclination `i`, Ω, ω: ≤ 0.5° absolute",
        "- Mean anomaly `M`: ≤ 0.5° absolute (only meaningful when local + JPL are at the same epoch)",
        "- Period `T`: ≤ 0.5% relative",
        "",
        "## Summary",
        "",
        f"- Objects verified: {len(comparisons)}",
        f"- Objects failed/skipped: {len(failed_fetches)}",
        "",
    ]
    pass_count = sum(1 for c in comparisons if not verdict(c))
    fail_count = len(comparisons) - pass_count
    lines += [
        f"- Within tolerance: **{pass_count}**",
        f"- Discrepancies (fixed via regenerated elements): **{fail_count}**",
        "",
        "## Per-object verdict",
        "",
        "| Name | Class | a (local → JPL) | e | i | Ω | ω | M | T | Verdict |",
        "|------|-------|-----------------|---|---|---|---|---|---|---------|",
    ]
    for c in comparisons:
        problems = verdict(c)
        status = "✓ pass" if not problems else "✗ " + ", ".join(problems)
        lines.append(
            f"| {c['name']} | {c['orbit_class']} "
            f"| {c['a'][0]:.4f} → {c['a'][1]:.4f} "
            f"| {c['e'][0]:.4f} → {c['e'][1]:.4f} "
            f"| {c['i'][0]:.3f} → {c['i'][1]:.3f} "
            f"| {c['Omega'][0]:.3f} → {c['Omega'][1]:.3f} "
            f"| {c['omega'][0]:.3f} → {c['omega'][1]:.3f} "
            f"| {c['MA'][0]:.3f} → {c['MA'][1]:.3f} "
            f"| {c['period'][0]:.4f} → {c['period'][1]:.4f} "
            f"| {status} |"
        )
    if failed_fetches:
        lines += ["", "## Fetch failures", ""]
        for n in failed_fetches:
            lines.append(f"- {n}")
    lines += [
        "",
        "## Methodology",
        "",
        "`scripts/verify_jpl_orbital_elements.py` queries Horizons `ELEMENTS` "
        "ephemeris for a 1-day span bracketing J2000 and extracts the EC, IN, "
        "OM, W, MA, A, PR fields from the `$$SOE`…`$$EOE` block. "
        "A is returned in kilometres and converted to AU "
        "(1 AU = 1.495978707·10⁸ km). Period is returned in seconds and "
        "converted to Julian years (365.25·86400 s).",
        "",
        "After running the script, the regenerated orbital blocks are emitted "
        "to `reports/jpl-patches.txt` so they can be diffed into "
        "`frontend/src/lib/famous_neos.ts`.",
        "",
    ]
    report_path.write_text("\n".join(lines))
    patches_path.write_text("\n".join(patches))
    print(f"Wrote {report_path}", file=sys.stderr)
    print(f"Wrote {patches_path}", file=sys.stderr)
    return 0 if fail_count == 0 and not failed_fetches else 1


if __name__ == "__main__":
    sys.exit(main())
