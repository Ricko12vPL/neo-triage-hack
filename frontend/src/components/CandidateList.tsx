import { useMemo, useState } from "react";
import type { RankedCandidate } from "../api/types";
import { getSortFn, SortControl } from "./SortControl";
import type { SortKey } from "./SortControl";
import type { ObserverLocation } from "../hooks/useObserverLocation";
import {
  computeVisibilityTonight,
  formatUtcTime,
  type VisibilityResult,
} from "../lib/visibility";

interface Props {
  candidates: RankedCandidate[];
  selected: string | null;
  onSelect: (trksub: string) => void;
  loading: boolean;
  observerLocation: ObserverLocation;
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
    <aside className="flex h-full flex-col border-r border-zinc-800 bg-zinc-950/40">
      <header className="border-b border-zinc-800 px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          NEOCP Candidates
        </h2>
        <p className="mt-0.5 text-[11px] text-zinc-600">
          {candidates.length} objects · click to brief
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
            return (
              <li key={c.trksub}>
                <button
                  onClick={() => onSelect(c.trksub)}
                  className={[
                    "block w-full px-4 py-2.5 text-left transition-colors",
                    "border-l-2",
                    isSelected
                      ? "border-l-emerald-500 bg-emerald-500/8"
                      : "border-l-transparent hover:border-l-zinc-600 hover:bg-zinc-900/60",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[13px] text-zinc-200">
                      {c.trksub}
                    </span>
                    <div className="flex items-center gap-2">
                      {vis && <VisibilityChip vis={vis} />}
                      <span
                        className={`rounded-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${classBadgeColor(
                          c.prediction.map_class,
                        )}`}
                      >
                        {c.prediction.map_class}
                      </span>
                    </div>
                  </div>

                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1 flex-1 overflow-hidden bg-zinc-800">
                      <div
                        className={`h-full transition-all ${probBarColor(probNeo)}`}
                        style={{ width: `${(probNeo * 100).toFixed(1)}%` }}
                      />
                    </div>
                    <span className="w-10 text-right font-mono text-[11px] text-zinc-400">
                      {probNeo.toFixed(2)}
                    </span>
                  </div>

                  <div className="mt-1.5 grid grid-cols-3 gap-x-2 text-[10px] text-zinc-500">
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
                    <span>
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
