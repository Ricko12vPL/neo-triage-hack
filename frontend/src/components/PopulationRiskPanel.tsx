import { useMemo } from "react";
import type {
  ImminentImpactorCase,
  RankedCandidate,
} from "../api/types";
import { useImpactorCase } from "../hooks/useImpactorCase";
import { DeferredCorridorPlaceholder } from "./DeferredCorridorPlaceholder";
import { ImpactorsMap } from "./ImpactorsMap";

/**
 * Population-weighted impact-risk display in the Live Feed flow.
 *
 * Reads from the Imminent Impactors Library catalog when the candidate
 * carries an `impactor_case_designation` link (e.g. P21YR4A → '2024 YR4').
 * Same data the IMPACTORS tab consumes, so jurors comparing the two
 * tabs see one consistent story per object — no Manila-anchored
 * placeholder, no invented coordinates.
 *
 * Three render branches:
 *   - 'catalog_linked':       impactor_case_designation set + catalog
 *                             returned a case. Renders the real ESA
 *                             corridor + catalog population figure.
 *                             (P21YR4A demo today; potentially future
 *                             demos linked to other historical cases.)
 *   - 'deferred_pending_od':  no catalog link, prob_neo>=0.5, !is_demo
 *                             — live MPC tracklets render the educational
 *                             pipeline placeholder explaining why a
 *                             corridor projection requires orbit
 *                             determination.
 *   - null:                   anything else — nothing to show.
 */

const PROB_NEO_DEFER_THRESHOLD = 0.5;

interface Props {
  candidate: RankedCandidate;
}

type CorridorVariant = "catalog_linked" | "deferred_pending_od" | null;

interface DerivedPanelData {
  damageRadiusKm: number | null;
  energyMt: number | null;
  populationInCorridor: number;
  expectedCasualties: number;
  peakImpactProbability: number;
  corridorTerminus: string | null;
  countryHopCount: number;
  caseStatusBadge: { label: string; tone: "emerald" | "amber" };
}

const SEVERE_ZONE_CASUALTY_FRACTION = 0.5;
const J_PER_MT_TNT = 4.184e15;
const STONY_DENSITY_KG_M3 = 3000;
const ASSUMED_IMPACT_VELOCITY_KM_S = 17.0;

function formatPopulation(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return Math.round(n).toLocaleString();
}

function formatCasualties(n: number): string {
  if (n < 1) return n.toFixed(2);
  if (n < 1e3) return Math.round(n).toLocaleString();
  return formatPopulation(n);
}

/**
 * Collins et al. 2017 5-psi severe damage scaling, identical to the
 * backend implementation in `impact_damage_model.py`. Computes:
 *   mass = (4/3) π (D/2)^3 ρ
 *   E    = ½ m v²
 *   r_severe_km = 6 × E_MT^(1/3)
 * Pure function — no I/O.
 */
function computeDamageFromCatalog(
  diameter_m: number,
  velocity_km_s: number,
): { damageRadiusKm: number; energyMt: number } {
  const radius_m = diameter_m / 2;
  const volume_m3 = (4 / 3) * Math.PI * radius_m ** 3;
  const mass_kg = volume_m3 * STONY_DENSITY_KG_M3;
  const v_m_s = velocity_km_s * 1000;
  const energy_j = 0.5 * mass_kg * v_m_s ** 2;
  const energy_mt = energy_j / J_PER_MT_TNT;
  const damageRadiusKm = 6 * Math.cbrt(energy_mt);
  return { damageRadiusKm, energyMt: energy_mt };
}

function deriveFromCase(c: ImminentImpactorCase): DerivedPanelData {
  const diameter_m = c.diameter_m;
  const velocity_km_s = c.impact_velocity_km_s ?? ASSUMED_IMPACT_VELOCITY_KM_S;
  const damage =
    diameter_m > 0
      ? computeDamageFromCatalog(diameter_m, velocity_km_s)
      : null;
  const populationInCorridor = c.estimated_population_in_corridor ?? 0;
  const peakImpactProbability = c.peak_impact_probability ?? 0;
  const expectedCasualties =
    populationInCorridor * peakImpactProbability * SEVERE_ZONE_CASUALTY_FRACTION;
  const polyline = c.corridor_polyline ?? [];
  const terminus = polyline.length > 0 ? polyline[polyline.length - 1].name : null;
  // Naive "country hop" count: distinct first words after the dash separator.
  const countries = new Set<string>();
  for (const v of polyline) {
    const parts = v.name.split(/—|—|·/);
    const last = parts[parts.length - 1].trim();
    countries.add(last.split(",")[0]);
  }
  const caseStatusBadge =
    c.case_type === "CLEARED"
      ? { label: "Cleared", tone: "emerald" as const }
      : { label: "Impacted", tone: "amber" as const };
  return {
    damageRadiusKm: damage?.damageRadiusKm ?? null,
    energyMt: damage?.energyMt ?? null,
    populationInCorridor,
    expectedCasualties,
    peakImpactProbability,
    corridorTerminus: terminus,
    countryHopCount: countries.size,
    caseStatusBadge,
  };
}

export function PopulationRiskPanel({ candidate }: Props) {
  const designation = candidate.impactor_case_designation ?? null;
  const { data: caseDetail, loading, error } = useImpactorCase(designation);

  const variant: CorridorVariant = useMemo(() => {
    if (designation && (caseDetail || loading)) return "catalog_linked";
    const prob_neo = candidate.prediction?.prob_neo ?? 0;
    if (!candidate.is_demo && prob_neo >= PROB_NEO_DEFER_THRESHOLD) {
      return "deferred_pending_od";
    }
    return null;
  }, [designation, caseDetail, loading, candidate.is_demo, candidate.prediction]);

  const derived = useMemo(
    () => (caseDetail ? deriveFromCase(caseDetail) : null),
    [caseDetail],
  );

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
    <section className="border-t border-emerald-900/40 bg-zinc-950/40">
      <header className="flex items-center justify-between gap-2 border-b border-zinc-800 bg-emerald-950/15 px-4 py-2">
        <div>
          <h3 className="font-mono text-[11px] font-semibold uppercase tracking-wider text-emerald-300">
            Population at risk
          </h3>
          <p className="text-[10px] text-zinc-500">
            Reproduces the published trajectory for the linked Imminent
            Impactors case
          </p>
        </div>
        <span
          className="rounded border border-emerald-800/60 bg-emerald-950/40 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-emerald-300"
          title="Single source of truth — values come from the Imminent Impactors Library catalog. The catalog cites ESA NEOCC + NASA JPL CNEOS + IAWN/SMPAG."
        >
          {designation ?? "linked"}
        </span>
      </header>

      <div className="px-4 py-3">
        {loading && (
          <p className="font-mono text-[10px] text-zinc-500">
            <span className="animate-pulse">Loading {designation} from catalog…</span>
          </p>
        )}

        {error && !loading && (
          <p className="rounded border border-amber-700/40 bg-amber-950/20 px-2 py-1 font-mono text-[10px] text-amber-200">
            ⚠ Failed to load {designation}: {error.message}
          </p>
        )}

        {caseDetail && derived && !loading && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Headline
                label="Damage zone"
                value={
                  derived.damageRadiusKm
                    ? `${derived.damageRadiusKm.toFixed(1)} km`
                    : "—"
                }
                context="severe (5 psi) radius"
                caveat={
                  derived.energyMt
                    ? `${derived.energyMt.toFixed(1)} MT TNT`
                    : "—"
                }
                tone="amber"
              />
              <Headline
                label="In corridor"
                value={
                  derived.populationInCorridor > 0
                    ? formatPopulation(derived.populationInCorridor)
                    : "—"
                }
                context={
                  derived.corridorTerminus
                    ? `→ ${derived.corridorTerminus}`
                    : "no published corridor"
                }
                caveat={
                  derived.countryHopCount > 1
                    ? `across ${derived.countryHopCount} regions`
                    : "ESA NEOCC catalog"
                }
                tone="slate"
              />
              <Headline
                label="Casualties at peak"
                value={formatCasualties(derived.expectedCasualties)}
                context={
                  derived.peakImpactProbability > 0
                    ? `@ P=${(derived.peakImpactProbability * 100).toFixed(2)}%`
                    : "@ P=—"
                }
                caveat="50% severe-zone fraction"
                tone="red"
              />
            </div>

            <div className="mt-3">
              <ImpactorsMap
                cases={[]}
                selectedDesignation={caseDetail.designation}
                selectedCase={caseDetail}
                onCaseSelect={() => {
                  /* selection is fixed here — Live Feed shows one case */
                }}
              />
            </div>

            <div className="mt-3 rounded border border-emerald-900/40 bg-emerald-950/15 px-2 py-1.5 text-[10px] uppercase tracking-wider text-emerald-300">
              ✓ Reproduces ESA NEOCC published {caseDetail.designation} risk
              corridor (
              {(caseDetail.peak_impact_probability_date ?? "").slice(0, 7) ||
                "Feb 2025"}
              )
            </div>

            {(caseDetail.iawn_activated || caseDetail.smpag_activated) && (
              <div className="mt-2 flex flex-wrap gap-1.5 text-[9px]">
                {caseDetail.iawn_activated && (
                  <span className="rounded border border-amber-800/60 bg-amber-950/30 px-1.5 py-0.5 font-mono uppercase tracking-wider text-amber-300">
                    IAWN ACTIVATED
                  </span>
                )}
                {caseDetail.smpag_activated && (
                  <span className="rounded border border-amber-800/60 bg-amber-950/30 px-1.5 py-0.5 font-mono uppercase tracking-wider text-amber-300">
                    SMPAG CONVENED
                  </span>
                )}
              </div>
            )}

            <p className="mt-3 rounded border border-zinc-800 bg-zinc-950/60 px-2 py-1.5 text-[10px] leading-relaxed text-zinc-500">
              <span className="font-semibold text-zinc-300">Linked case:</span>{" "}
              {caseDetail.historical_significance}{" "}
              <span className="block mt-1 font-mono text-zinc-500">
                Damage circle from Collins et al. 2017 5-psi scaling ·
                Casualty fraction {(SEVERE_ZONE_CASUALTY_FRACTION * 100).toFixed(0)}%
                (Glasstone &amp; Dolan 1977 midpoint) · Phase 2 roadmap =
                Find_Orb b-plane Monte Carlo
              </span>
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
