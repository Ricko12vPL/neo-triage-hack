import { useEffect, useState } from "react";
import { api } from "../api/client";
import type {
  Candidate,
  PopulationRiskResponse,
} from "../api/types";

/**
 * Demo-grade population-weighted impact risk display.
 *
 * Surfaces three headline numbers production planetary defense uses:
 *   - severe damage zone (km radius from Collins et al. 2017 5-psi scaling)
 *   - population inside that zone (synthetic top-50 cities + 12/km² rural)
 *   - expected casualties (zone × 50 % × impact probability)
 *
 * The synthetic-grid caveat is loud and unambiguous — Phase 2 swaps the
 * source for CIESIN GPWv4. Architectural pattern matches the academic
 * literature (Liu et al. 2025 Nature on YR4).
 *
 * Render condition (callers): show only when impact_probability >= 1e-7
 * AND (diameter_m OR absolute_magnitude_h) is available — for live MPC
 * tracklets without orbit determination both are None and we silently
 * skip the panel.
 */

interface Props {
  candidate: Candidate;
}

const REPRESENTATIVE_IMPACT_LAT = 14.6;
const REPRESENTATIVE_IMPACT_LON = 120.98;
const REPRESENTATIVE_IMPACT_LABEL = "Manila metro (representative)";

function formatPopulation(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return Math.round(n).toLocaleString();
}

function formatCasualties(n: number): string {
  if (n < 1) return n.toFixed(2);
  if (n < 1e3) return Math.round(n).toLocaleString();
  return formatPopulation(n);
}

function shouldRenderForCandidate(c: Candidate): boolean {
  const ip = c.impact_probability ?? 0;
  if (ip < 1e-7) return false;
  return (c.absolute_magnitude_h ?? null) != null;
}

export function PopulationRiskPanel({ candidate }: Props) {
  const [risk, setRisk] = useState<PopulationRiskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const eligible = shouldRenderForCandidate(candidate);

  useEffect(() => {
    if (!eligible) {
      setRisk(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setRisk(null);
    const velocity = Math.max(candidate.rate_arcsec_min * 0.1 + 14, 14); // crude proxy: NEO impact velocities cluster around 17–22 km/s; default near 15
    api
      .populationRisk({
        designation: candidate.trksub,
        impact_probability: candidate.impact_probability ?? 0,
        velocity_km_s: 17.0,
        absolute_magnitude_h: candidate.absolute_magnitude_h ?? undefined,
        impact_latitude_deg: REPRESENTATIVE_IMPACT_LAT,
        impact_longitude_deg: REPRESENTATIVE_IMPACT_LON,
      })
      .then((r) => {
        if (!cancelled) setRisk(r);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    void velocity; // velocity proxy reserved for future per-orbit refinement
    return () => {
      cancelled = true;
    };
  }, [
    candidate.trksub,
    candidate.impact_probability,
    candidate.absolute_magnitude_h,
    candidate.rate_arcsec_min,
    eligible,
  ]);

  if (!eligible) return null;

  return (
    <section className="border-t border-orange-900/40 bg-zinc-950/40">
      <header className="flex items-center justify-between gap-2 border-b border-zinc-800 bg-orange-950/15 px-4 py-2">
        <div>
          <h3 className="font-mono text-[11px] font-semibold uppercase tracking-wider text-orange-300">
            Population at risk
          </h3>
          <p className="text-[10px] text-zinc-500">
            Why this candidate matters for planetary defense
          </p>
        </div>
        <span
          className="rounded border border-orange-800/60 bg-orange-950/40 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-orange-300"
          title="Synthetic top-50-cities grid + Collins et al. 2017 damage scaling. Phase 2 = real CIESIN GPWv4 raster + Find_Orb impact corridor."
        >
          demo-grade
        </span>
      </header>

      <div className="px-4 py-3">
        {loading && (
          <p className="font-mono text-[10px] text-zinc-500">
            <span className="animate-pulse">Computing damage zone + population…</span>
          </p>
        )}

        {error && (
          <p className="rounded border border-amber-700/40 bg-amber-950/20 px-2 py-1 font-mono text-[10px] text-amber-200">
            ⚠ {error}
          </p>
        )}

        {risk && !loading && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Headline
                label="Damage zone"
                value={`${risk.severe_damage_radius_km.toFixed(1)} km`}
                sub={`${risk.energy_megatons_tnt.toFixed(1)} MT TNT`}
                tone="amber"
              />
              <Headline
                label="Population in zone"
                value={formatPopulation(risk.population_in_zone)}
                sub={
                  risk.cities_in_zone.length > 0
                    ? risk.cities_in_zone[0]
                    : "rural / oceanic"
                }
                tone="orange"
              />
              <Headline
                label="Expected casualties"
                value={formatCasualties(risk.expected_casualties_unconditional)}
                sub={`@ P(impact)=${risk.impact_probability.toExponential(2)}`}
                tone="red"
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px]">
              <span className="text-zinc-500">Impact hypothesis:</span>
              <span className="rounded border border-zinc-800 bg-zinc-900/50 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">
                {REPRESENTATIVE_IMPACT_LABEL}
              </span>
              <span className="rounded border border-zinc-800 bg-zinc-900/50 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                D ≈ {risk.diameter_m.toFixed(0)} m · v = {risk.velocity_km_s.toFixed(0)} km/s
              </span>
              {risk.cities_in_zone.length > 1 && (
                <span className="rounded border border-zinc-800 bg-zinc-900/50 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                  + {risk.cities_in_zone.length - 1} more metro{" "}
                  {risk.cities_in_zone.length - 1 === 1 ? "area" : "areas"}
                </span>
              )}
            </div>

            <p className="mt-3 rounded border border-zinc-800 bg-zinc-950/60 px-2 py-1.5 text-[10px] leading-relaxed text-zinc-500">
              <span className="font-semibold text-zinc-400">Demo-grade synthetic.</span>{" "}
              {risk.caveat} Methodology: {risk.methodology} Casualty fraction inside
              severe-damage zone assumed at {(risk.casualty_fraction_assumed * 100).toFixed(0)}%
              (Glasstone & Dolan 1977 midpoint). Phase 2 roadmap →{" "}
              <span className="font-mono">docs/production-readiness-roadmap.md</span>
            </p>
          </>
        )}
      </div>
    </section>
  );
}

function Headline({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "amber" | "orange" | "red";
}) {
  const text =
    tone === "red" ? "text-red-300" : tone === "orange" ? "text-orange-300" : "text-amber-300";
  return (
    <div className="rounded border border-zinc-800 bg-black/40 px-2.5 py-2">
      <p className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <p className={`mt-0.5 font-mono text-[18px] font-semibold ${text}`}>{value}</p>
      <p className="font-mono text-[9px] text-zinc-500">{sub}</p>
    </div>
  );
}
