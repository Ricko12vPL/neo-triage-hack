import { lazy, Suspense, useMemo, useState } from "react";
import type { RankedCandidate } from "../api/types";
import { SkyViewPanel } from "./SkyViewPanel";
import { CandidateDetailsPanel } from "./CandidateDetailsPanel";
import { FamousNEODetailsPanel } from "./FamousNEODetailsPanel";
import { FAMOUS_NEOS } from "../lib/famous_neos";

// Orbit View is lazy — users who never toggle don't download it.
const OrbitViewPanel = lazy(() =>
  import("./OrbitViewPanel").then((m) => ({ default: m.OrbitViewPanel })),
);

interface Props {
  candidates: RankedCandidate[];
  selectedTrksub: string | null;
  onOpenFullBriefing: (trksub: string) => void;
}

type ViewMode = "sky" | "orbit";

const NASA_EYES_URL = "https://eyes.nasa.gov/apps/asteroids/#/home";

export function SkyViewContainer({
  candidates,
  selectedTrksub,
  onOpenFullBriefing,
}: Props) {
  const [iframeFailed, setIframeFailed] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("sky");
  const [inspectedTrksub, setInspectedTrksub] = useState<string | null>(
    selectedTrksub,
  );
  const [inspectedFamousDesignation, setInspectedFamousDesignation] = useState<
    string | null
  >(null);

  const inspected = candidates.find((c) => c.trksub === inspectedTrksub) ?? null;
  const inspectedFamous = useMemo(
    () =>
      inspectedFamousDesignation
        ? FAMOUS_NEOS.find(
            (n) => n.designation === inspectedFamousDesignation,
          ) ?? null
        : null,
    [inspectedFamousDesignation],
  );

  const handleFamousNEOClick = (designation: string) => {
    setInspectedTrksub(null);
    setInspectedFamousDesignation(designation);
  };

  const handleCandidateClick = (trksub: string) => {
    setInspectedFamousDesignation(null);
    setInspectedTrksub(trksub);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* TOP — OUR TRIAGE */}
      <div className="relative flex-1 border-b border-zinc-800 bg-[#04060a] min-h-0">
        <div className="pointer-events-none absolute left-4 top-3 z-10 text-[10px] font-mono uppercase tracking-widest text-zinc-400">
          {viewMode === "sky"
            ? `Our triage · tonight · ${candidates.length} candidates`
            : "Orbit view · heliocentric · J2000 elements"}
        </div>

        {/* View mode toggle */}
        <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2">
          <div
            className="inline-flex overflow-hidden rounded-full border border-zinc-700/80 bg-zinc-950/90 backdrop-blur-sm"
            role="tablist"
            aria-label="Visualisation mode"
          >
            <button
              role="tab"
              aria-selected={viewMode === "sky"}
              onClick={() => setViewMode("sky")}
              className={`px-3 py-1 text-[10px] font-mono uppercase tracking-widest transition-colors ${
                viewMode === "sky"
                  ? "bg-blue-950/70 text-blue-200"
                  : "text-zinc-500 hover:text-zinc-200"
              }`}
            >
              🌍 Sky view
            </button>
            <button
              role="tab"
              aria-selected={viewMode === "orbit"}
              onClick={() => setViewMode("orbit")}
              className={`px-3 py-1 text-[10px] font-mono uppercase tracking-widest transition-colors ${
                viewMode === "orbit"
                  ? "bg-violet-950/70 text-violet-200"
                  : "text-zinc-500 hover:text-zinc-200"
              }`}
            >
              ☀ Orbit view
            </button>
          </div>
        </div>

        {viewMode === "sky" ? (
          <>
            <div className="pointer-events-none absolute right-4 top-3 z-10 flex flex-col items-end gap-1 text-[9px] font-mono uppercase tracking-wider text-zinc-500">
              <div>
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500 align-middle mr-1" />
                Torino 3+
              </div>
              <div>
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500 align-middle mr-1" />
                Torino 2
              </div>
              <div>
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500 align-middle mr-1" />
                Routine
              </div>
            </div>
            <div className="pointer-events-none absolute bottom-3 left-4 z-10 text-[9px] font-mono uppercase tracking-wider text-zinc-600">
              Celestial sphere · drag to rotate · scroll to zoom · click a point to inspect
            </div>
            <div className="pointer-events-none absolute bottom-3 right-4 z-10 text-[9px] font-mono uppercase tracking-wider text-zinc-600">
              <span className="text-violet-500/80">— —</span> ecliptic ·{" "}
              <span className="text-slate-500/80">— —</span> celestial equator
            </div>
            <SkyViewPanel
              candidates={candidates}
              selectedTrksub={inspectedTrksub}
              onCandidateClick={handleCandidateClick}
              onFamousNEOClick={handleFamousNEOClick}
              selectedFamousNEODesignation={inspectedFamousDesignation}
            />
          </>
        ) : (
          <>
            <div className="pointer-events-none absolute right-4 top-3 z-10 flex flex-col items-end gap-1 text-[9px] font-mono uppercase tracking-wider text-zinc-500">
              <div>
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-400 align-middle mr-1" />
                Apollo
              </div>
              <div>
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-orange-400 align-middle mr-1" />
                Aten
              </div>
              <div>
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400 align-middle mr-1" />
                Amor
              </div>
              <div>
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-400 align-middle mr-1" />
                Comet
              </div>
              <div>
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-500 align-middle mr-1" />
                Main belt
              </div>
            </div>
            <div className="pointer-events-none absolute bottom-3 left-4 z-10 text-[9px] font-mono uppercase tracking-wider text-zinc-600">
              Sun-centred · drag to rotate · scroll to zoom · click a dot to inspect
            </div>
            <div className="pointer-events-none absolute bottom-3 right-4 z-10 text-[9px] font-mono uppercase tracking-wider text-zinc-600">
              1 unit = 1 AU · current positions from Keplerian elements
            </div>
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                    loading heliocentric scene…
                  </div>
                </div>
              }
            >
              <OrbitViewPanel
                onSelectFamousNEO={handleFamousNEOClick}
                selectedDesignation={inspectedFamousDesignation}
              />
            </Suspense>
          </>
        )}

        {inspected && viewMode === "sky" && (
          <CandidateDetailsPanel
            candidate={inspected}
            onClose={() => setInspectedTrksub(null)}
            onOpenFullBriefing={() => {
              onOpenFullBriefing(inspected.trksub);
            }}
          />
        )}
        {inspectedFamous && !inspected && (
          <FamousNEODetailsPanel
            neo={inspectedFamous}
            onClose={() => setInspectedFamousDesignation(null)}
          />
        )}
      </div>

      {/* BOTTOM — NASA EYES CONTEXT */}
      <div className="relative h-[38vh] min-h-[260px] flex-none bg-black">
        <div className="pointer-events-none absolute left-4 top-3 z-10 text-[10px] font-mono uppercase tracking-widest text-zinc-400">
          Planetary context · NASA Eyes on Asteroids · 37k+ NEO population
        </div>
        <div className="pointer-events-none absolute bottom-3 left-4 z-10 hidden max-w-md rounded bg-black/60 p-2 text-[10px] text-zinc-400 backdrop-blur-sm sm:block">
          Above: what <em>we</em> are watching. Below: the full catalog NASA/JPL
          tracks in 2026 — every labelled point is a known NEO. Rubin
          Observatory will add ~130 new candidates per night starting 2027.
          Follow-up capacity doesn't scale 8×. That's the problem neo-triage
          exists to solve.
        </div>
        <a
          href={NASA_EYES_URL}
          target="_blank"
          rel="noreferrer"
          className="absolute right-4 top-3 z-10 rounded border border-zinc-700 bg-zinc-900/80 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-zinc-300 hover:bg-zinc-800 hover:text-white"
        >
          Open in new tab ↗
        </a>
        {iframeFailed ? (
          <div className="flex h-full items-center justify-center">
            <img
              src="/nasa-eyes-neo-population.png"
              alt="NASA Eyes on Asteroids — NEO population"
              className="max-h-full max-w-full object-contain"
            />
          </div>
        ) : (
          <iframe
            src={NASA_EYES_URL}
            title="NASA Eyes on Asteroids"
            className="h-full w-full border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            onError={() => setIframeFailed(true)}
          />
        )}
      </div>
    </div>
  );
}
