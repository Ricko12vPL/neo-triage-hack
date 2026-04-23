/**
 * Asteroid impact kinetic energy from absolute magnitude H.
 *
 * TypeScript mirror of `backend/services/energetics.py`. The Torino Scale
 * needs (impact_probability × kinetic_energy) — this module supplies the
 * second axis. See the Python module for the full algorithm notes and
 * references; we replicate the formula here because the Torino badge
 * computes client-side.
 */

export const ALBEDO_DEFAULT = 0.14;
export const DENSITY_KG_PER_M3_DEFAULT = 2500;
export const VELOCITY_KM_PER_S_DEFAULT = 20.0;

const JOULES_PER_MEGATON_TNT = 4.184e15;
const H_MAGNITUDE_CONSTANT_M = 1_329_000;
const KM_TO_M = 1000;

export function diameterMFromH(
  absolute_magnitude_h: number,
  albedo: number = ALBEDO_DEFAULT,
): number {
  if (albedo <= 0) throw new Error("albedo must be positive");
  return (
    H_MAGNITUDE_CONSTANT_M * Math.pow(albedo, -0.5) *
    Math.pow(10, -absolute_magnitude_h / 5)
  );
}

export function estimateKineticEnergyMtTnt(
  absolute_magnitude_h: number,
  {
    albedo = ALBEDO_DEFAULT,
    density_kg_per_m3 = DENSITY_KG_PER_M3_DEFAULT,
    velocity_km_per_s = VELOCITY_KM_PER_S_DEFAULT,
  }: {
    albedo?: number;
    density_kg_per_m3?: number;
    velocity_km_per_s?: number;
  } = {},
): number {
  const diameter_m = diameterMFromH(absolute_magnitude_h, albedo);
  const radius_m = diameter_m / 2;
  const volume_m3 = (4 / 3) * Math.PI * Math.pow(radius_m, 3);
  const mass_kg = density_kg_per_m3 * volume_m3;
  const velocity_m_per_s = velocity_km_per_s * KM_TO_M;
  const kinetic_energy_joules = 0.5 * mass_kg * velocity_m_per_s ** 2;
  return kinetic_energy_joules / JOULES_PER_MEGATON_TNT;
}
