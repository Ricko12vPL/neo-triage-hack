/**
 * Torino Impact Hazard Scale (Binzel 2000, revised 2005).
 *
 * The real two-axis classifier: impact_probability × kinetic_energy. Our
 * classifier emits P(NEO) / P(PHA); the orbit-determination layer (or the
 * pre-cached YR4 replay data) supplies impact_probability and absolute
 * magnitude H. Kinetic energy is derived from H via
 * `lib/energetics.estimateKineticEnergyMtTnt`.
 *
 * The numeric bands below follow the public Torino table with a minor
 * simplification: the "no consequence" band (Torino 0 for low IP or
 * sub-megaton energy) collapses two rows, and Torino 6-10 are out of
 * scope for a minutes-old tracklet — the highest meaningful score at
 * this pipeline stage is Torino 5.
 *
 * Reference:
 *   Binzel, R.P. 2000. "The Torino Impact Hazard Scale." Planet. Space Sci.
 *   48, 297-303.
 */
import { estimateKineticEnergyMtTnt } from "./energetics";

export interface TorinoResult {
  scale: number;
  label: string;
  /** Tailwind color classes for the badge. */
  colorClasses: string;
  description: string;
}

const T0: TorinoResult = {
  scale: 0,
  label: "Torino 0",
  colorClasses: "text-zinc-600 border-zinc-700 bg-transparent",
  description: "No hazard — routine monitoring",
};

const T1: TorinoResult = {
  scale: 1,
  label: "Torino 1",
  colorClasses: "text-zinc-400 border-zinc-600 bg-zinc-900/40",
  description: "Routine discovery — normal uncertainty",
};

const T2: TorinoResult = {
  scale: 2,
  label: "Torino 2",
  colorClasses: "text-yellow-300 border-yellow-700/60 bg-yellow-900/20",
  description: "Meriting attention — somewhat close pass",
};

const T3: TorinoResult = {
  scale: 3,
  label: "Torino 3",
  colorClasses: "text-amber-200 border-amber-700 bg-amber-900/30",
  description: "Meriting concern — ≥1% impact, localized destruction",
};

const T4: TorinoResult = {
  scale: 4,
  label: "Torino 4",
  colorClasses: "text-orange-200 border-orange-700 bg-orange-900/30",
  description: "Close encounter — regional devastation possible",
};

const T5: TorinoResult = {
  scale: 5,
  label: "Torino 5",
  colorClasses: "text-red-200 border-red-600 bg-red-900/40",
  description: "Threatening — regional devastation certain if impact",
};

/**
 * Compute Torino Scale from the canonical two-axis definition.
 *
 * @param impact_probability  P(Earth impact) in the known close-approach
 *   window, 0–1 fraction. `null` or < 1e-8 collapses to Torino 0.
 * @param kinetic_energy_mt_tnt  Impact kinetic energy in megatons TNT
 *   equivalent. If `null` we fall back to Torino 1 (IP known but size
 *   unknown — we cannot claim severity).
 */
export function computeTorinoFromAxes(
  impact_probability: number | null,
  kinetic_energy_mt_tnt: number | null,
): TorinoResult {
  if (impact_probability == null || impact_probability < 1e-8) return T0;

  if (kinetic_energy_mt_tnt == null) return T1;

  // IP >= 1e-8 from here.
  if (impact_probability < 1e-5) return T1;

  // Sub-megaton bodies are capped at Torino 2 no matter the IP —
  // atmospheric airburst, local at most.
  if (kinetic_energy_mt_tnt < 1) return T2;

  // IP 1e-5 to 1%, any body above 1 MT → Torino 2.
  if (impact_probability < 0.01) return T2;

  // IP >= 1% AND KE >= 1 MT — the "meriting concern" shelf.
  if (kinetic_energy_mt_tnt < 100) return T3;
  if (kinetic_energy_mt_tnt < 10_000) return T4;
  return T5;
}

/**
 * Convenience: compute Torino from (impact_probability, H). Derives kinetic
 * energy internally using the default NEO population assumptions. Returns
 * Torino 0 when impact_probability is null/undefined, and Torino 1 when H is
 * missing (IP known but size unknown).
 */
export function computeTorinoFromCandidate(
  impact_probability: number | null | undefined,
  absolute_magnitude_h: number | null | undefined,
): TorinoResult {
  const ip = impact_probability ?? null;
  if (ip == null) return T0;
  const ke =
    absolute_magnitude_h == null
      ? null
      : estimateKineticEnergyMtTnt(absolute_magnitude_h);
  return computeTorinoFromAxes(ip, ke);
}
