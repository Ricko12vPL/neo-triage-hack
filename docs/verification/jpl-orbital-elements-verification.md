# JPL Horizons Orbital Elements Verification

Generated: 2026-04-24 23:24 CEST

Source: NASA/JPL Horizons Web API (`https://ssd.jpl.nasa.gov/api/horizons.api`).
Reference frame: Ecliptic equinox J2000.0, Sun center (500@10). Requested epoch: 2026-04-24 12:00 UTC.
Each row shows the value stored in the local catalog vs the JPL value at the requested epoch.
When running with `--epoch today`, the mean anomaly is expected to differ dramatically from the previous J2000-era catalog — that is the whole point of refreshing to a current epoch.

## Tolerances (for matching within the same epoch)
- Semi-major axis `a`: ≤ 0.5% relative
- Eccentricity `e`: ≤ 0.01 absolute
- Inclination `i`, Ω, ω: ≤ 0.5° absolute
- Mean anomaly `M`: ≤ 0.5° absolute (only meaningful when local + JPL are at the same epoch)
- Period `T`: ≤ 0.5% relative

## Summary

- Objects verified: 18
- Objects failed/skipped: 0

- Within tolerance: **18**
- Discrepancies (fixed via regenerated elements): **0**

## Per-object verdict

| Name | Class | a (local → JPL) | e | i | Ω | ω | M | T | Verdict |
|------|-------|-----------------|---|---|---|---|---|---|---------|
| Bennu | Apollo | 1.1260 → 1.1260 | 0.2037 → 0.2037 | 6.033 → 6.033 | 1.968 → 1.967 | 66.416 → 66.416 | 34.498 → 34.498 | 1.1948 → 1.1948 | ✓ pass |
| Apophis | Aten | 0.9224 → 0.9224 | 0.1911 → 0.1911 | 3.341 → 3.341 | 203.897 → 203.897 | 126.677 → 126.677 | 124.148 → 124.148 | 0.8859 → 0.8859 | ✓ pass |
| Didymos | Apollo | 1.6427 → 1.6427 | 0.3831 → 0.3831 | 3.414 → 3.414 | 72.986 → 72.986 | 319.584 → 319.584 | 239.324 → 239.324 | 2.1054 → 2.1054 | ✓ pass |
| Ryugu | Apollo | 1.1910 → 1.1910 | 0.1911 → 0.1911 | 5.866 → 5.866 | 251.291 → 251.291 | 211.613 → 211.613 | 27.451 → 27.451 | 1.2997 → 1.2997 | ✓ pass |
| Itokawa | Apollo | 1.3241 → 1.3241 | 0.2802 → 0.2802 | 1.621 → 1.621 | 69.074 → 69.074 | 162.843 → 162.843 | 140.893 → 140.893 | 1.5236 → 1.5236 | ✓ pass |
| Eros | Amor | 1.4582 → 1.4582 | 0.2229 → 0.2229 | 10.829 → 10.829 | 304.268 → 304.268 | 178.916 → 178.916 | 36.765 → 36.765 | 1.7610 → 1.7610 | ✓ pass |
| Psyche | MBA | 2.9252 → 2.9252 | 0.1348 → 0.1348 | 3.098 → 3.098 | 149.984 → 149.984 | 229.970 → 229.970 | 70.778 → 70.778 | 5.0032 → 5.0032 | ✓ pass |
| Ceres | MBA | 2.7655 → 2.7655 | 0.0797 → 0.0797 | 10.588 → 10.588 | 80.249 → 80.249 | 73.302 → 73.302 | 264.550 → 264.550 | 4.5991 → 4.5991 | ✓ pass |
| Vesta | MBA | 2.3614 → 2.3614 | 0.0902 → 0.0902 | 7.144 → 7.144 | 103.702 → 103.702 | 151.487 → 151.487 | 68.679 → 68.679 | 3.6289 → 3.6289 | ✓ pass |
| Geographos | Apollo | 1.2458 → 1.2458 | 0.3355 → 0.3355 | 13.337 → 13.337 | 337.136 → 337.136 | 277.029 → 277.030 | 322.071 → 322.071 | 1.3905 → 1.3905 | ✓ pass |
| Toutatis | Apollo | 2.5430 → 2.5430 | 0.6247 → 0.6247 | 0.448 → 0.448 | 125.370 → 125.370 | 277.857 → 277.857 | 114.332 → 114.332 | 4.0554 → 4.0554 | ✓ pass |
| Dinkinesh | MBA | 2.1917 → 2.1917 | 0.1126 → 0.1126 | 2.093 → 2.093 | 21.358 → 21.358 | 66.934 → 66.934 | 15.618 → 15.618 | 3.2448 → 3.2448 | ✓ pass |
| Annefrank | MBA | 2.2124 → 2.2124 | 0.0632 → 0.0632 | 4.247 → 4.247 | 120.551 → 120.551 | 9.522 → 9.522 | 247.135 → 247.135 | 3.2909 → 3.2909 | ✓ pass |
| Braille | Amor | 2.3395 → 2.3395 | 0.4341 → 0.4341 | 29.021 → 29.021 | 241.899 → 241.899 | 356.113 → 356.113 | 165.015 → 165.015 | 3.5784 → 3.5784 | ✓ pass |
| Gaspra | MBA | 2.2102 → 2.2102 | 0.1737 → 0.1737 | 4.105 → 4.105 | 252.973 → 252.973 | 130.024 → 130.024 | 99.130 → 99.130 | 3.2859 → 3.2859 | ✓ pass |
| Ida | MBA | 2.8635 → 2.8635 | 0.0461 → 0.0461 | 1.130 → 1.130 | 323.537 → 323.537 | 113.447 → 113.447 | 40.117 → 40.117 | 4.8458 → 4.8458 | ✓ pass |
| Tempel 1 | Comet | 3.3025 → 3.3025 | 0.4664 → 0.4664 | 10.505 → 10.505 | 66.957 → 66.957 | 184.535 → 184.535 | 251.939 → 251.939 | 6.0017 → 6.0017 | ✓ pass |
| 67P / Churyumov-Gerasimenko | Comet | 3.4588 → 3.4588 | 0.6496 → 0.6496 | 3.867 → 3.867 | 36.297 → 36.297 | 22.234 → 22.234 | 250.226 → 250.226 | 6.4328 → 6.4328 | ✓ pass |

## Methodology

`scripts/verify_jpl_orbital_elements.py` queries Horizons `ELEMENTS` ephemeris for a 1-day span bracketing J2000 and extracts the EC, IN, OM, W, MA, A, PR fields from the `$$SOE`…`$$EOE` block. A is returned in kilometres and converted to AU (1 AU = 1.495978707·10⁸ km). Period is returned in seconds and converted to Julian years (365.25·86400 s).

After running the script, the regenerated orbital blocks are emitted to `reports/jpl-patches.txt` so they can be diffed into `frontend/src/lib/famous_neos.ts`.
