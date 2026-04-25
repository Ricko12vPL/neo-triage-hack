import { useEffect, useState } from "react";
import { api } from "../api/client";
import type {
  PopulationRiskResponse,
  RankedCandidate,
} from "../api/types";
import { DeferredCorridorPlaceholder } from "./DeferredCorridorPlaceholder";
import { ImpactCorridor2D } from "./ImpactCorridor2D";

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
 * Three render branches drive what the operator sees per candidate:
 *   - 'demo_hypothetical': demo fixtures (P21YR4A) with impact_probability
 *     and H — full panel + amber YR4-style corridor overlay.
 *   - 'deferred_pending_od': live MPC tracklets that score as likely NEOs
 *     but have no impact_probability (orbit determination required first)
 *     — render DeferredCorridorPlaceholder instead of the full panel.
 *   - null: low-prob non-NEOs — hide entirely.
 */

interface Props {
  candidate: RankedCandidate;
}

const REPRESENTATIVE_IMPACT_LAT = 14.6;
const REPRESENTATIVE_IMPACT_LON = 120.98;
const REPRESENTATIVE_IMPACT_LABEL = "Manila metro (representative)";

const PROB_NEO_DEFER_THRESHOLD = 0.5;
const IP_FULL_PANEL_THRESHOLD = 1e-7;

type CorridorVariant = "demo_hypothetical" | "deferred_pending_od" | null;

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

/**
 * Decide which corridor variant applies to this candidate.
 *
 *   demo_hypothetical:  IP>=1e-7 and H known (drives the YR4-style demo).
 *   deferred_pending_od: live MPC, no IP, but the ranker says it's likely
 *                       a NEO — we owe the operator an explanation rather
 *                       than silently hiding the panel.
 *   null:               hide.
 */
function determineVariant(c: RankedCandidate): CorridorVariant {
  const ip = c.impact_probability ?? 0;
  const has_h = (c.absolute_magnitude_h ?? null) != null;
  if (ip >= IP_FULL_PANEL_THRESHOLD && has_h) {
    return "demo_hypothetical";
  }
  const prob_neo = c.prediction?.prob_neo ?? 0;
  if (!c.is_demo && prob_neo >= PROB_NEO_DEFER_THRESHOLD) {
    return "deferred_pending_od";
  }
  return null;
}

export function PopulationRiskPanel({ candidate }: Props) {
  const [risk, setRisk] = useState<PopulationRiskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const variant = determineVariant(candidate);
  const fullPanelEligible = variant === "demo_hypothetical";

  useEffect(() => {
    if (!fullPanelEligible) {
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
    fullPanelEligible,
  ]);

  if (variant === null) return null;
  if (variant === "deferred_pending_od") {
    return (
      <DeferredCorridorPlaceholder
        designation={candidate.trksub}
        arc_length_minutes={candidate.arc_length_minutes}
        n_observations={candidate.n_observations}
      />
    );
  }

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
                context="diameter"
                caveat={`${risk.energy_megatons_tnt.toFixed(1)} MT TNT`}
                tone="amber"
              />
              <Headline
                label="Population in zone"
                value={formatPopulation(risk.population_in_zone)}
                context={
                  risk.cities_in_zone.length > 0
                    ? risk.cities_in_zone[0]
                    : "rural / oceanic"
                }
                caveat="representative"
                tone="slate"
              />
              <Headline
                label="Expected casualties"
                value={formatCasualties(risk.expected_casualties_unconditional)}
                context={`@ P=${risk.impact_probability.toExponential(2)}`}
                caveat="weighted by IP"
                tone="red"
              />
            </div>

            <div className="mt-3">
              <ImpactCorridor2D
                impactLatitudeDeg={risk.impact_latitude_deg}
                impactLongitudeDeg={risk.impact_longitude_deg}
                damageRadiusKm={risk.severe_damage_radius_km}
                showYR4Corridor={candidate.trksub.toUpperCase().includes("YR4")}
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
  context,
  caveat,
  tone,
}: {
  label: string;
  value: string;
  context: string;
  caveat: string;
  tone: "amber" | "slate" | "red";
}) {
  const text =
    tone === "red"
      ? "text-rose-300"
      : tone === "amber"
        ? "text-amber-300"
        : "text-zinc-100";
  const ring =
    tone === "red"
      ? "border-rose-900/50"
      : tone === "amber"
        ? "border-amber-900/50"
        : "border-zinc-800";
  return (
    <div className={`rounded border ${ring} bg-black/40 px-2.5 py-2`}>
      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-500">
        {label}
      </p>
      <p className={`mt-1 font-mono text-[22px] font-bold leading-none ${text}`}>
        {value}
      </p>
      <p className="mt-1 text-[10px] text-zinc-300">{context}</p>
      <p className="font-mono text-[9px] italic text-zinc-500">{caveat}</p>
    </div>
  );
}
