# Current-time position verification

**Generated:** 2026-04-24T21:22:00+00:00  
**JD:** 2461155.390278  
**Days since J2000:** 9610.39  
**Tolerance:** 2.0° angular separation on the celestial sphere

## Summary

- Pass: **18** / 18
- Fail: **0** / 18
- Skip: **0** / 18

## Method

1. Parse orbital elements from `frontend/src/lib/famous_neos.ts`.
2. Compute current RA/Dec using a Python re-implementation of `frontend/src/lib/kepler.ts` (`heliocentricPositionAtJD` + `heliocentricToGeocentricCelestialSphere`).
3. Fetch geocentric astrometric RA/Dec from JPL Horizons OBSERVER mode (CENTER='500@399') for the exact same UTC.
4. Compute angular separation via spherical law of cosines.

## Per-object results

| # | Name | Our RA | Our Dec | JPL RA | JPL Dec | Δ (deg) | Verdict |
|---|---|--:|--:|--:|--:|--:|:---:|
| 1 | Bennu | 74.60 | +26.23 | 74.39 | +26.22 | 0.19 | PASS |
| 2 | Apophis | 72.66 | +20.30 | 72.47 | +20.28 | 0.18 | PASS |
| 3 | Didymos | 264.23 | -22.38 | 264.41 | -22.40 | 0.17 | PASS |
| 4 | Ryugu | 88.92 | +18.62 | 88.73 | +18.59 | 0.18 | PASS |
| 5 | Itokawa | 29.19 | +11.25 | 29.06 | +11.20 | 0.14 | PASS |
| 6 | Eros | 122.62 | +4.51 | 122.59 | +4.38 | 0.13 | PASS |
| 7 | Psyche | 89.39 | +21.59 | 89.32 | +21.59 | 0.07 | PASS |
| 8 | Ceres | 44.51 | +12.72 | 44.41 | +12.69 | 0.10 | PASS |
| 9 | Vesta | 353.83 | -7.38 | 353.73 | -7.41 | 0.10 | PASS |
| 10 | Geographos | 107.12 | +11.44 | 106.91 | +11.33 | 0.23 | PASS |
| 11 | Toutatis | 196.89 | -6.54 | 197.01 | -6.59 | 0.13 | PASS |
| 12 | Dinkinesh | 84.44 | +25.02 | 84.33 | +25.02 | 0.10 | PASS |
| 13 | Annefrank | 17.86 | +4.52 | 17.75 | +4.48 | 0.11 | PASS |
| 14 | Braille | 45.03 | +21.10 | 44.95 | +21.08 | 0.08 | PASS |
| 15 | Gaspra | 116.94 | +17.15 | 116.91 | +17.14 | 0.03 | PASS |
| 16 | Ida | 102.37 | +23.35 | 102.32 | +23.36 | 0.05 | PASS |
| 17 | Tempel 1 | 92.06 | +29.09 | 92.01 | +29.09 | 0.04 | PASS |
| 18 | 67P / Churyumov-Gerasimenko | 268.92 | -26.49 | 268.97 | -26.49 | 0.05 | PASS |

## Interpretation

Positions are visualization-grade: elements are osculating at J2000 epoch, propagated by pure Kepler evolution (no planetary perturbations). For objects with small-to-moderate perturbations (main-belt asteroids, most NEOs), this gives < 2° sky error over decades. For chaotic orbits (e.g. Toutatis, 67P after jovian encounters) larger deviations are expected and acceptable for a demo.

## Conclusion

All 18 verified objects agree with JPL Horizons within 2.0° at the time of this run. Sky View and Orbit View render objects where they actually are tonight, not at J2000.
