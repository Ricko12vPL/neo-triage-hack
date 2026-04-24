# JPL Horizons Orbital Elements Verification

Generated: 2026-04-24 21:18 CEST

Source: NASA/JPL Horizons Web API (`https://ssd.jpl.nasa.gov/api/horizons.api`).
Reference frame: Ecliptic J2000.0, Sun center (500@10). Epoch JD 2451545.0 (2000-01-01 12:00 TDB).

## Tolerances
- Semi-major axis `a`: ≤ 0.5% relative
- Eccentricity `e`: ≤ 0.01 absolute
- Inclination `i`, Ω, ω: ≤ 0.5° absolute
- Mean anomaly `M` (J2000): ≤ 0.5° absolute
- Period `T`: ≤ 0.5% relative

## Summary

- Objects verified: 18
- Objects failed/skipped: 0

- Within tolerance: **18**
- Discrepancies (fixed via regenerated elements): **0**

## Per-object verdict

| Name | Class | a (local → JPL) | e | i | Ω | ω | M | T | Verdict |
|------|-------|-----------------|---|---|---|---|---|---|---------|
| Bennu | Apollo | 1.1289 → 1.1289 | 0.2047 → 0.2047 | 6.026 → 6.026 | 2.179 → 2.179 | 65.672 → 65.672 | 35.007 → 35.007 | 1.1995 → 1.1995 | ✓ pass |
| Apophis | Aten | 0.9223 → 0.9223 | 0.1914 → 0.1914 | 3.331 → 3.331 | 204.657 → 204.657 | 126.065 → 126.065 | 231.624 → 231.624 | 0.8858 → 0.8858 | ✓ pass |
| Didymos | Apollo | 1.6421 → 1.6421 | 0.3832 → 0.3832 | 3.397 → 3.397 | 73.448 → 73.448 | 318.886 → 318.886 | 65.518 → 65.518 | 2.1043 → 2.1043 | ✓ pass |
| Ryugu | Apollo | 1.1891 → 1.1891 | 0.1900 → 0.1900 | 5.885 → 5.884 | 251.727 → 251.727 | 211.272 → 211.272 | 288.273 → 288.273 | 1.2966 → 1.2966 | ✓ pass |
| Itokawa | Apollo | 1.3249 → 1.3249 | 0.2805 → 0.2805 | 1.717 → 1.717 | 71.614 → 71.614 | 160.138 → 160.138 | 43.768 → 43.768 | 1.5251 → 1.5251 | ✓ pass |
| Eros | Amor | 1.4583 → 1.4583 | 0.2228 → 0.2228 | 10.828 → 10.828 | 304.416 → 304.416 | 178.646 → 178.646 | 57.413 → 57.413 | 1.7611 → 1.7611 | ✓ pass |
| Psyche | MBA | 2.9206 → 2.9206 | 0.1382 → 0.1382 | 3.093 → 3.093 | 150.466 → 150.466 | 229.119 → 229.119 | 335.493 → 335.493 | 4.9912 → 4.9912 | ✓ pass |
| Ceres | MBA | 2.7665 → 2.7665 | 0.0784 → 0.0784 | 10.583 → 10.583 | 80.494 → 80.494 | 73.923 → 73.923 | 6.070 → 6.070 | 4.6015 → 4.6015 | ✓ pass |
| Vesta | MBA | 2.3615 → 2.3615 | 0.0900 → 0.0900 | 7.134 → 7.134 | 103.951 → 103.951 | 149.587 → 149.587 | 340.888 → 340.888 | 3.6291 → 3.6291 | ✓ pass |
| Geographos | Apollo | 1.2455 → 1.2455 | 0.3355 → 0.3355 | 13.340 → 13.340 | 337.345 → 337.345 | 276.742 → 276.742 | 348.154 → 348.154 | 1.3901 → 1.3901 | ✓ pass |
| Toutatis | Apollo | 2.5106 → 2.5106 | 0.6343 → 0.6343 | 0.470 → 0.470 | 128.367 → 128.367 | 274.683 → 274.683 | 283.704 → 283.703 | 3.9780 → 3.9780 | ✓ pass |
| Dinkinesh | MBA | 2.1917 → 2.1917 | 0.1129 → 0.1129 | 2.098 → 2.098 | 21.587 → 21.587 | 66.078 → 66.078 | 336.654 → 336.654 | 3.2447 → 3.2447 | ✓ pass |
| Annefrank | MBA | 2.2130 → 2.2130 | 0.0639 → 0.0639 | 4.246 → 4.246 | 120.746 → 120.746 | 8.310 → 8.310 | 250.596 → 250.596 | 3.2922 → 3.2922 | ✓ pass |
| Braille | Amor | 2.3414 → 2.3414 | 0.4335 → 0.4335 | 28.949 → 28.949 | 242.158 → 242.158 | 355.354 → 355.354 | 44.594 → 44.595 | 3.5828 → 3.5828 | ✓ pass |
| Gaspra | MBA | 2.2094 → 2.2094 | 0.1736 → 0.1736 | 4.103 → 4.103 | 253.322 → 253.322 | 129.307 → 129.307 | 96.353 → 96.353 | 3.2842 → 3.2842 | ✓ pass |
| Ida | MBA | 2.8597 → 2.8597 | 0.0458 → 0.0458 | 1.137 → 1.137 | 324.380 → 324.380 | 112.291 → 112.291 | 244.225 → 244.225 | 4.8360 → 4.8360 | ✓ pass |
| Tempel 1 | Comet | 3.1183 → 3.1183 | 0.5190 → 0.5190 | 10.541 → 10.541 | 68.967 → 68.967 | 178.911 → 178.911 | 359.711 → 359.711 | 5.5067 → 5.5067 | ✓ pass |
| 67P / Churyumov-Gerasimenko | Comet | 3.5110 → 3.5110 | 0.6314 → 0.6314 | 7.122 → 7.122 | 50.991 → 50.991 | 11.350 → 11.350 | 216.154 → 216.154 | 6.5789 → 6.5789 | ✓ pass |

## Methodology

`scripts/verify_jpl_orbital_elements.py` queries Horizons `ELEMENTS` ephemeris for a 1-day span bracketing J2000 and extracts the EC, IN, OM, W, MA, A, PR fields from the `$$SOE`…`$$EOE` block. A is returned in kilometres and converted to AU (1 AU = 1.495978707·10⁸ km). Period is returned in seconds and converted to Julian years (365.25·86400 s).

After running the script, the regenerated orbital blocks are emitted to `reports/jpl-patches.txt` so they can be diffed into `frontend/src/lib/famous_neos.ts`.
