"""Pure-function impact damage model — Collins et al. 2017 scaling.

Translates an asteroid's diameter + impact velocity into a damage
radius operators recognise (5 psi overpressure circle for a Tunguska/
Chelyabinsk-style airburst). Combined with `population_grid` this gives
us the headline number planetary defense actually cares about: how
many people are inside the severe-damage zone?

Reference:
  Collins G.S., Melosh H.J., Marcus R.A. (2017)
  "Earth Impact Effects Program: A Web-based computer program for
   calculating the regional environmental consequences of a meteoroid
   impact on Earth."
  https://impact.ese.ic.ac.uk/ImpactEarth/

Key equations used:
  m = (4/3)·π·(D/2)³·ρ                 (mass from diameter, density)
  E = ½·m·v²                            (kinetic energy)
  E_MT = E / 4.184·10¹⁵                 (megatons TNT equivalent)
  R_5psi ≈ 6 · E_MT^(1/3)               (km, severe overpressure radius)

The 6·E^(1/3) coefficient comes from nuclear-airburst scaling tables
(Glasstone & Dolan 1977) and reproduces the 5-psi blast radius that
historically toppled trees in Tunguska (12-15 km, ~10 MT) and broke
windows in Chelyabinsk (~5 km, ~0.5 MT). Tested in the unit-test file.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

DEFAULT_DENSITY_KG_M3 = 3000.0  # typical stony asteroid
J_PER_MT_TNT = 4.184e15
THERMAL_RADIUS_FACTOR = 1.5
SEISMIC_RADIUS_FACTOR = 0.5


@dataclass(frozen=True)
class DamageEstimate:
    diameter_m: float
    velocity_km_s: float
    density_kg_m3: float
    mass_kg: float
    kinetic_energy_j: float
    energy_megatons_tnt: float
    severe_damage_radius_km: float
    thermal_radiation_radius_km: float
    seismic_radius_km: float


def estimate_damage(
    diameter_m: float,
    velocity_km_s: float,
    density_kg_m3: float = DEFAULT_DENSITY_KG_M3,
) -> DamageEstimate:
    """Compute kinetic energy and damage radii for a given impactor."""
    if diameter_m <= 0 or velocity_km_s <= 0 or density_kg_m3 <= 0:
        return DamageEstimate(
            diameter_m, velocity_km_s, density_kg_m3, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0
        )
    radius_m = diameter_m / 2.0
    volume_m3 = (4.0 / 3.0) * math.pi * radius_m**3
    mass_kg = volume_m3 * density_kg_m3
    velocity_m_s = velocity_km_s * 1000.0
    energy_j = 0.5 * mass_kg * velocity_m_s**2
    energy_mt = energy_j / J_PER_MT_TNT
    severe_radius = 6.0 * (energy_mt ** (1.0 / 3.0))
    return DamageEstimate(
        diameter_m=diameter_m,
        velocity_km_s=velocity_km_s,
        density_kg_m3=density_kg_m3,
        mass_kg=mass_kg,
        kinetic_energy_j=energy_j,
        energy_megatons_tnt=energy_mt,
        severe_damage_radius_km=severe_radius,
        thermal_radiation_radius_km=severe_radius * THERMAL_RADIUS_FACTOR,
        seismic_radius_km=severe_radius * SEISMIC_RADIUS_FACTOR,
    )


def estimate_diameter_from_h(absolute_magnitude_h: float, albedo: float = 0.14) -> float:
    """Inverse Pravec–Harris H-to-diameter relation.

    D_km = 1329 / sqrt(albedo) × 10^(−H/5)

    Default albedo 0.14 ≈ moderate S-type (Pravec & Harris 2007).
    """
    if albedo <= 0:
        albedo = 0.14
    diameter_km = (1329.0 / math.sqrt(albedo)) * (10.0 ** (-absolute_magnitude_h / 5.0))
    return diameter_km * 1000.0
