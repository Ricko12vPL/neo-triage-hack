"""Asteroid impact energy estimation from absolute magnitude.

The Torino Scale (Binzel 2000) axes are (impact probability) × (kinetic energy).
Our classifier outputs only P(PHA) and cannot say anything about impact energy
on its own. For candidates where absolute magnitude H is known (from orbit
determination or catalogued cross-match), we estimate kinetic energy via:

    D_m  = 1329 * albedo^(-1/2) * 10^(-H/5)    [Chesley et al. 2002]
    m_kg = (4/3) * pi * (D_m/2)^3 * density_kg_per_m3
    KE_J = 0.5 * m_kg * (v_m_per_s)^2
    KE_MT = KE_J / 4.184e15

Default assumptions (stony S-type, average NEO encounter velocity):
    albedo          = 0.14
    density_kg_per_m3 = 2500
    velocity_km_per_s = 20.0

These are documented per Chesley/Chodas ref values for the population average.
For individual objects, the caller can override any parameter.
"""
from __future__ import annotations

import math

ALBEDO_DEFAULT: float = 0.14
DENSITY_KG_PER_M3_DEFAULT: float = 2500.0
VELOCITY_KM_PER_S_DEFAULT: float = 20.0

_JOULES_PER_MEGATON_TNT: float = 4.184e15
_H_MAGNITUDE_CONSTANT_M: float = 1329_000.0  # 1329 km → metres
_KM_TO_M: float = 1000.0


def diameter_m_from_h(
    absolute_magnitude_h: float,
    *,
    albedo: float = ALBEDO_DEFAULT,
) -> float:
    """Estimate asteroid diameter in metres from absolute magnitude H.

    Uses the standard H → D relation with the constant expressed in metres:
        D_m = 1329_000 * albedo^(-1/2) * 10^(-H/5)
    """
    if albedo <= 0:
        raise ValueError("albedo must be positive")
    return _H_MAGNITUDE_CONSTANT_M * albedo ** (-0.5) * 10 ** (-absolute_magnitude_h / 5)


def estimate_kinetic_energy_mt_tnt(
    absolute_magnitude_h: float,
    *,
    albedo: float = ALBEDO_DEFAULT,
    density_kg_per_m3: float = DENSITY_KG_PER_M3_DEFAULT,
    velocity_km_per_s: float = VELOCITY_KM_PER_S_DEFAULT,
) -> float:
    """Estimate impact kinetic energy in megatons TNT equivalent.

    Chain: H → diameter → mass (spherical, given density) → KE at velocity.
    """
    diameter_m = diameter_m_from_h(absolute_magnitude_h, albedo=albedo)
    radius_m = diameter_m / 2.0
    volume_m3 = (4.0 / 3.0) * math.pi * radius_m**3
    mass_kg = density_kg_per_m3 * volume_m3
    velocity_m_per_s = velocity_km_per_s * _KM_TO_M
    kinetic_energy_joules = 0.5 * mass_kg * velocity_m_per_s**2
    return kinetic_energy_joules / _JOULES_PER_MEGATON_TNT
