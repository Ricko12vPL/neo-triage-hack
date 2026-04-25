import { useState } from "react";
import type { ImminentImpactorCase } from "../api/types";

/**
 * Card for one entry in the Imminent Impactors Library.
 *
 * Three status-aware visual variants:
 *   - CLEARED                 → emerald accent (2024 YR4)
 *   - IMPACTED w/ recovery    → sky accent (TC3, CX1, BX1)
 *   - IMPACTED w/o recovery   → slate accent (2014 AA, 2022 EB5 — ocean)
 *
 * Always shows: designation, case number in history, discovery info,
 * diameter, impact data (if available), historical significance.
 * Conditionally shows: meteorite recovery section, IAWN/SMPAG badges,
 * peak Torino + impact probability (cleared cases), corridor population.
 *
 * Sources are collapsible — every numeric value in this card traces
 * back to >=2 of the listed sources.
 *
 * `compact={true}` shrinks padding + body density for the library list
 * (multiple cards in a column). `compact={false}` is the expanded view
 * shown when one card is selected.
 */

interface Props {
  caseDetail: ImminentImpactorCase;
  compact?: boolean;
  selected?: boolean;
  onClick?: () => void;
}

interface VariantTokens {
  accent: string;
  borderLeft: string;
  badgeBg: string;
  badgeText: string;
  badgeLabel: string;
}

function variantTokens(c: ImminentImpactorCase): VariantTokens {
  if (c.case_type === "CLEARED") {
    return {
      accent: "text-emerald-300",
      borderLeft: "border-l-2 border-l-emerald-500",
      badgeBg: "bg-emerald-950/60 border-emerald-800/60",
      badgeText: "text-emerald-300",
      badgeLabel: "CLEARED",
    };
  }
  if (c.meteorite_recovery) {
    return {
      accent: "text-sky-300",
      borderLeft: "border-l-2 border-l-sky-500",
      badgeBg: "bg-sky-950/60 border-sky-800/60",
      badgeText: "text-sky-300",
      badgeLabel: "METEORITES RECOVERED",
    };
  }
  return {
    accent: "text-slate-300",
    borderLeft: "border-l-2 border-l-slate-500",
    badgeBg: "bg-slate-900/60 border-slate-700/60",
    badgeText: "text-slate-300",
    badgeLabel: "OCEAN IMPACT",
  };
}

function formatDiscoveryDate(iso: string): string {
  // Catalog uses ISO datetimes; show YYYY-MM-DD for the card.
  return iso.slice(0, 10);
}

function ordinal(n: number): string {
  if (n === 0) return "headline reference case";
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]} ever pre-impact prediction`;
}

export function ImpactorCaseCard({
  caseDetail,
  compact = false,
  selected = false,
  onClick,
}: Props) {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const tokens = variantTokens(caseDetail);

  const wrapperBase = `rounded border bg-zinc-950/80 ${tokens.borderLeft}`;
  const wrapperBorder = selected
    ? "border-zinc-500"
    : "border-zinc-800 hover:border-zinc-700";
  const padding = compact ? "px-3 py-2.5" : "px-4 py-3";

  return (
    <article
      className={`${wrapperBase} ${wrapperBorder} ${padding} ${onClick ? "cursor-pointer" : ""} transition-colors`}
      onClick={onClick}
      data-designation={caseDetail.designation}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <h4 className={`font-mono text-[14px] font-bold ${tokens.accent}`}>
              {caseDetail.designation}
            </h4>
            {caseDetail.designation_temporary && (
              <span className="font-mono text-[10px] text-zinc-500">
                ({caseDetail.designation_temporary})
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[10px] uppercase tracking-wider text-zinc-500">
            {ordinal(caseDetail.case_number_in_history)}
          </p>
        </div>
        <span
          className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider ${tokens.badgeBg} ${tokens.badgeText}`}
        >
          {tokens.badgeLabel}
        </span>
      </header>

      <dl className="mt-2 grid grid-cols-[110px_1fr] gap-x-2 gap-y-1 text-[11px]">
        <DataRow label="Discovery">
          <span className="font-mono text-zinc-200">
            {formatDiscoveryDate(caseDetail.discovery_date_utc)}
          </span>{" "}
          <span className="text-zinc-400">
            · {caseDetail.discovery_observer}
          </span>
        </DataRow>
        <DataRow label="Observatory">
          <span className="text-zinc-300">
            {caseDetail.discovery_observatory}
          </span>
        </DataRow>
        {caseDetail.warning_time_hours != null && (
          <DataRow label="Warning time">
            <span className="font-mono text-amber-200">
              {caseDetail.warning_time_hours.toFixed(1)} h
            </span>
          </DataRow>
        )}
        <DataRow label="Diameter">
          <span className="font-mono text-zinc-200">
            {caseDetail.diameter_m.toFixed(caseDetail.diameter_m < 1 ? 2 : 1)} m
          </span>
          {caseDetail.diameter_uncertainty_m != null && (
            <span className="text-zinc-500">
              {" "}
              ± {caseDetail.diameter_uncertainty_m.toFixed(2)} m
            </span>
          )}
          {caseDetail.spectral_type && (
            <span className="ml-1 text-zinc-400">
              · {caseDetail.spectral_type}
            </span>
          )}
        </DataRow>

        {caseDetail.case_type === "IMPACTED" && (
          <>
            <DataRow label="Impact UTC">
              <span className="font-mono text-zinc-200">
                {caseDetail.impact_time_utc?.replace("T", " ").replace("Z", "Z")}
              </span>
            </DataRow>
            <DataRow label="Impact lat/lon">
              <span className="font-mono text-zinc-200">
                {caseDetail.impact_lat_deg?.toFixed(2)}°,{" "}
                {caseDetail.impact_lon_deg?.toFixed(2)}°
              </span>
              {caseDetail.impact_uncertainty_km != null && (
                <span className="text-zinc-500">
                  {" "}
                  ± {caseDetail.impact_uncertainty_km < 1
                    ? `${(caseDetail.impact_uncertainty_km * 1000).toFixed(0)} m`
                    : `${caseDetail.impact_uncertainty_km.toFixed(0)} km`}
                </span>
              )}
            </DataRow>
            <DataRow label="Location">
              <span className="text-zinc-300">
                {caseDetail.impact_location_name}
              </span>
            </DataRow>
            {caseDetail.impact_velocity_km_s != null && (
              <DataRow label="Velocity">
                <span className="font-mono text-zinc-200">
                  {caseDetail.impact_velocity_km_s.toFixed(1)} km/s
                </span>
                {caseDetail.impact_energy_kt_tnt != null && (
                  <span className="text-zinc-500">
                    {" "}
                    · {caseDetail.impact_energy_kt_tnt < 1
                      ? `${(caseDetail.impact_energy_kt_tnt * 1000).toFixed(0)} t`
                      : `${caseDetail.impact_energy_kt_tnt.toFixed(1)} kt`}{" "}
                    TNT
                  </span>
                )}
                {caseDetail.explosion_altitude_km != null && (
                  <span className="text-zinc-500">
                    {" "}
                    · airburst {caseDetail.explosion_altitude_km.toFixed(0)} km
                  </span>
                )}
              </DataRow>
            )}
          </>
        )}

        {caseDetail.case_type === "CLEARED" && (
          <>
            {caseDetail.peak_torino_scale != null && (
              <DataRow label="Peak Torino">
                <span className="font-mono text-amber-300">
                  {caseDetail.peak_torino_scale}
                </span>
                {caseDetail.peak_impact_probability != null && (
                  <span className="text-zinc-400">
                    {" "}
                    · P(impact) ={" "}
                    <span className="font-mono text-amber-200">
                      {(caseDetail.peak_impact_probability * 100).toFixed(1)}%
                    </span>
                  </span>
                )}
              </DataRow>
            )}
            {caseDetail.cleared_date && (
              <DataRow label="Cleared">
                <span className="font-mono text-emerald-300">
                  {caseDetail.cleared_date}
                </span>
                {caseDetail.cleared_by && (
                  <span className="text-zinc-400">
                    {" "}
                    · {caseDetail.cleared_by}
                  </span>
                )}
              </DataRow>
            )}
            {caseDetail.estimated_population_in_corridor != null && (
              <DataRow label="In corridor">
                <span className="font-mono text-rose-300">
                  ~
                  {(
                    caseDetail.estimated_population_in_corridor / 1e6
                  ).toFixed(0)}
                  M people
                </span>
              </DataRow>
            )}
          </>
        )}
      </dl>

      {/* Meteorite recovery section */}
      {caseDetail.meteorite_recovery && !compact && (
        <div className="mt-2.5 rounded border border-sky-900/40 bg-sky-950/20 px-2.5 py-2">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-sky-300">
            Meteorite recovery
          </p>
          <p className="mt-1 font-mono text-[12px] font-bold text-sky-200">
            {caseDetail.meteorite_recovery.name}
            <span className="ml-2 font-normal text-zinc-400">
              · {caseDetail.meteorite_recovery.meteorite_class}
            </span>
          </p>
          <p className="mt-0.5 text-[10px] text-zinc-300">
            <span className="font-mono">
              {caseDetail.meteorite_recovery.fragments_recovered}
            </span>{" "}
            fragments
            {caseDetail.meteorite_recovery.total_mass_kg != null && (
              <>
                {" "}
                ·{" "}
                <span className="font-mono">
                  {caseDetail.meteorite_recovery.total_mass_kg.toFixed(1)} kg
                </span>{" "}
                total
              </>
            )}{" "}
            · first recovered{" "}
            <span className="font-mono">
              {caseDetail.meteorite_recovery.first_recovery_date}
            </span>
          </p>
          <p className="mt-0.5 text-[10px] text-zinc-400">
            {caseDetail.meteorite_recovery.search_lead}
          </p>
        </div>
      )}

      {/* IAWN / SMPAG */}
      {(caseDetail.iawn_activated || caseDetail.smpag_activated) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {caseDetail.iawn_activated && (
            <span className="rounded border border-amber-800/60 bg-amber-950/30 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-amber-300">
              IAWN ACTIVATED
            </span>
          )}
          {caseDetail.smpag_activated && (
            <span className="rounded border border-amber-800/60 bg-amber-950/30 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-amber-300">
              SMPAG CONVENED
            </span>
          )}
        </div>
      )}

      {/* Historical significance prose */}
      {!compact && (
        <p className="mt-2 text-[11px] italic leading-relaxed text-zinc-400">
          {caseDetail.historical_significance}
        </p>
      )}

      {/* Sources */}
      {!compact && (
        <div className="mt-2.5 border-t border-zinc-800 pt-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSourcesOpen((v) => !v);
            }}
            className="flex w-full items-center justify-between text-[10px] uppercase tracking-wider text-zinc-500 hover:text-zinc-300"
            aria-expanded={sourcesOpen}
          >
            <span>Sources ({caseDetail.sources.length})</span>
            <span aria-hidden className="font-mono">
              {sourcesOpen ? "▴" : "▾"}
            </span>
          </button>
          {sourcesOpen && (
            <ul className="mt-1.5 space-y-1 text-[10px]">
              {caseDetail.sources.map((src) => {
                const isUrl = src.startsWith("http");
                return (
                  <li
                    key={src}
                    className="break-all leading-snug text-zinc-400"
                  >
                    {isUrl ? (
                      <a
                        href={src}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-zinc-300 underline-offset-2 hover:text-zinc-100 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                        title="Verified data from this source"
                      >
                        {src}
                      </a>
                    ) : (
                      <span>{src}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </article>
  );
}

function DataRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
        {label}
      </dt>
      <dd className="text-zinc-300">{children}</dd>
    </>
  );
}
