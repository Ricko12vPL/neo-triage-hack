import { useMemo, useState } from "react";
import type { RankedCandidate } from "../api/types";
import { SortControl } from "./SortControl";
import { getSortFn } from "../lib/sort";
import type { SortKey } from "../lib/sort";
import type { ObserverLocation } from "../hooks/useObserverLocation";
import {
  computeVisibilityTonight,
  formatUtcTime,
  type VisibilityResult,
} from "../lib/visibility";
import { TorinoBadge } from "./TorinoBadge";
import { ExpertReviewChip } from "./ExpertReviewChip";
import { SourceBadge } from "./SourceBadge";
import { AstrometricQualityBadge } from "./AstrometricQualityBadge";

interface Props {
  candidates: RankedCandidate[];
  selected: string | null;
  onSelect: (trksub: string) => void;
  loading: boolean;
  observerLocation: ObserverLocation;
  expertReviewLoadingTrksub?: string | null;
}

function classBadgeColor(cls: string): string {
  switch (cls) {
    case "NEO":
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
    case "MBA":
      return "bg-sky-500/15 text-sky-300 border-sky-500/30";
    case "COMET":
      return "bg-violet-500/15 text-violet-300 border-violet-500/30";
    case "ARTIFACT":
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
    default:
      return "bg-amber-500/15 text-amber-300 border-amber-500/30";
  }
}

function probBarColor(prob: number): string {
  if (prob >= 0.8) return "bg-emerald-500";
  if (prob >= 0.5) return "bg-amber-500";
  if (prob >= 0.2) return "bg-orange-500";
  return "bg-zinc-700";
}

function VisibilityChip({ vis }: { vis: VisibilityResult }) {
  const { status, altitude_deg_now, set_utc, rise_utc } = vis;

  if (status === "visible_now") {
    return (
      <span className="font-mono text-[9px] text-emerald-400">
        ▲ {altitude_deg_now.toFixed(0)}°
      </span>
    );
  }
  if (status === "sets_soon") {
    return (
      <span className="font-mono text-[9px] text-amber-400">
        SETS {formatUtcTime(set_utc)}
      </span>
    );
  }
  if (status === "rises_later") {
    return (
      <span className="font-mono text-[9px] text-zinc-500">
        RISES {formatUtcTime(rise_utc)}
      </span>
    );
  }
  return (
    <span className="font-mono text-[9px] text-zinc-700">BELOW</span>
  );
}

function SkeletonRow() {
  return (
    <li className="border-b border-zinc-900 px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="skeleton h-3 w-20" />
        <div className="skeleton h-3 w-10" />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="skeleton h-1.5 flex-1" />
        <div className="skeleton h-3 w-10" />
      </div>
      <div className="mt-2 flex gap-4">
        <div className="skeleton h-2.5 w-10" />
        <div className="skeleton h-2.5 w-10" />
        <div className="skeleton h-2.5 w-10" />
      </div>
    </li>
  );
}

export function CandidateList({
  candidates,
  selected,
  onSelect,
  loading,
  observerLocation,
  expertReviewLoadingTrksub,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("p_neo_desc");
  const [phaOnly, setPhaOnly] = useState(false);
  const now = useMemo(() => new Date(), []);

  const visibilityMap = useMemo(() => {
    const map = new Map<string, VisibilityResult>();
    for (const c of candidates) {
      map.set(
        c.trksub,
        computeVisibilityTonight(
          c.ra_deg,
          c.dec_deg,
          observerLocation.latitude_deg,
          observerLocation.longitude_deg,
          now,
        ),
      );
    }
    return map;
  }, [candidates, observerLocation, now]);

  const displayed = useMemo(() => {
    const filtered = phaOnly
      ? candidates.filter((c) => c.prediction.prob_pha >= 0.1)
      : candidates;
    return [...filtered].sort(getSortFn(sortKey));
  }, [candidates, sortKey, phaOnly]);

  return (
    <aside className="flex h-full max-h-[55vh] min-h-0 flex-col border-b border-zinc-800 bg-zinc-950/40 md:max-h-none md:border-b-0 md:border-r">
      <header className="border-b border-zinc-800 px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          NEOCP Candidates
        </h2>
        <p className="mt-0.5 text-[11px] text-zinc-600">
          {(() => {
            // Counts derive purely from the candidate list — no server-side
            // count to drift from. Live = LIVE_MPC_NEOCP (or unset, default
            // live for backwards compat); Demo = DEMO_FIXTURE; Reviewed =
            // has expert_review.
            const live = candidates.filter(
              (c) =>
                !c.data_source ||
                c.data_source === "LIVE_MPC_NEOCP",
            ).length;
            const demo = candidates.filter(
              (c) => c.data_source === "DEMO_FIXTURE",
            ).length;
            const reviewed = candidates.filter((c) => c.expert_review).length;
            const segments = [
              live > 0 ? `${live} live` : null,
              demo > 0 ? `${demo} demo` : null,
              reviewed > 0 ? `${reviewed} opus-reviewed` : null,
            ].filter(Boolean);
            return segments.length > 0
              ? `${segments.join(" · ")} · click any to brief`
              : "no candidates · agent will detect within 2 min";
          })()}
        </p>
      </header>

      <div className="border-b border-zinc-900 px-4 py-2">
        <SortControl
          sortKey={sortKey}
          onSortChange={setSortKey}
          phaOnly={phaOnly}
          onPhaOnlyChange={setPhaOnly}
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <ul>
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </ul>
        )}

        {!loading && displayed.length === 0 && (
          <p className="p-4 text-sm text-zinc-500">
            {phaOnly
              ? "No PHA candidates in queue."
              : "No candidates in queue. Agent will auto-detect new NEOCP submissions every 5 minutes."}
          </p>
        )}

        <ul className="divide-y divide-zinc-900">
          {displayed.map((c) => {
            const isSelected = c.trksub === selected;
            const probNeo = c.prediction.prob_neo;
            const isPha = c.prediction.prob_pha > 0.5;
            const vis = visibilityMap.get(c.trksub);
            const isLoadingExpert =
              isSelected &&
              !c.expert_review &&
              expertReviewLoadingTrksub === c.trksub;
            return (
              <li key={c.trksub}>
                <button
                  onClick={() => onSelect(c.trksub)}
                  className={[
                    "block w-full px-4 py-3 text-left transition-colors",
                    "border-l-2",
                    isSelected
                      ? "border-l-emerald-500 bg-emerald-500/[0.07]"
                      : "border-l-transparent hover:border-l-zinc-600 hover:bg-zinc-900/60",
                  ].join(" ")}
                >
                  {/* Row 1: identifier + classification anchor */}
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-[13px] font-semibold tracking-wide text-zinc-100">
                      {c.trksub}
                    </span>
                    <span
                      className={`rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${classBadgeColor(
                        c.prediction.map_class,
                      )}`}
                    >
                      {c.prediction.map_class}
                    </span>
                  </div>

                  {/* Row 2: provenance + hazard tag strip — wraps gracefully */}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                    {vis && <VisibilityChip vis={vis} />}
                    <TorinoBadge
                      impact_probability={c.impact_probability}
                      absolute_magnitude_h={c.absolute_magnitude_h}
                      variant="inline"
                    />
                    <SourceBadge
                      source={c.data_source}
                      fetchedAt={c.data_source_fetched_at_utc}
                    />
                    {c.astrometric_quality_grade && (
                      <AstrometricQualityBadge
                        grade={c.astrometric_quality_grade}
                      />
                    )}
                    {c.expert_review ? (
                      <ExpertReviewChip review={c.expert_review} />
                    ) : (
                      isLoadingExpert && (
                        <span
                          className="inline-flex items-center gap-1 rounded-sm border border-violet-700/40 bg-violet-950/30 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-violet-300/80"
                          title="Asking Opus 4.7 for an expert review of this tracklet"
                        >
                          <span aria-hidden className="animate-pulse">
                            …
                          </span>
                          opus
                        </span>
                      )
                    )}
                  </div>

                  {/* Row 3: P(NEO) bar — the headline number */}
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1 flex-1 overflow-hidden rounded-sm bg-zinc-800/80">
                      <div
                        className={`h-full transition-all ${probBarColor(probNeo)}`}
                        style={{ width: `${(probNeo * 100).toFixed(1)}%` }}
                      />
                    </div>
                    <span className="w-10 text-right font-mono text-[11px] text-zinc-300">
                      {probNeo.toFixed(2)}
                    </span>
                  </div>

                  {/* Row 4: compact observational strip */}
                  <div className="mt-1.5 flex items-center gap-3 font-mono text-[10px] text-zinc-500">
                    <span>
                      d2{" "}
                      <span className="text-zinc-300">{c.digest2_neo_noid}</span>
                    </span>
                    <span>
                      V{" "}
                      <span className="text-zinc-300">
                        {c.mean_magnitude_v.toFixed(1)}
                      </span>
                    </span>
                    <span className="ml-auto">
                      {isPha ? (
                        <span className="font-semibold text-red-400">
                          PHA {c.prediction.prob_pha.toFixed(2)}
                        </span>
                      ) : (
                        <span>
                          r{" "}
                          <span className="text-zinc-300">
                            {c.rate_arcsec_min.toFixed(2)}″
                          </span>
                        </span>
                      )}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
