import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client";
import type {
  ImminentImpactorCase,
  ImminentImpactorsSummary,
} from "../api/types";
import { ImpactorCaseCard } from "./ImpactorCaseCard";
import { ImpactorsMap } from "./ImpactorsMap";

/**
 * IMPACTORS tab — split layout:
 *   left  → chronological library list (6 compact cards + filters)
 *   right → ImpactorsMap (corridor + markers) above an expanded
 *           ImpactorCaseCard for the selected designation
 *
 * Default selection: 2024 YR4 (the modern reference of how planetary
 * defense is supposed to work end-to-end). Operators can browse by
 * status filter or by clicking a marker on the map.
 *
 * The library is fully driven by the backend catalog — adding a case
 * means appending to imminent_impactors_catalog.json, no frontend
 * changes required.
 */

type Filter = "all" | "cleared" | "meteorites" | "ocean";

const DEFAULT_DESIGNATION = "2024 YR4";

function passesFilter(s: ImminentImpactorsSummary, f: Filter): boolean {
  if (f === "all") return true;
  if (f === "cleared") return s.case_type === "CLEARED";
  if (f === "meteorites") return s.has_meteorite_recovery;
  if (f === "ocean")
    return s.case_type === "IMPACTED" && !s.has_meteorite_recovery;
  return true;
}

function filterCount(
  summaries: ImminentImpactorsSummary[],
  f: Filter,
): number {
  return summaries.filter((s) => passesFilter(s, f)).length;
}

export function ImminentImpactorsLibrary() {
  const [summaries, setSummaries] = useState<ImminentImpactorsSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedDesignation, setSelectedDesignation] = useState<string | null>(
    null,
  );
  const [selectedCase, setSelectedCase] = useState<ImminentImpactorCase | null>(
    null,
  );
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [selectedError, setSelectedError] = useState<string | null>(null);

  // Cache full case details to avoid re-fetching on selection toggles.
  const caseCache = useRef<Map<string, ImminentImpactorCase>>(new Map());

  // Load summaries once on mount.
  useEffect(() => {
    let cancelled = false;
    api
      .imminentImpactors()
      .then((data) => {
        if (cancelled) return;
        setSummaries(data);
        // Choose default designation if 2024 YR4 is in the catalog.
        if (data.some((s) => s.designation === DEFAULT_DESIGNATION)) {
          setSelectedDesignation(DEFAULT_DESIGNATION);
        } else if (data.length > 0) {
          setSelectedDesignation(data[0].designation);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setLoadError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load full case detail whenever selection changes.
  useEffect(() => {
    if (!selectedDesignation) {
      setSelectedCase(null);
      return;
    }
    const cached = caseCache.current.get(selectedDesignation);
    if (cached) {
      setSelectedCase(cached);
      setSelectedError(null);
      return;
    }
    let cancelled = false;
    setSelectedLoading(true);
    setSelectedError(null);
    api
      .imminentImpactor(selectedDesignation)
      .then((c) => {
        if (cancelled) return;
        caseCache.current.set(selectedDesignation, c);
        setSelectedCase(c);
      })
      .catch((err: Error) => {
        if (!cancelled) setSelectedError(err.message);
      })
      .finally(() => {
        if (!cancelled) setSelectedLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDesignation]);

  const visible = useMemo(
    () => summaries.filter((s) => passesFilter(s, filter)),
    [summaries, filter],
  );

  // Chronological by discovery_date (catalog already orders this way,
  // but sort defensively for filters that may rearrange visually).
  const sortedVisible = useMemo(
    () =>
      [...visible].sort((a, b) =>
        a.discovery_date_utc.localeCompare(b.discovery_date_utc),
      ),
    [visible],
  );

  const counts = useMemo(
    () => ({
      all: summaries.length,
      cleared: filterCount(summaries, "cleared"),
      meteorites: filterCount(summaries, "meteorites"),
      ocean: filterCount(summaries, "ocean"),
    }),
    [summaries],
  );

  return (
    <div className="grid h-full grid-cols-1 gap-4 overflow-hidden p-4 lg:grid-cols-[minmax(360px,420px)_1fr]">
      {/* Left — library list */}
      <section className="flex min-h-0 flex-col rounded border border-zinc-800 bg-zinc-950/60">
        <header className="border-b border-zinc-800 px-4 py-3">
          <h2 className="font-mono text-sm font-bold text-zinc-100">
            Imminent Impactors Library
          </h2>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
            Eight pre-impact predictions in human history. neo-triage references
            six with verified published trajectory data — no invented
            coordinates, every value sourced from peer-reviewed papers or
            agency publications (NASA JPL CNEOS, ESA NEOCC, IAWN, SMPAG).
          </p>
        </header>

        <div className="flex flex-wrap gap-1.5 border-b border-zinc-800 px-4 py-2.5">
          <FilterPill
            label="All"
            count={counts.all}
            active={filter === "all"}
            onClick={() => setFilter("all")}
          />
          <FilterPill
            label="Cleared"
            count={counts.cleared}
            active={filter === "cleared"}
            onClick={() => setFilter("cleared")}
          />
          <FilterPill
            label="Meteorites"
            count={counts.meteorites}
            active={filter === "meteorites"}
            onClick={() => setFilter("meteorites")}
          />
          <FilterPill
            label="Ocean"
            count={counts.ocean}
            active={filter === "ocean"}
            onClick={() => setFilter("ocean")}
          />
        </div>

        {loadError && (
          <div className="m-3 rounded border border-rose-800/50 bg-rose-950/30 px-3 py-2 text-[11px] text-rose-200">
            Failed to load library: {loadError}
          </div>
        )}

        <ul className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
          {sortedVisible.length === 0 && summaries.length > 0 && (
            <li className="px-2 py-4 text-center text-[11px] text-zinc-500">
              No cases match this filter.
            </li>
          )}
          {sortedVisible.map((s) => (
            <li key={s.designation}>
              <CompactCaseRow
                summary={s}
                selected={s.designation === selectedDesignation}
                onClick={() => setSelectedDesignation(s.designation)}
              />
            </li>
          ))}
        </ul>
      </section>

      {/* Right — map + expanded card */}
      <section className="flex min-h-0 flex-col gap-4 overflow-hidden">
        <div className="shrink-0">
          <ImpactorsMap
            cases={summaries}
            selectedDesignation={selectedDesignation}
            selectedCase={selectedCase}
            onCaseSelect={setSelectedDesignation}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {selectedLoading && (
            <p className="font-mono text-[11px] text-zinc-500">Loading case…</p>
          )}
          {selectedError && (
            <p className="rounded border border-rose-800/50 bg-rose-950/30 px-3 py-2 text-[11px] text-rose-200">
              Failed to load case detail: {selectedError}
            </p>
          )}
          {selectedCase && !selectedLoading && (
            <ImpactorCaseCard caseDetail={selectedCase} compact={false} />
          )}
        </div>
      </section>
    </div>
  );
}

function FilterPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        "rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors",
        active
          ? "border-zinc-500 bg-zinc-700 text-zinc-100"
          : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200",
      ].join(" ")}
    >
      {label}
      <span className="ml-1 text-zinc-500">({count})</span>
    </button>
  );
}

function CompactCaseRow({
  summary,
  selected,
  onClick,
}: {
  summary: ImminentImpactorsSummary;
  selected: boolean;
  onClick: () => void;
}) {
  const accent =
    summary.case_type === "CLEARED"
      ? "text-emerald-300"
      : summary.has_meteorite_recovery
        ? "text-sky-300"
        : "text-slate-300";
  const borderLeft =
    summary.case_type === "CLEARED"
      ? "border-l-2 border-l-emerald-500"
      : summary.has_meteorite_recovery
        ? "border-l-2 border-l-sky-500"
        : "border-l-2 border-l-slate-500";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={[
        "w-full rounded border bg-zinc-950/80 px-3 py-2 text-left transition-colors",
        borderLeft,
        selected
          ? "border-zinc-500"
          : "border-zinc-800 hover:border-zinc-700",
      ].join(" ")}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className={`font-mono text-[12px] font-bold ${accent}`}>
          {summary.designation}
        </span>
        <span className="font-mono text-[10px] text-zinc-500">
          {summary.discovery_date_utc.slice(0, 10)}
        </span>
      </div>
      <p className="mt-0.5 truncate text-[10px] text-zinc-400">
        {summary.impact_location_name ?? "—"}
      </p>
      <p className="mt-0.5 text-[9px] uppercase tracking-wider text-zinc-500">
        {summary.diameter_m.toFixed(summary.diameter_m < 1 ? 2 : 1)} m
        {summary.case_type === "CLEARED"
          ? " · cleared"
          : summary.has_meteorite_recovery
            ? " · recovered"
            : " · ocean"}
      </p>
    </button>
  );
}
