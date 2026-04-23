"""Tests for the H → kinetic energy estimator used by the Torino Scale.

Ground-truth scenarios anchored to real events:
- 2024 YR4 analog:  H≈24     → D~50m   → ~5-15 MT (Torino 3 band, 1-100 MT)
- Tunguska-scale:   H≈27     → D~60m   → ~5-50 MT (well-measured historical)
- Chicxulub-scale:  H≈10     → D~10km  → ~10^8 MT (dinosaur-killer ceiling)
"""
from __future__ import annotations

import math

import pytest

from backend.services.energetics import (
    diameter_m_from_h,
    estimate_kinetic_energy_mt_tnt,
)


def test_diameter_yr4_proxy() -> None:
    """H=24, default albedo → diameter around 50 m (real YR4 estimate ~40-90 m)."""
    d = diameter_m_from_h(24.0)
    assert 30 < d < 100


def test_diameter_tunguska_proxy() -> None:
    """H~27 → diameter ~15 m (actual Tunguska ~50-80 m; H underconstrains)."""
    d = diameter_m_from_h(27.0)
    assert 5 < d < 40


def test_diameter_dinosaur_killer_scale() -> None:
    """H=10 → diameter in the tens-of-km range (dinosaur-killer ceiling)."""
    d = diameter_m_from_h(10.0)
    assert d > 10_000


def test_ke_yr4_proxy_in_torino3_band() -> None:
    """H=24 → KE in the 1-100 MT band that keeps YR4 at Torino 3 (not 4)."""
    ke_mt = estimate_kinetic_energy_mt_tnt(24.0)
    assert 1 < ke_mt < 100


def test_ke_tunguska_proxy_megaton_scale() -> None:
    """H=27 → sub-megaton to single-megaton scale."""
    ke_mt = estimate_kinetic_energy_mt_tnt(27.0)
    assert 0.01 < ke_mt < 10


def test_ke_chicxulub_proxy_above_torino5_ceiling() -> None:
    """H=10 → energy well above 10000 MT, which is Torino 5 lower bound for that IP."""
    ke_mt = estimate_kinetic_energy_mt_tnt(10.0)
    assert ke_mt > 10_000


def test_ke_scales_with_diameter_cubed() -> None:
    """Doubling diameter (ΔH≈-1.5) should scale KE by ~8x."""
    ke_small = estimate_kinetic_energy_mt_tnt(22.0)
    ke_big = estimate_kinetic_energy_mt_tnt(20.5)
    ratio = ke_big / ke_small
    assert 6 < ratio < 10


def test_ke_scales_with_velocity_squared() -> None:
    """Doubling velocity should quadruple KE."""
    ke_20 = estimate_kinetic_energy_mt_tnt(24.0, velocity_km_per_s=20.0)
    ke_40 = estimate_kinetic_energy_mt_tnt(24.0, velocity_km_per_s=40.0)
    assert math.isclose(ke_40 / ke_20, 4.0, rel_tol=1e-6)


def test_ke_rejects_nonpositive_albedo() -> None:
    with pytest.raises(ValueError):
        diameter_m_from_h(24.0, albedo=0.0)
    with pytest.raises(ValueError):
        diameter_m_from_h(24.0, albedo=-0.1)
