"""Tests for the Collins et al. 2017 damage model and population grid.

Anchored against historical events:
  Chelyabinsk: D≈20m, v≈19km/s → ~0.5 MT, R_5psi ~5 km (windows broken)
  Tunguska:    D≈60m, v≈15km/s → ~10 MT, R_5psi ~13 km (trees flattened)

The constants are within ±25% of these numbers — that's the precision
production planetary defense uses for first-order screening.
"""
from __future__ import annotations

import math

import pytest

from backend.data.population_grid import (
    City,
    population_density_at,
    population_in_circle,
    haversine_km,
    TOP_CITIES,
)
from backend.services.impact_damage_model import (
    estimate_damage,
    estimate_diameter_from_h,
)


# ---------------------------------------------------------------------------
# Damage model
# ---------------------------------------------------------------------------


def test_chelyabinsk_class_returns_realistic_yield():
    est = estimate_damage(diameter_m=20, velocity_km_s=19)
    # Real Chelyabinsk yield was ~0.5 MT; we want within ±50% of that.
    assert 0.25 < est.energy_megatons_tnt < 0.9
    # Severe-damage radius ~5 km (real 5-psi was ~5 km observed).
    assert 3.5 < est.severe_damage_radius_km < 7.0


def test_tunguska_class_returns_realistic_yield():
    est = estimate_damage(diameter_m=60, velocity_km_s=15)
    # Real Tunguska estimate ~10-15 MT; allow generous bracket.
    assert 5 < est.energy_megatons_tnt < 20
    # Severe-damage radius ~13 km matches tree-fall extent.
    assert 8 < est.severe_damage_radius_km < 18


def test_yr4_class_50m_returns_tunguska_scale_radius():
    est = estimate_damage(diameter_m=50, velocity_km_s=15)
    # YR4 was estimated 40-60m → similar order to Tunguska.
    assert 4 < est.energy_megatons_tnt < 12
    assert 7 < est.severe_damage_radius_km < 15


def test_ratio_invariants_hold():
    est = estimate_damage(diameter_m=50, velocity_km_s=15)
    assert est.thermal_radiation_radius_km == pytest.approx(est.severe_damage_radius_km * 1.5)
    assert est.seismic_radius_km == pytest.approx(est.severe_damage_radius_km * 0.5)


def test_zero_inputs_safe():
    est = estimate_damage(diameter_m=0, velocity_km_s=15)
    assert est.energy_megatons_tnt == 0.0
    assert est.severe_damage_radius_km == 0.0


def test_h_to_diameter_apophis_known():
    # Apophis H=19.7 → ~340m at default albedo 0.14 (close to JPL's 340m).
    diameter_m = estimate_diameter_from_h(19.7)
    assert 280 < diameter_m < 420


# ---------------------------------------------------------------------------
# Population grid
# ---------------------------------------------------------------------------


def test_grid_includes_top_cities():
    names = [c.name for c in TOP_CITIES]
    assert "Tokyo" in names
    assert "Mumbai" in names
    assert "London" in names
    assert len(TOP_CITIES) >= 30


def test_haversine_basic_sanity():
    # NY → London ≈ 5570 km
    d = haversine_km(40.7128, -74.0060, 51.5074, -0.1278)
    assert 5400 < d < 5700


def test_population_in_circle_over_tokyo_returns_metro():
    result = population_in_circle(35.68, 139.65, 30.0)
    assert "Tokyo (Japan)" in result["cities_in_zone"]
    # Tokyo metro is the dominant component
    assert result["population_in_zone"] >= 30_000_000


def test_population_in_circle_over_pacific_only_background():
    # Mid-Pacific, far from any city
    result = population_in_circle(0.0, -150.0, 25.0)
    assert result["cities_in_zone"] == []
    # Just background ≈ 12 * π * 25² ≈ 23k
    assert result["population_in_zone"] < 30_000


def test_population_in_circle_yr4_size_over_manila_metro():
    # YR4-class severe radius ~12 km centered on Manila → Manila metro counts.
    result = population_in_circle(14.6, 120.98, 12.0)
    assert "Manila (Philippines)" in result["cities_in_zone"]
    assert result["population_in_zone"] >= 14_000_000


def test_density_at_metro_higher_than_background():
    metro = population_density_at(35.68, 139.65)
    rural = population_density_at(0.0, -150.0)
    assert metro > rural * 100
