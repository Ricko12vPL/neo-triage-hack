"""Hardcoded NEOCP candidate fixtures for development and demo.

The composition is deliberate, per `PLAN.md` §6 Day 1 and the execution
load: three high-confidence NEO candidates, two likely main-belt
contaminants, two artifacts, two intermediate cases, and one
hazardous-looking "YR4 analog" used as the demo hero. Coordinates and
observatory codes are plausible; these values are not derived from real
observations and should not be confused with live NEOCP data.
"""
from __future__ import annotations

from datetime import UTC, datetime

from backend.models.schemas import Candidate


def _utc(year: int, month: int, day: int, hour: int, minute: int) -> datetime:
    return datetime(year, month, day, hour, minute, tzinfo=UTC)


MOCK_CANDIDATES: list[Candidate] = [
    # --- High-confidence NEO candidates -------------------------------
    Candidate(
        trksub="P21a3Kx",
        ra_deg=45.217,
        dec_deg=-12.463,
        mean_magnitude_v=20.1,
        rate_arcsec_min=2.3,
        observatory_code="T08",
        first_obs_datetime=_utc(2026, 4, 21, 8, 42),
        n_observations=5,
        arc_length_minutes=18.0,
        digest2_neo_noid=91,
        ecliptic_latitude_deg=-14.8,
        impact_probability=0.0008,
        absolute_magnitude_h=22.3,
        data_source='DEMO_FIXTURE',
    ),
    Candidate(
        trksub="P21b7Pm",
        ra_deg=123.781,
        dec_deg=8.672,
        mean_magnitude_v=19.4,
        rate_arcsec_min=3.1,
        observatory_code="F51",
        first_obs_datetime=_utc(2026, 4, 21, 13, 15),
        n_observations=4,
        arc_length_minutes=12.0,
        digest2_neo_noid=88,
        ecliptic_latitude_deg=-4.2,
        impact_probability=0.00015,
        absolute_magnitude_h=21.1,
        data_source='DEMO_FIXTURE',
    ),
    Candidate(
        trksub="P21c9Qr",
        ra_deg=78.334,
        dec_deg=22.115,
        mean_magnitude_v=20.8,
        rate_arcsec_min=1.8,
        observatory_code="703",
        first_obs_datetime=_utc(2026, 4, 21, 10, 8),
        n_observations=6,
        arc_length_minutes=24.0,
        digest2_neo_noid=85,
        ecliptic_latitude_deg=1.9,
        impact_probability=0.0002,
        absolute_magnitude_h=23.4,
        data_source='DEMO_FIXTURE',
    ),
    # --- Likely main-belt contaminants --------------------------------
    Candidate(
        trksub="P21d2Wy",
        ra_deg=210.412,
        dec_deg=5.208,
        mean_magnitude_v=20.9,
        rate_arcsec_min=0.42,
        observatory_code="G96",
        first_obs_datetime=_utc(2026, 4, 21, 11, 30),
        n_observations=8,
        arc_length_minutes=35.0,
        digest2_neo_noid=52,
        ecliptic_latitude_deg=-1.2,
        data_source='DEMO_FIXTURE',
    ),
    Candidate(
        trksub="P21e5Zt",
        ra_deg=165.707,
        dec_deg=-3.091,
        mean_magnitude_v=21.3,
        rate_arcsec_min=0.38,
        observatory_code="W68",
        first_obs_datetime=_utc(2026, 4, 21, 9, 45),
        n_observations=7,
        arc_length_minutes=30.0,
        digest2_neo_noid=48,
        ecliptic_latitude_deg=0.8,
        data_source='DEMO_FIXTURE',
    ),
    # --- Artifacts ----------------------------------------------------
    Candidate(
        trksub="P21f1Aa",
        ra_deg=300.214,
        dec_deg=45.328,
        mean_magnitude_v=19.8,
        rate_arcsec_min=0.10,
        observatory_code="T08",
        first_obs_datetime=_utc(2026, 4, 21, 7, 3),
        n_observations=2,
        arc_length_minutes=4.0,
        digest2_neo_noid=22,
        ecliptic_latitude_deg=60.4,
        data_source='DEMO_FIXTURE',
    ),
    Candidate(
        trksub="P21g8Bc",
        ra_deg=280.508,
        dec_deg=-65.183,
        mean_magnitude_v=22.1,
        rate_arcsec_min=8.9,
        observatory_code="T08",
        first_obs_datetime=_utc(2026, 4, 21, 6, 22),
        n_observations=2,
        arc_length_minutes=3.0,
        digest2_neo_noid=28,
        ecliptic_latitude_deg=-49.7,
        data_source='DEMO_FIXTURE',
    ),
    # --- Intermediate cases -------------------------------------------
    Candidate(
        trksub="P21h4Dd",
        ra_deg=95.621,
        dec_deg=15.342,
        mean_magnitude_v=20.5,
        rate_arcsec_min=1.1,
        observatory_code="703",
        first_obs_datetime=_utc(2026, 4, 21, 14, 10),
        n_observations=5,
        arc_length_minutes=20.0,
        digest2_neo_noid=68,
        ecliptic_latitude_deg=-7.9,
        impact_probability=4e-6,
        absolute_magnitude_h=22.9,
        data_source='DEMO_FIXTURE',
    ),
    Candidate(
        trksub="P21i6Ee",
        ra_deg=30.189,
        dec_deg=-20.553,
        mean_magnitude_v=20.2,
        rate_arcsec_min=1.4,
        observatory_code="F51",
        first_obs_datetime=_utc(2026, 4, 21, 12, 38),
        n_observations=4,
        arc_length_minutes=15.0,
        digest2_neo_noid=72,
        ecliptic_latitude_deg=-11.8,
        impact_probability=2e-5,
        absolute_magnitude_h=22.7,
        data_source='DEMO_FIXTURE',
    ),
    # --- YR4 analog — demo hero ---------------------------------------
    # Real 2024 YR4 peak-window values: IP ~2.4%, H ~24.0
    Candidate(
        trksub="P21YR4A",
        ra_deg=88.527,
        dec_deg=2.143,
        mean_magnitude_v=19.5,
        rate_arcsec_min=2.8,
        observatory_code="W68",
        first_obs_datetime=_utc(2026, 4, 21, 22, 30),
        n_observations=4,
        arc_length_minutes=15.0,
        digest2_neo_noid=98,
        ecliptic_latitude_deg=0.5,
        impact_probability=0.024,
        absolute_magnitude_h=24.0,
        data_source='DEMO_FIXTURE',
        impactor_case_designation='2024 YR4',
    ),
    # --- Hybrid-classifier disagreement fixture (Opus DISSENT demo) -----
    # Crafted so the Bayesian ranker (rate/mag/digest2/ecliptic-latitude
    # only) and the Opus 4.7 expert reviewer disagree. The ranker sees a
    # near-ecliptic, slow object with a non-trivial digest2 score and
    # under-weights it; Opus reasons about the rate–magnitude geometry
    # ("V=18.4 + 0.18 ″/min near opposition implies geocentric distance
    # ~5–6 AU, consistent with a Hilda/Trojan, not a NEO or active comet")
    # and DISSENTs with multiple structured caveats and a
    # `request_second_epoch` / `deprioritize` action. Reliable hybrid
    # demo climax for Most Creative Opus 4.7.
    #
    # Verified live 2026-04-25 against claude-opus-4-7: returned
    # class_endorsement=DISSENT, endorsed_class=MBA, 4 caveats including
    # CRITICAL MAGNITUDE_RATE_MISMATCH.
    Candidate(
        trksub="P21LOWRT",
        ra_deg=187.452,
        dec_deg=-3.218,
        mean_magnitude_v=18.4,
        rate_arcsec_min=0.18,
        observatory_code="G96",
        first_obs_datetime=_utc(2026, 4, 21, 23, 17),
        n_observations=5,
        arc_length_minutes=42.0,
        digest2_neo_noid=68,
        ecliptic_latitude_deg=-1.8,
        absolute_magnitude_h=20.5,
        data_source='DEMO_FIXTURE',
    ),
]
