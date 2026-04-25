import { lazy, Suspense, useEffect, useMemo, useState } from "react";
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
  // H-3: cookie-consent modals from NASA Eyes can hijack the iframe in
  // some EU/UK regions. iframeFailed catches load errors; forceStaticContext
  // is the demo-safety manual override (button below). Default: iframe.
  const [iframeFailed, setIframeFailed] = useState(false);
  const [forceStaticContext, setForceStaticContext] = useState(false);
  const useStaticContext = iframeFailed || forceStaticContext;
  const [viewMode, setViewMode] = useState<ViewMode>("sky");
  const [inspectedTrksub, setInspectedTrksub] = useState<string | null>(
    selectedTrksub,
  );
  const [inspectedFamousDesignation, setInspectedFamousDesignation] = useState<
    string | null
  >(null);

  // NASA Eyes panel collapsed by default — sits as a thin bar at the
  // bottom; click expands. Frees the whole viewport for our own
  // visualisation in default state. Preference persisted.
  const [nasaExpanded, setNasaExpanded] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("neo-triage-nasa-expanded") === "1";
  });
  useEffect(() => {
    window.localStorage.setItem(
      "neo-triage-nasa-expanded",
      nasaExpanded ? "1" : "0",
    );
  }, [nasaExpanded]);

  // F-7: context toggle — hide the famous-NEO layer and the 12k-point
  // background field so only Earth + grid + primary candidates remain.
  // Persisted so the user's preference survives tab switches.
  const [showContext, setShowContext] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const stored = window.localStorage.getItem("neo-triage-sky-show-context");
    return stored === null ? true : stored === "1";
  });
  useEffect(() => {
    window.localStorage.setItem(
      "neo-triage-sky-show-context",
      showContext ? "1" : "0",
    );
  }, [showContext]);

  // Class filter — start with all classes visible. Filter applies to
  // both Sky View markers and (when ?listFilter is wired up) Live Feed.
  const [classFilter, setClassFilter] = useState<{
    NEO: boolean;
    MBA: boolean;
    COMET: boolean;
    ARTIFACT: boolean;
  }>({ NEO: true, MBA: true, COMET: true, ARTIFACT: true });
  const visibleCandidates = useMemo(
    () =>
      candidates.filter((c) => {
        const cls = c.prediction.map_class;
        if (cls === "NEO") return classFilter.NEO;
        if (cls === "MBA") return classFilter.MBA;
        if (cls === "COMET") return classFilter.COMET;
        if (cls === "ARTIFACT") return classFilter.ARTIFACT;
        // UNCONFIRMED is treated as 'always show' — no filter for that bucket.
        return true;
      }),
    [candidates, classFilter],
  );

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
        {(() => {
          // Mirror of SkyViewPanel's Triage Focus filter so the header
          // count reflects what the operator actually sees on the sphere.
          const ACTION_FOCUS = new Set([
            "follow_up_immediately",
            "request_second_epoch",
          ]);
          const focused = candidates.filter(
            (c) =>
              c.prediction.prob_neo >= 0.5 ||
              (c.expert_review?.suggested_action != null &&
                ACTION_FOCUS.has(c.expert_review.suggested_action)),
          ).length;
          const skyLabel = showContext
            ? `Our triage · tonight · ${candidates.length} candidates`
            : `Triage focus · ${focused} of ${candidates.length} need a decision`;
          return (
            <div className="pointer-events-none absolute left-4 top-3 z-10 text-[10px] font-mono uppercase tracking-widest text-zinc-400">
              {viewMode === "sky"
                ? skyLabel
                : "Orbit view · heliocentric · J2000 elements"}
            </div>
          );
        })()}

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

        {/* Filter strip + Triage-focus toggle, centered under the
            Sky/Orbit View toggle. Visually consistent pill buttons. */}
        {viewMode === "sky" && (
          <div className="absolute left-1/2 top-[44px] z-10 flex -translate-x-1/2 items-center gap-1.5">
            {(
              [
                ["NEO", "border-emerald-700/70 bg-emerald-950/60 text-emerald-200", "border-zinc-800 bg-zinc-950/70 text-zinc-500"],
                ["MBA", "border-amber-700/70 bg-amber-950/60 text-amber-200", "border-zinc-800 bg-zinc-950/70 text-zinc-500"],
                ["COMET", "border-cyan-700/70 bg-cyan-950/60 text-cyan-200", "border-zinc-800 bg-zinc-950/70 text-zinc-500"],
                ["ARTIFACT", "border-zinc-600 bg-zinc-900/80 text-zinc-300", "border-zinc-900 bg-zinc-950/70 text-zinc-600"],
              ] as const
            ).map(([cls, onCls, offCls]) => {
              const enabled = classFilter[cls];
              return (
                <button
                  key={cls}
                  onClick={() =>
                    setClassFilter((prev) => ({ ...prev, [cls]: !prev[cls] }))
                  }
                  className={`rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider transition-colors ${
                    enabled ? onCls : offCls
                  }`}
                  aria-pressed={enabled}
                  title={`${enabled ? "Hide" : "Show"} ${cls} class candidates`}
                >
                  {enabled ? "" : "✕ "}{cls}
                </button>
              );
            })}
            <span className="mx-1 h-3 w-px bg-zinc-700" />
            <button
              onClick={() => setShowContext((v) => !v)}
              className={`rounded-full border px-3 py-0.5 font-mono text-[10px] uppercase tracking-widest transition-colors ${
                showContext
                  ? "border-zinc-700 bg-zinc-950/80 text-zinc-300 hover:bg-zinc-900"
                  : "border-blue-700/80 bg-blue-950/70 text-blue-200 hover:bg-blue-900/70"
              }`}
              title={
                showContext
                  ? "Hide context — show only candidates needing a decision tonight"
                  : "Show full sphere — famous NEOs + every catalogued tracklet"
              }
              aria-pressed={!showContext}
            >
              {showContext ? "👁 Context" : "🎯 Triage focus"}
            </button>
          </div>
        )}

        {viewMode === "sky" ? (
          <>
            {/* Compact legend — moved to LEFT side so it never collides
                with the candidate-details panel that slides in from the
                right. Torino dots = candidate hazard colour (the marker
                fill); Opus rings = expert-review verdict (the halo around
                the marker). */}
            <div className="pointer-events-none absolute left-4 top-12 z-10 flex flex-col gap-2 rounded border border-zinc-800/80 bg-zinc-950/80 px-2.5 py-1.5 text-[9px] font-mono uppercase tracking-wider text-zinc-400 backdrop-blur-sm">
              <div className="flex flex-col gap-0.5">
                <span className="text-[8px] text-zinc-600">marker · Torino</span>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
                  <span>3+</span>
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-500 ml-2" />
                  <span>2</span>
                  <span className="inline-block h-2 w-2 rounded-full bg-blue-500 ml-2" />
                  <span>routine</span>
                </div>
              </div>
              <div className="flex flex-col gap-0.5 border-t border-zinc-800/60 pt-1">
                <span className="text-[8px] text-zinc-600">ring · Opus verdict</span>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-full border border-emerald-400" />
                  <span>concur</span>
                  <span className="inline-block h-2.5 w-2.5 rounded-full border border-amber-400 ml-2" />
                  <span>partial</span>
                  <span className="inline-block h-2.5 w-2.5 rounded-full border border-purple-400 ml-2 animate-pulse" />
                  <span>dissent</span>
                </div>
              </div>
              <div
                className="flex flex-col gap-0.5 border-t border-zinc-800/60 pt-1"
                title="Find_Orb-style astrometric quality. A bright = high-confidence data; F dim = pursue or accept loss."
              >
                <span className="text-[8px] text-zinc-600">outer · quality</span>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-emerald-400" />
                  <span>A</span>
                  <span className="inline-block h-2.5 w-2.5 rounded-full border border-amber-400 opacity-70 ml-2" />
                  <span>B</span>
                  <span className="inline-block h-2.5 w-2.5 rounded-full border border-orange-400 opacity-50 ml-2" />
                  <span>C</span>
                  <span className="inline-block h-2.5 w-2.5 rounded-full border border-rose-400 opacity-30 ml-2" />
                  <span>F</span>
                </div>
              </div>
            </div>
            <div className="pointer-events-none absolute bottom-3 left-4 z-10 text-[9px] font-mono uppercase tracking-wider text-zinc-600">
              Drag to rotate · scroll to zoom · <span className="text-zinc-400">click any object to reveal its orbit</span>
            </div>
            <div className="pointer-events-none absolute bottom-3 right-4 z-10 text-[9px] font-mono uppercase tracking-wider text-zinc-600">
              <span className="text-violet-500/80">— —</span> ecliptic ·{" "}
              <span className="text-slate-500/80">— —</span> celestial equator
            </div>
            <SkyViewPanel
              candidates={visibleCandidates}
              selectedTrksub={inspectedTrksub}
              onCandidateClick={handleCandidateClick}
              onFamousNEOClick={handleFamousNEOClick}
              selectedFamousNEODesignation={inspectedFamousDesignation}
              showContext={showContext}
              onDeselect={() => {
                setInspectedTrksub(null);
                setInspectedFamousDesignation(null);
              }}
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

      {/* BOTTOM — NASA EYES CONTEXT (collapsible).
          Default: thin 36 px bar with chevron + label.
          Expanded: 38vh panel (the previous default height).
          Click the bar to slide between states. */}
      <button
        onClick={() => setNasaExpanded((v) => !v)}
        className="flex w-full flex-none items-center justify-between border-t border-zinc-800 bg-zinc-950/90 px-4 py-2 text-left transition-colors hover:bg-zinc-900"
        aria-expanded={nasaExpanded}
        aria-controls="nasa-eyes-panel"
      >
        <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">
          NASA Eyes on Asteroids · 37k+ NEO population
        </span>
        <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
          <span>{nasaExpanded ? "click to collapse" : "click to expand"}</span>
          <span aria-hidden>{nasaExpanded ? "▼" : "▲"}</span>
        </span>
      </button>
      <div
        id="nasa-eyes-panel"
        className={`relative flex-none overflow-hidden bg-black transition-all duration-300 ease-out ${
          nasaExpanded ? "h-[38vh] min-h-[260px]" : "h-0"
        }`}
        aria-hidden={!nasaExpanded}
      >
        <div className="pointer-events-none absolute bottom-3 left-4 z-10 hidden max-w-md rounded bg-black/60 p-2 text-[10px] text-zinc-400 backdrop-blur-sm sm:block">
          Above: what <em>we</em> are watching. Below: the full catalog NASA/JPL
          tracks in 2026 — every labelled point is a known NEO. Rubin
          Observatory will add ~130 new candidates per night starting 2027.
          Follow-up capacity doesn't scale 8×. That's the problem neo-triage
          exists to solve.
        </div>
        <div className="absolute right-4 top-3 z-10 flex gap-2">
          <button
            onClick={() => setForceStaticContext((v) => !v)}
            className={`rounded border px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider transition-colors ${
              forceStaticContext
                ? "border-violet-700 bg-violet-950/60 text-violet-200"
                : "border-zinc-700 bg-zinc-900/80 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            }`}
            aria-label="Toggle between live iframe and static screenshot"
          >
            {forceStaticContext ? "⏸ static" : "▶ live"}
          </button>
          <a
            href={NASA_EYES_URL}
            target="_blank"
            rel="noreferrer"
            className="rounded border border-zinc-700 bg-zinc-900/80 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-zinc-300 hover:bg-zinc-800 hover:text-white"
          >
            Open in new tab ↗
          </a>
        </div>
        {useStaticContext ? (
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
